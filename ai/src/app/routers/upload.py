import logging
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile

from src.app.utils.s3_client import S3Client, S3ClientError
from src.models.upload import UploadResponse

logger = logging.getLogger(__name__)

router = APIRouter()

PRESIGNED_URL_EXPIRY_SECONDS = 3600


def _build_bucket_key(file_name: str | None) -> str:
    suffix = Path(file_name or "").suffix.lower()
    return f"uploads/{uuid4().hex}{suffix}"


@router.post("/upload", response_model=UploadResponse)
async def upload(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="file name is required")

    body = await file.read()
    if not body:
        raise HTTPException(status_code=400, detail="file is empty")

    bucket_key = _build_bucket_key(file.filename)
    s3_client = S3Client()

    try:
        s3_client.put_object(
            bucket_key=bucket_key,
            body=body,
            content_type=file.content_type,
        )
        presigned_url = s3_client.presign_get_url(
            bucket_key,
            expires_in=PRESIGNED_URL_EXPIRY_SECONDS,
        )
    except S3ClientError as exc:
        logger.exception(
            "upload failed filename=%s content_type=%s bucket_key=%s size_bytes=%s",
            file.filename,
            file.content_type,
            bucket_key,
            len(body),
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception(
            "upload unexpected failure filename=%s content_type=%s bucket_key=%s size_bytes=%s",
            file.filename,
            file.content_type,
            bucket_key,
            len(body),
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return UploadResponse(bucketKey=bucket_key, presignedUrl=presigned_url)
