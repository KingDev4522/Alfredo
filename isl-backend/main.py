from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import torch
from faster_whisper import WhisperModel
from utils.splitter import get_t5_model_and_tokenizer
from routers import documents, media, stream, pose_import, text_input, database

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Lifespan Startup: Detecting Device...")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device selected: {device}")
    
    compute_type = "int8_float16" if device == "cuda" else "int8"
    
    print("Loading WhisperModel...")
    app.state.whisper_model = WhisperModel("large-v3", device=device, compute_type=compute_type)
    print("WhisperModel loaded successfully.")
    
    print("Loading FLAN-T5 Pipeline...")
    app.state.translator = get_t5_model_and_tokenizer()
    print("FLAN-T5 Pipeline loaded successfully.")
    
    yield
    
    print("Lifespan Shutdown: Cleaning up models...")
    app.state.whisper_model = None
    app.state.translator = None

app = FastAPI(title="ISL Interpreter Backend - Tab 2 Gateways", lifespan=lifespan)

# Add CORSMiddleware explicitly allowing the Vite dev server origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the ingestion gateway routers
app.include_router(documents.router)
app.include_router(media.router)
app.include_router(stream.router)
app.include_router(pose_import.router)
app.include_router(text_input.router)
app.include_router(database.router)

@app.get("/")
async def root():
    return {"message": "ISL Interpreter Backend API is running."}
