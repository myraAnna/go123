import base64
import re
from pathlib import Path

SUPPORTED_IMAGE_TYPES = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}


def normalize_content_type(
    declared_content_type: str | None,
    file_name: str,
    content_bytes: bytes,
) -> str:
    if (
        declared_content_type in SUPPORTED_IMAGE_TYPES
        or declared_content_type == "application/pdf"
    ):
        return declared_content_type

    if content_bytes.startswith(b"%PDF"):
        return "application/pdf"
    if content_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content_bytes.startswith(b"GIF87a") or content_bytes.startswith(b"GIF89a"):
        return "image/gif"
    if content_bytes.startswith(b"RIFF") and content_bytes[8:12] == b"WEBP":
        return "image/webp"

    suffix = Path(file_name).suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".png":
        return "image/png"
    if suffix == ".gif":
        return "image/gif"
    if suffix == ".webp":
        return "image/webp"
    if suffix == ".pdf":
        return "application/pdf"

    raise ValueError(
        f"Unsupported file type for '{file_name}'. Only images and PDFs are allowed."
    )


def _sanitize_document_name(file_name: str) -> str:
    stem = Path(file_name).stem or "menu_document"
    cleaned = re.sub(r"[^A-Za-z0-9_\-\[\]\(\) ]+", "_", stem).strip()
    return cleaned[:64] or "menu_document"


def build_chat_text_block(text: str) -> dict[str, str]:
    return {"type": "text", "text": text}


def build_chat_attachment_block(
    *,
    file_name: str,
    content_type: str,
    content_bytes: bytes,
) -> dict[str, object]:
    if not content_bytes:
        raise ValueError(f"Attachment '{file_name}' is empty.")

    encoded_bytes = base64.b64encode(content_bytes).decode("utf-8")

    if content_type == "application/pdf":
        return {
            "type": "file",
            "mime_type": "application/pdf",
            "base64": encoded_bytes,
            "name": _sanitize_document_name(file_name),
        }

    if content_type not in SUPPORTED_IMAGE_TYPES:
        raise ValueError(
            (
                f"Unsupported content type '{content_type}'. Only images and PDFs "
                "are allowed."
            )
        )

    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": content_type,
            "data": encoded_bytes,
        },
    }
