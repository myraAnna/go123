from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    bucketKey: str = Field(min_length=1)
    presignedUrl: str = Field(min_length=1)

