import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field


def _load_project_env() -> None:
    script_path = Path(__file__).resolve()

    for parent in script_path.parents:
        env_path = parent / ".env"
        if env_path.exists():
            load_dotenv(env_path, override=False)
            return


class Config(BaseModel):
    llm_primary_provider: str = Field(default="bedrock")
    llm_fallback_provider: str | None = None
    bedrock_region: str = Field(default="ap-southeast-1")
    bedrock_model: str = Field(default="anthropic.claude-3-haiku-20240307-v1:0")
    bedrock_api_key: str | None = None
    gemini_api_key: str | None = None
    gemini_model: str = Field(default="gemini-2.5-flash")
    openai_api_key: str | None = None
    openai_model: str = Field(default="gpt-4.1-mini")
    openai_base_url: str | None = None
    database_url: str | None = None
    backend_ip: str = Field(default="127.0.0.1")
    backend_port: int = Field(default=3001)
    s3_bucket: str | None = None
    s3_region: str = Field(default="ap-southeast-1")
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_session_token: str | None = None
    s3_endpoint_url: str | None = None
    fake_mode: bool = False


@lru_cache(maxsize=1)
def get_config() -> Config:
    _load_project_env()
    return Config(
        llm_primary_provider=os.getenv("LLM_PRIMARY_PROVIDER") or "bedrock",
        llm_fallback_provider=os.getenv("LLM_FALLBACK_PROVIDER"),
        bedrock_region=os.getenv("BEDROCK_REGION") or "ap-southeast-1",
        bedrock_model=(
            os.getenv("BEDROCK_MODEL")
            or "anthropic.claude-3-haiku-20240307-v1:0"
        ),
        bedrock_api_key=os.getenv("BEDROCK_API_KEY"),
        gemini_api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"),
        gemini_model=os.getenv("GEMINI_MODEL") or "gemini-2.5-flash",
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_model=os.getenv("OPENAI_MODEL") or "gpt-4.1-mini",
        openai_base_url=os.getenv("OPENAI_BASE_URL"),
        database_url=os.getenv("DATABASE_URL"),
        backend_ip=os.getenv("BACKEND_IP") or "127.0.0.1",
        backend_port=int(os.getenv("BACKEND_PORT") or "3001"),
        s3_bucket=os.getenv("S3_BUCKET") or os.getenv("AWS_S3_BUCKET"),
        s3_region=(
            os.getenv("S3_REGION")
            or os.getenv("AWS_S3_REGION")
            or "ap-southeast-1"
        ),
        s3_access_key_id=(
            os.getenv("S3_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID")
        ),
        s3_secret_access_key=(
            os.getenv("S3_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_ACCESS_KEY")
        ),
        s3_session_token=(
            os.getenv("S3_SESSION_TOKEN") or os.getenv("AWS_SESSION_TOKEN")
        ),
        s3_endpoint_url=os.getenv("S3_ENDPOINT_URL"),
        fake_mode=os.getenv("FAKE_MODE") == "1",
    )


config = get_config()
