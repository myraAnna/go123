import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.app.routers import ask, chat_sessions, parse_menu, suggest_questions, upload

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

app = FastAPI(
    title="Warung AI Service",
    description="AI service for menu parsing and conversational analytics",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_sessions.router, prefix="/v1", tags=["chat"])
app.include_router(ask.router, prefix="/v1", tags=["chat"])
app.include_router(suggest_questions.router, prefix="/v1", tags=["chat"])
app.include_router(parse_menu.router, prefix="/v1", tags=["menu"])
app.include_router(upload.router, prefix="/v1", tags=["files"])
# app.include_router(anomaly.router, prefix="/v1", tags=["anomaly"])


@app.get("/health")
def health():
    mode = "fake" if os.getenv("FAKE_MODE") == "1" else "real"
    return {
        "ok": True,
        "service": "ai",
        "version": "0.1.0",
        "mode": mode,
    }
