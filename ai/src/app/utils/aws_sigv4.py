import hashlib
import hmac
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import parse_qsl, quote, urlsplit, urlunsplit

EMPTY_PAYLOAD_SHA256 = hashlib.sha256(b"").hexdigest()
UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD"


@dataclass(frozen=True)
class SignedRequest:
    url: str
    headers: dict[str, str]


def _sign(key: bytes, message: str) -> bytes:
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()


def _derive_signing_key(secret_access_key: str, date_stamp: str, region: str) -> bytes:
    k_date = _sign(f"AWS4{secret_access_key}".encode("utf-8"), date_stamp)
    k_region = _sign(k_date, region)
    k_service = _sign(k_region, "s3")
    return _sign(k_service, "aws4_request")


def _uri_encode(value: str) -> str:
    return quote(value, safe="-_.~")


def _canonical_query_string(query: str) -> str:
    if not query:
        return ""

    items = parse_qsl(query, keep_blank_values=True)
    return _canonical_query_params(items)


def _canonical_query_params(items: list[tuple[str, str]]) -> str:
    encoded_items = [(_uri_encode(key), _uri_encode(value)) for key, value in items]
    encoded_items.sort()
    return "&".join(f"{key}={value}" for key, value in encoded_items)


def sign_s3_request(
    *,
    method: str,
    url: str,
    region: str,
    access_key_id: str,
    secret_access_key: str,
    payload_hash: str = EMPTY_PAYLOAD_SHA256,
    extra_headers: dict[str, str] | None = None,
    session_token: str | None = None,
) -> SignedRequest:
    now = datetime.now(UTC)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")

    split_url = urlsplit(url)
    canonical_uri = quote(split_url.path or "/", safe="/-_.~")
    canonical_query = _canonical_query_string(split_url.query)

    headers = {
        "host": split_url.netloc,
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
    }
    if extra_headers:
        headers.update({name.lower(): value for name, value in extra_headers.items()})
    if session_token:
        headers["x-amz-security-token"] = session_token

    canonical_headers = "".join(
        f"{name}:{headers[name]}\n" for name in sorted(headers)
    )
    signed_headers = ";".join(sorted(headers))
    canonical_request = "\n".join(
        [
            method.upper(),
            canonical_uri,
            canonical_query,
            canonical_headers,
            signed_headers,
            payload_hash,
        ]
    )
    credential_scope = f"{date_stamp}/{region}/s3/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    signing_key = _derive_signing_key(secret_access_key, date_stamp, region)
    signature = hmac.new(
        signing_key,
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    authorization = (
        "AWS4-HMAC-SHA256 "
        f"Credential={access_key_id}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )

    final_headers = {**headers, "Authorization": authorization}
    return SignedRequest(url=url, headers=final_headers)


def presign_s3_get_url(
    *,
    url: str,
    region: str,
    access_key_id: str,
    secret_access_key: str,
    expires_in: int = 3600,
    session_token: str | None = None,
) -> str:
    now = datetime.now(UTC)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    credential_scope = f"{date_stamp}/{region}/s3/aws4_request"

    split_url = urlsplit(url)
    canonical_uri = quote(split_url.path or "/", safe="/-_.~")
    query_items = parse_qsl(split_url.query, keep_blank_values=True)
    query_items.extend(
        [
            ("X-Amz-Algorithm", "AWS4-HMAC-SHA256"),
            ("X-Amz-Credential", f"{access_key_id}/{credential_scope}"),
            ("X-Amz-Date", amz_date),
            ("X-Amz-Expires", str(expires_in)),
            ("X-Amz-SignedHeaders", "host"),
        ]
    )
    if session_token:
        query_items.append(("X-Amz-Security-Token", session_token))

    canonical_query = _canonical_query_params(query_items)
    canonical_headers = f"host:{split_url.netloc}\n"
    canonical_request = "\n".join(
        [
            "GET",
            canonical_uri,
            canonical_query,
            canonical_headers,
            "host",
            UNSIGNED_PAYLOAD,
        ]
    )
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    signing_key = _derive_signing_key(secret_access_key, date_stamp, region)
    signature = hmac.new(
        signing_key,
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    final_query = f"{canonical_query}&X-Amz-Signature={signature}"
    return urlunsplit(
        (
            split_url.scheme,
            split_url.netloc,
            split_url.path,
            final_query,
            split_url.fragment,
        )
    )


def sign_s3_get_request(
    *,
    url: str,
    region: str,
    access_key_id: str,
    secret_access_key: str,
    session_token: str | None = None,
) -> SignedRequest:
    return sign_s3_request(
        method="GET",
        url=url,
        region=region,
        access_key_id=access_key_id,
        secret_access_key=secret_access_key,
        session_token=session_token,
    )

