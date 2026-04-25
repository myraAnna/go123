import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlsplit
from urllib.request import Request, urlopen


class URLFetchError(RuntimeError):
    pass


@dataclass(frozen=True)
class URLObject:
    source_url: str
    file_name: str
    content_type: str | None
    body: bytes


def _extract_filename_from_content_disposition(
    header_value: str | None,
) -> str | None:
    if not header_value:
        return None

    match = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";]+)"?', header_value)
    if not match:
        return None

    return unquote(match.group(1)).strip() or None


def _infer_file_name(source_url: str, content_disposition: str | None) -> str:
    file_name = _extract_filename_from_content_disposition(content_disposition)
    if file_name:
        return file_name

    url_path = unquote(urlsplit(source_url).path)
    return Path(url_path).name or "uploaded-file"


def fetch_url(source_url: str) -> URLObject:
    request = Request(source_url, method="GET")

    try:
        with urlopen(request, timeout=15) as response:
            content_type = response.headers.get_content_type()
            content_disposition = response.headers.get("Content-Disposition")
            body = response.read()
    except Exception as exc:
        raise URLFetchError(f"Failed to fetch URL '{source_url}': {exc}") from exc

    return URLObject(
        source_url=source_url,
        file_name=_infer_file_name(source_url, content_disposition),
        content_type=content_type,
        body=body,
    )
