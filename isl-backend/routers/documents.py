import io
import pymupdf as fitz
import docx
import uuid
from fastapi import APIRouter, UploadFile, HTTPException, File, BackgroundTasks
from starlette.concurrency import run_in_threadpool
from utils.splitter import recursive_token_splitter
from utils.job_manager import init_job, set_total_chunks, push_text_chunk

router = APIRouter()

def parse_document_sync(file_bytes: bytes, filename: str) -> str:
    """
    Synchronous blocking function to parse PDFs and DOCX files.
    MUST be run in a threadpool to avoid blocking the event loop.
    """
    text = ""
    filename_lower = filename.lower()
    
    if filename_lower.endswith(".pdf"):
        # Load PDF from memory bytes
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        for page in doc:
            text += str(page.get_text("text")) + "\n"
        doc.close()
    elif filename_lower.endswith(".docx"):
        # Load Word doc from memory bytes
        doc = docx.Document(io.BytesIO(file_bytes))
        for para in doc.paragraphs:
            text += para.text + "\n"
    elif filename_lower.endswith(".txt"):
        text = file_bytes.decode('utf-8', errors='ignore')
    else:
        raise ValueError(f"Unsupported file format: {filename}")
        
    return text

async def process_document_background(job_id: str, file_bytes: bytes, filename: str):
    try:
        extracted_text = await run_in_threadpool(parse_document_sync, file_bytes, filename)
        
        # Split text using the token-aware recursive splitter
        chunks = await run_in_threadpool(recursive_token_splitter, extracted_text)
        
        await set_total_chunks(job_id, len(chunks))
        
        for chunk in chunks:
            await push_text_chunk(job_id, chunk)
            
    except Exception as e:
        print(f"Error in background document task {job_id}: {e}")
    finally:
        await push_text_chunk(job_id, None) # EOF Signal

@router.post("/api/upload-doc")
async def upload_doc(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        
        # 1. Parse document safely in a thread pool
        safe_filename = file.filename if file.filename else "unknown"
        
        job_id = str(uuid.uuid4())
        await init_job(job_id)
        background_tasks.add_task(process_document_background, job_id, file_bytes, safe_filename)
        
        return {"job_id": job_id, "status": "processing"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
