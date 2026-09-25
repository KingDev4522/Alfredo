import asyncio
import uuid
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from utils.splitter import recursive_token_splitter
from utils.job_manager import init_job, set_total_chunks, push_text_chunk

router = APIRouter()

class TextRequest(BaseModel):
    text: str

async def process_text_background(job_id: str, text: str):
    try:
        chunks = recursive_token_splitter(text)
        await set_total_chunks(job_id, len(chunks))
        for chunk in chunks:
            await push_text_chunk(job_id, chunk)
    except Exception as e:
        print(f"Error processing text for job {job_id}: {e}")
    finally:
        await push_text_chunk(job_id, None)

@router.post("/api/process-text")
async def process_text(request: TextRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    await init_job(job_id)
    background_tasks.add_task(process_text_background, job_id, request.text)
    return {"job_id": job_id, "status": "processing"}
