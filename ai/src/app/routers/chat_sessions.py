import logging

from fastapi import APIRouter, HTTPException, Query, status

from src.app.session_store import (
    DEFAULT_TIME_ZONE,
    SessionStoreError,
    create_session,
    list_messages,
)
from src.models.chat import (
    CreateChatSessionRequest,
    CreateChatSessionResponse,
    GetChatSessionMessagesRequest,
    GetChatSessionMessagesResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/chat/sessions",
    response_model=CreateChatSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_chat_session_route(request: CreateChatSessionRequest):
    try:
        session_id = create_session(
            merchant_id=request.merchantId,
            time_zone=DEFAULT_TIME_ZONE,
        )
    except SessionStoreError as exc:
        logger.exception(
            "create session failed merchantId=%s",
            request.merchantId,
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return CreateChatSessionResponse(sessionId=session_id)


@router.get(
    "/chat/sessions/{session_id}/messages",
    response_model=GetChatSessionMessagesResponse,
)
def get_chat_session_messages(
    session_id: str,
    merchantId: str = Query(..., min_length=1),
):
    request = GetChatSessionMessagesRequest(
        sessionId=session_id,
        merchantId=merchantId,
    )

    try:
        messages = list_messages(request.sessionId, request.merchantId)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="unknown sessionId") from exc
    except PermissionError as exc:
        raise HTTPException(
            status_code=409,
            detail="session does not belong to the supplied merchantId",
        ) from exc
    except SessionStoreError as exc:
        logger.exception(
            "list session messages failed sessionId=%s merchantId=%s",
            request.sessionId,
            request.merchantId,
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return GetChatSessionMessagesResponse(
        sessionId=request.sessionId,
        messages=messages,
    )
