import logging

from fastapi import APIRouter, HTTPException
from langchain_core.messages import HumanMessage

from src.app.agents.prompts import render_prompt
from src.app.deps import get_config
from src.app.utils.bedrock_client import BedrockClientError, ChatBedrockClient
from src.app.utils.file_sniff import (
    build_chat_attachment_block,
    build_chat_text_block,
    normalize_content_type,
)
from src.app.utils.s3_client import S3Client, S3ClientError
from src.app.utils.url_fetch import URLFetchError, fetch_url
from src.models.menu import ParseMenuItemDraft, ParseMenuRequest, ParseMenuResponse

logger = logging.getLogger(__name__)

router = APIRouter()


def _build_fake_items() -> list[ParseMenuItemDraft]:
    return [
        ParseMenuItemDraft(
            name="Nasi Lemak",
            priceCents=500,
            category="main",
            description="Coconut rice with sambal and basic condiments.",
        ),
        ParseMenuItemDraft(
            name="Teh Tarik",
            priceCents=200,
            category="drink",
            description="Pulled milk tea.",
        ),
    ]


def _dedupe_items(items: list[ParseMenuItemDraft]) -> list[ParseMenuItemDraft]:
    deduped_items: list[ParseMenuItemDraft] = []
    seen_keys: set[tuple[str, int]] = set()

    for item in items:
        dedupe_key = (item.name.casefold(), item.priceCents)
        if dedupe_key in seen_keys:
            continue
        seen_keys.add(dedupe_key)
        deduped_items.append(item)

    return deduped_items


def _extract_menu_items(request: ParseMenuRequest) -> ParseMenuResponse:
    config = get_config()
    bedrock = ChatBedrockClient(
        region=config.bedrock_region,
        model=config.bedrock_model,
    )
    s3_client: S3Client | None = None
    content_blocks: list[dict[str, object]] = [
        build_chat_text_block(
            render_prompt(
                "menu-extract.txt",
                transcript=request.text or "No extra transcript provided.",
            )
        )
    ]

    logger.info(
        (
            "extract_menu.start text_present=%s file_count=%s "
            "url_count=%s model=%s region=%s"
        ),
        bool(request.text),
        len(request.files),
        len(request.urls),
        config.bedrock_model,
        config.bedrock_region,
    )

    for bucket_key in request.files:
        if s3_client is None:
            s3_client = S3Client(config)
        s3_object = s3_client.get_object(bucket_key)
        content_type = normalize_content_type(
            s3_object.content_type,
            s3_object.file_name,
            s3_object.body,
        )
        logger.info(
            (
                "extract_menu.s3_attachment bucket_key=%s file_name=%s "
                "content_type=%s size_bytes=%s"
            ),
            bucket_key,
            s3_object.file_name,
            content_type,
            len(s3_object.body),
        )
        content_blocks.append(
            build_chat_attachment_block(
                file_name=s3_object.file_name,
                content_type=content_type,
                content_bytes=s3_object.body,
            )
        )

    for source_url in request.urls:
        url_object = fetch_url(str(source_url))
        content_type = normalize_content_type(
            url_object.content_type,
            url_object.file_name,
            url_object.body,
        )
        logger.info(
            (
                "extract_menu.url_attachment source_url=%s file_name=%s "
                "content_type=%s size_bytes=%s"
            ),
            source_url,
            url_object.file_name,
            content_type,
            len(url_object.body),
        )
        content_blocks.append(
            build_chat_attachment_block(
                file_name=url_object.file_name,
                content_type=content_type,
                content_bytes=url_object.body,
            )
        )

    response = bedrock.invoke_structured(
        [HumanMessage(content=content_blocks)],
        ParseMenuResponse,
        max_tokens=1200,
        temperature=0.0,
    )
    logger.info("extract_menu.model_response item_count=%s", len(response.items))
    return response


@router.post("/onboarding/extract-menu", response_model=ParseMenuResponse)
def parse_menu(request: ParseMenuRequest):
    if get_config().fake_mode:
        return ParseMenuResponse(items=_build_fake_items())

    try:
        response = _extract_menu_items(request)
        logger.info(f"response: {response}")
    except ValueError as exc:
        logger.warning(
            (
                "extract_menu.bad_request text_present=%s file_count=%s "
                "url_count=%s error=%s"
            ),
            bool(request.text),
            len(request.files),
            len(request.urls),
            str(exc),
        )
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (BedrockClientError, S3ClientError, URLFetchError) as exc:
        logger.exception(
            "extract_menu.failed text_present=%s file_count=%s url_count=%s",
            bool(request.text),
            len(request.files),
            len(request.urls),
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    items = _dedupe_items(response.items)
    if not items:
        logger.info(
            "extract_menu.no_items text_present=%s file_count=%s url_count=%s",
            bool(request.text),
            len(request.files),
            len(request.urls),
        )
        return ParseMenuResponse(items=[])

    logger.info(
        "extract_menu.success item_count=%s deduped_item_count=%s",
        len(response.items),
        len(items),
    )
    return ParseMenuResponse(items=items)
