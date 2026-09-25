import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from utils.job_manager import (
    init_job, 
    add_chunk_to_buffer, 
    ack_chunk, 
    get_missed_chunks, 
    get_job_state, 
    update_job_status,
    get_text_chunk
)
from utils.ai_pipeline import translate_and_generate_poses
from utils.model_registry import ModelUnavailableError, get_translator

router = APIRouter()

@router.websocket("/ws/stream")
async def websocket_stream(
    websocket: WebSocket, 
    job_id: str = Query(...), 
    resume_from: int = Query(0)
):
    await websocket.accept()
    
    # 1. Initialize or resume job
    await init_job(job_id)
    
    # Handle Reconnection: immediately replay missed chunks from buffer
    if resume_from > 0:
        missed_chunks = await get_missed_chunks(job_id, resume_from)
        for chunk in missed_chunks:
            try:
                await websocket.send_json(chunk)
            except WebSocketDisconnect:
                return

    current_timestamp_ms = 0
    # Global chunk_id counter for this connection session
    # If resuming, start counting from max known generated ID + 1 to avoid overwrite
    state = await get_job_state(job_id)
    current_chunk_id = max(0, state["last_generated_chunk_id"] + 1) if state else 0

    # Resolved once per connection: loads the cached model on first use.
    # If unavailable, translator stays None and the pipeline animates the
    # input words directly (DB lookup + fingerspelling) instead of failing.
    try:
        translator = get_translator(websocket.app)
    except ModelUnavailableError as e:
        print(f"[stream] {e}")
        translator = None

    async def sender_task():
        nonlocal current_timestamp_ms, current_chunk_id
        
        processed_count = 0
        
        while True:
            text_chunk = await get_text_chunk(job_id)
            if text_chunk is None:
                break
                
            # Pass chunk into the AI Pipeline
            async for pose_data in translate_and_generate_poses(text_chunk, translator):
                
                # --- BACKPRESSURE LOGIC ---
                while True:
                    job_state = await get_job_state(job_id)
                    if not job_state:
                        return # Job invalid/cancelled
                    
                    # Compute unacknowledged chunks
                    unacked_count = job_state["last_generated_chunk_id"] - job_state["last_acked_chunk_id"]
                    
                    if unacked_count >= 5:
                        await asyncio.sleep(0.1)  # Buffer full, wait for React ACKs
                    else:
                        break
                # --------------------------

                payload = {
                    "type": "pose_chunk",
                    "chunk_id": current_chunk_id,
                    "gloss_word": pose_data["gloss_word"],
                    "timestamp_ms": current_timestamp_ms,
                    "frames": pose_data["frames"],
                    "duration_ms": pose_data["duration_ms"],
                    "is_fingerspelling": pose_data["is_fingerspelling"],
                    "is_last_chunk": False # Final chunk sent after loops
                }
                
                # Buffer the chunk for potential reconnects
                await add_chunk_to_buffer(job_id, current_chunk_id, payload)
                
                try:
                    await websocket.send_json(payload)
                except Exception:
                    return # Connection dropped, receiver task handles disconnect
                
                # Increment timestamp based on actual frame count
                frames = pose_data.get("frames")
                duration = pose_data.get("duration_ms")
                if isinstance(frames, list) and isinstance(duration, int):
                    current_timestamp_ms += len(frames) * duration
                current_chunk_id += 1
            
            processed_count += 1
            job_state = await get_job_state(job_id)
            if job_state and job_state["total_chunks"] > 0:
                progress = int((processed_count / job_state["total_chunks"]) * 100)
                try:
                    await websocket.send_json({"type": "progress", "percent": progress})
                except Exception:
                    return
                
        # --- TERMINATION CHUNK ---
        try:
            final_payload = {
                "type": "pose_chunk",
                "chunk_id": current_chunk_id,
                "is_last_chunk": True,
                "frames": [],
                "gloss_word": "",
                "duration_ms": 0
            }
            await websocket.send_json(final_payload)
            await update_job_status(job_id, "complete")
        except Exception:
            pass
        finally:
            # Graceful close handshake so clients see a proper close frame
            # instead of a dropped TCP connection (browser onclose fires cleanly
            # and useSignStream won't mistake it for a network failure).
            try:
                await websocket.close()
            except Exception:
                pass

    async def receiver_task():
        try:
            while True:
                data = await websocket.receive_json()
                if data.get("type") == "ack":
                    received_job = data.get("job_id")
                    received_chunk = data.get("chunk_id")
                    if received_job == job_id and received_chunk is not None:
                        # Clear chunk from memory
                        await ack_chunk(job_id, received_chunk)
        except WebSocketDisconnect:
            print(f"WebSocket disconnected for Job: {job_id}. Pausing job and retaining buffer.")
            await update_job_status(job_id, "paused")

    # Run tasks concurrently
    s_task = asyncio.create_task(sender_task())
    r_task = asyncio.create_task(receiver_task())
    
    # Wait until one task finishes (either normal completion or disconnect)
    done, pending = await asyncio.wait(
        [s_task, r_task],
        return_when=asyncio.FIRST_COMPLETED
    )
    
    # Cancel remaining tasks to prevent zombies
    for t in pending:
        t.cancel()
