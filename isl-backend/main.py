from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from routers import documents, media, stream, pose_import, text_input, database, sentence

# Heavy models (Whisper, FLAN-T5) load lazily on first use via
# utils.model_registry -- NOT in the lifespan. Loading them at startup blocked
# the whole API for 10+ minutes (multi-GB downloads), and on networks where
# HuggingFace file hosts are unreachable the server never came online at all.
# Re-exported here so `from main import get_whisper_model` keeps working.
from utils.model_registry import get_translator, get_whisper_model  # noqa: F401,E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Lifespan Startup: models will load lazily on first use.", flush=True)
    app.state.whisper_model = None
    app.state.translator = None

    yield

    print("Lifespan Shutdown: Cleaning up models...", flush=True)
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
app.include_router(sentence.router)

@app.get("/")
async def root():
    return {"message": "ISL Interpreter Backend API is running."}
