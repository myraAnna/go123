import hashlib
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

from src.app.deps import Config, get_config
from src.app.utils.aws_sigv4 import (
    presign_s3_get_url,
    sign_s3_get_request,
    sign_s3_request,
)


class S3ClientError(RuntimeError):
    pass


@dataclass(frozen=True)
class S3Object:
    bucket_key: str
    file_name: str
    content_type: str | None
    body: bytes


class S3Client:
    def __init__(self, config: Config | None = None):
        self.config = config or get_config()
        if not self.config.s3_bucket:
            raise S3ClientError("Missing S3_BUCKET for menu file fetches.")
        if not self.config.s3_access_key_id or not self.config.s3_secret_access_key:
            raise S3ClientError(
                "Missing S3 access keys. Set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY."
            )

    def _build_object_url(self, bucket_key: str) -> str:
        encoded_key = quote(bucket_key.lstrip("/"), safe="/-_.~")

        if self.config.s3_endpoint_url:
            base_url = self.config.s3_endpoint_url.rstrip("/")
            return f"{base_url}/{self.config.s3_bucket}/{encoded_key}"

        return (
            f"https://{self.config.s3_bucket}.s3.{self.config.s3_region}.amazonaws.com/"
            f"{encoded_key}"
        )

    def get_object(self, bucket_key: str) -> S3Object:
        signed_request = sign_s3_get_request(
            url=self._build_object_url(bucket_key),
            region=self.config.s3_region,
            access_key_id=self.config.s3_access_key_id,
            secret_access_key=self.config.s3_secret_access_key,
            session_token=self.config.s3_session_token,
        )

        request = Request(
            signed_request.url,
            headers=signed_request.headers,
            method="GET",
        )

        try:
            with urlopen(request, timeout=15) as response:
                content_type = response.headers.get_content_type()
                body = response.read()
        except Exception as exc:
            raise S3ClientError(
                f"Failed to fetch S3 object '{bucket_key}': {exc}"
            ) from exc

        return S3Object(
            bucket_key=bucket_key,
            file_name=Path(bucket_key).name or "uploaded-file",
            content_type=content_type,
            body=body,
        )

    def put_object(
        self,
        *,
        bucket_key: str,
        body: bytes,
        content_type: str | None = None,
    ) -> S3Object:
        extra_headers: dict[str, str] = {}
        if content_type:
            extra_headers["content-type"] = content_type

        signed_request = sign_s3_request(
            method="PUT",
            url=self._build_object_url(bucket_key),
            region=self.config.s3_region,
            access_key_id=self.config.s3_access_key_id,
            secret_access_key=self.config.s3_secret_access_key,
            payload_hash=hashlib.sha256(body).hexdigest(),
            extra_headers=extra_headers,
            session_token=self.config.s3_session_token,
        )

        request = Request(
            signed_request.url,
            data=body,
            headers=signed_request.headers,
            method="PUT",
        )

        try:
            with urlopen(request, timeout=15) as response:
                response_content_type = response.headers.get_content_type()
        except Exception as exc:
            raise S3ClientError(
                f"Failed to upload S3 object '{bucket_key}': {exc}"
            ) from exc

        return S3Object(
            bucket_key=bucket_key,
            file_name=Path(bucket_key).name or "uploaded-file",
            content_type=content_type or response_content_type,
            body=body,
        )

    def presign_get_url(self, bucket_key: str, expires_in: int = 3600) -> str:
        return presign_s3_get_url(
            url=self._build_object_url(bucket_key),
            region=self.config.s3_region,
            access_key_id=self.config.s3_access_key_id,
            secret_access_key=self.config.s3_secret_access_key,
            expires_in=expires_in,
            session_token=self.config.s3_session_token,
        )

