import os
import tempfile
import asyncio
import uuid
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from utils.splitter import recursive_token_splitter
from utils.job_manager import init_job, set_total_chunks, push_text_chunk

router = APIRouter()

class MediaRequest(BaseModel):
    url: str

async def process_media_background(job_id: str, url: str, whisper_model):
    temp_audio_path = None
    try:
        # Create a temp file path for the audio
        fd, temp_audio_path = tempfile.mkstemp(suffix=".mp3")
        os.close(fd) # Close file descriptor; yt-dlp will write to this path

        # 1. yt-dlp extracting audio asynchronously
        cmd = [
            "yt-dlp",
            "-x", "--audio-format", "mp3",
            "--output", temp_audio_path,
            "--force-overwrites",
            url
        ]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            raise Exception(f"yt-dlp failed: {stderr.decode('utf-8', errors='ignore')}")

        if not os.path.exists(temp_audio_path):
            raise Exception("yt-dlp did not produce the expected audio file.")

        # 2. Transcribe Audio (run in threadpool as it's blocking)
        def transcribe_audio(path: str) -> str:
            segments, info = whisper_model.transcribe(path, beam_size=5, task="translate")
            # segments is a generator, must be exhausted
            return " ".join([segment.text for segment in segments])

        transcribed_text = await run_in_threadpool(transcribe_audio, temp_audio_path)

        # 3. Split text using the token-aware recursive splitter
        chunks = await run_in_threadpool(recursive_token_splitter, transcribed_text)

        await set_total_chunks(job_id, len(chunks))
        
        for chunk in chunks:
            await push_text_chunk(job_id, chunk)

    except Exception as e:
        print(f"Error in background media task {job_id}: {e}")
    finally:
        await push_text_chunk(job_id, None) # EOF Signal
        # 4. Cleanup temporary audio file to prevent disk exhaustion
        if temp_audio_path and os.path.exists(temp_audio_path):
            try:
                os.remove(temp_audio_path)
            except OSError:
                pass

@router.post("/api/process-youtube")
async def process_youtube(req: MediaRequest, background_tasks: BackgroundTasks, request: Request):
    url = req.url
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    job_id = str(uuid.uuid4())
    await init_job(job_id)
    background_tasks.add_task(process_media_background, job_id, url, request.app.state.whisper_model)

    return {"job_id": job_id, "status": "processing"}
