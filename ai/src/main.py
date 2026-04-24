from fastapi import FastAPI
from app.routers import parse_menu, text_to_sql, anomaly
import os

app = FastAPI(
    title="Warung AI Service",
    description="AI/ML service for menu parsing and text-to-SQL",
    version="0.1.0"
)

# Include routers
app.include_router(parse_menu.router, prefix="/v1", tags=["menu"])
app.include_router(text_to_sql.router, prefix="/v1", tags=["sql"])
app.include_router(anomaly.router, prefix="/v1", tags=["anomaly"])

@app.get("/health")
def health():
    mode = "fake" if os.getenv("FAKE_MODE") == "1" else "real"
    return {
        "ok": True,
        "service": "ai",
        "version": "0.1.0",
        "mode": mode
    }
