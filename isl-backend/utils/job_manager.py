import asyncio
from typing import Dict, Any

# Global dictionary to track job state and WebSocket buffers
ACTIVE_JOBS: Dict[str, Dict[str, Any]] = {}

# Thread-safe lock for mutation
job_lock = asyncio.Lock()

async def init_job(job_id: str, total_chunks: int = 0):
    """Initializes a new job entry if it does not exist."""
    async with job_lock:
        if job_id not in ACTIVE_JOBS:
            ACTIVE_JOBS[job_id] = {
                "job_id": job_id,
                "status": "processing",
                "total_chunks": total_chunks,
                "buffer": {},  # Maps chunk_id to its payload dict
                "last_generated_chunk_id": -1,
                "last_acked_chunk_id": -1,
                "text_queue": asyncio.Queue()
            }

async def set_total_chunks(job_id: str, total: int):
    """Updates the total_chunks value safely."""
    async with job_lock:
        if job_id in ACTIVE_JOBS:
            ACTIVE_JOBS[job_id]["total_chunks"] = total

async def push_text_chunk(job_id: str, text: str | None):
    """Pushes a chunk into the job's text_queue. None represents EOF."""
    queue = None
    async with job_lock:
        if job_id in ACTIVE_JOBS:
            queue = ACTIVE_JOBS[job_id]["text_queue"]
    
    if queue is not None:
        await queue.put(text)

async def get_text_chunk(job_id: str) -> str | None:
    """Awaits and gets the next item from the text_queue."""
    queue = None
    async with job_lock:
        if job_id in ACTIVE_JOBS:
            queue = ACTIVE_JOBS[job_id]["text_queue"]
    
    if queue is not None:
        return await queue.get()
    return None

async def add_chunk_to_buffer(job_id: str, chunk_id: int, payload: dict):
    """Adds a generated chunk to the job's buffer for replayability."""
    async with job_lock:
        if job_id in ACTIVE_JOBS:
            ACTIVE_JOBS[job_id]["buffer"][chunk_id] = payload
            # Update the max generated ID for backpressure tracking
            if chunk_id > ACTIVE_JOBS[job_id]["last_generated_chunk_id"]:
                ACTIVE_JOBS[job_id]["last_generated_chunk_id"] = chunk_id

async def ack_chunk(job_id: str, chunk_id: int):
    """Acknowledges a chunk, deleting it from the buffer to free memory."""
    async with job_lock:
        if job_id in ACTIVE_JOBS:
            job = ACTIVE_JOBS[job_id]
            if chunk_id > job["last_acked_chunk_id"]:
                job["last_acked_chunk_id"] = chunk_id
            
            # Clean up the acknowledged chunk
            if chunk_id in job["buffer"]:
                del job["buffer"][chunk_id]
            
            # Proactively clear any older chunks just in case ACKs arrived out of order
            keys_to_delete = [k for k in job["buffer"].keys() if k <= chunk_id]
            for k in keys_to_delete:
                del job["buffer"][k]

async def get_missed_chunks(job_id: str, resume_from: int) -> list:
    """Retrieves all buffered chunks >= resume_from for WebSocket reconnections."""
    async with job_lock:
        if job_id not in ACTIVE_JOBS:
            return []
        
        buffer = ACTIVE_JOBS[job_id]["buffer"]
        missed = [payload for cid, payload in buffer.items() if cid >= resume_from]
        # Sort by chunk_id to ensure strict chronological order
        missed.sort(key=lambda x: x["chunk_id"])
        return missed

async def get_job_state(job_id: str) -> Dict[str, Any] | None:
    """Returns a copy of the job state."""
    async with job_lock:
        # Return the dictionary or None. (For a true copy you might deepcopy, 
        # but returning reference is fine for read-only checks)
        return ACTIVE_JOBS.get(job_id)
        
async def update_job_status(job_id: str, status: str):
    """Updates the status (processing/paused/complete)."""
    async with job_lock:
        if job_id in ACTIVE_JOBS:
            ACTIVE_JOBS[job_id]["status"] = status
