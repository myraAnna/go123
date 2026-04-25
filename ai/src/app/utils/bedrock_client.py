import logging
from typing import Literal

from langchain_aws import ChatBedrockConverse
from langchain_core.language_models import LanguageModelInput
from pydantic import BaseModel

from src.app.deps import get_config

try:
    from langchain_google_genai import ChatGoogleGenerativeAI
except ImportError:  # pragma: no cover - optional dependency
    ChatGoogleGenerativeAI = None

try:
    from langchain_openai import ChatOpenAI
except ImportError:  # pragma: no cover - optional dependency
    ChatOpenAI = None

logger = logging.getLogger(__name__)

ProviderName = Literal["bedrock", "gemini", "openai"]


class BedrockClientError(RuntimeError):
    pass


def extract_text_content(content: object) -> str:
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        text_parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                text = str(block.get("text", "")).strip()
                if text:
                    text_parts.append(text)
        return "\n".join(text_parts).strip()

    return str(content).strip()


class ChatBedrockClient:
    def __init__(self, region: str | None = None, model: str | None = None):
        config = get_config()
        self.region = region or config.bedrock_region
        self.model = model or config.bedrock_model
        self.api_key = config.bedrock_api_key

        self.primary_provider = self._normalize_provider(config.llm_primary_provider)
        configured_fallback = (
            self._normalize_provider(config.llm_fallback_provider)
            if config.llm_fallback_provider
            else None
        )

        self.gemini_api_key = config.gemini_api_key
        self.gemini_model = config.gemini_model
        self.openai_api_key = config.openai_api_key
        self.openai_model = config.openai_model
        self.openai_base_url = config.openai_base_url
        self.fallback_provider = configured_fallback or self._default_fallback_provider(
            self.primary_provider
        )

        logger.info(
            (
                "llm.client_config primary_provider=%s fallback_provider=%s "
                "primary_available=%s fallback_available=%s"
            ),
            self.primary_provider,
            self.fallback_provider,
            self._provider_is_available(self.primary_provider),
            (
                self._provider_is_available(self.fallback_provider)
                if self.fallback_provider
                else False
            ),
        )

        if self.fallback_provider and not self._provider_is_available(self.fallback_provider):
            logger.warning(
                "llm.fallback_unavailable provider=%s reason=%s",
                self.fallback_provider,
                self._provider_unavailable_reason(self.fallback_provider),
            )

        if not self._provider_is_available(self.primary_provider):
            raise BedrockClientError(
                f"Primary LLM provider '{self.primary_provider}' is unavailable: "
                f"{self._provider_unavailable_reason(self.primary_provider)}"
            )

    def _normalize_provider(self, provider: str | None) -> ProviderName:
        normalized = (provider or "bedrock").strip().lower()
        if normalized not in {"bedrock", "gemini", "openai"}:
            raise BedrockClientError(f"Unsupported LLM provider '{provider}'.")
        return normalized  # type: ignore[return-value]

    def _default_fallback_provider(
        self,
        primary_provider: ProviderName,
    ) -> ProviderName | None:
        fallback_order: dict[ProviderName, list[ProviderName]] = {
            "gemini": ["bedrock", "openai"],
            "bedrock": ["openai", "gemini"],
            "openai": ["bedrock", "gemini"],
        }
        for candidate in fallback_order[primary_provider]:
            if self._provider_is_available(candidate):
                return candidate
        return None

    def _provider_is_available(self, provider: ProviderName) -> bool:
        if provider == "bedrock":
            return bool(self.api_key)
        if provider == "gemini":
            return ChatGoogleGenerativeAI is not None and bool(self.gemini_api_key)
        return ChatOpenAI is not None and bool(self.openai_api_key)

    def _provider_unavailable_reason(self, provider: ProviderName) -> str:
        if provider == "bedrock":
            return "BEDROCK_API_KEY is not configured"
        if provider == "gemini":
            if ChatGoogleGenerativeAI is None:
                return "langchain-google-genai is not installed"
            return "GEMINI_API_KEY or GOOGLE_API_KEY is not configured"
        if ChatOpenAI is None:
            return "langchain-openai is not installed"
        return "OPENAI_API_KEY is not configured"

    def _provider_model_name(self, provider: ProviderName) -> str:
        if provider == "bedrock":
            return self.model
        if provider == "gemini":
            return self.gemini_model
        return self.openai_model

    def _build_model(
        self,
        provider: ProviderName,
        *,
        max_tokens: int,
        temperature: float,
    ):
        if provider == "bedrock":
            return ChatBedrockConverse(
                model=self.model,
                region_name=self.region,
                bedrock_api_key=self.api_key,
                max_tokens=max_tokens,
                temperature=temperature,
            )

        if provider == "gemini":
            if ChatGoogleGenerativeAI is None or not self.gemini_api_key:
                raise BedrockClientError(self._provider_unavailable_reason("gemini"))
            return ChatGoogleGenerativeAI(
                model=self.gemini_model,
                google_api_key=self.gemini_api_key,
                temperature=temperature,
                max_output_tokens=max_tokens,
            )

        if ChatOpenAI is None or not self.openai_api_key:
            raise BedrockClientError(self._provider_unavailable_reason("openai"))

        kwargs: dict[str, object] = {
            "model": self.openai_model,
            "api_key": self.openai_api_key,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if self.openai_base_url:
            kwargs["base_url"] = self.openai_base_url
        return ChatOpenAI(**kwargs)

    def _provider_chain(self) -> list[ProviderName]:
        chain = [self.primary_provider]
        if self.fallback_provider and self.fallback_provider != self.primary_provider:
            chain.append(self.fallback_provider)
        return chain

    def _message_count(self, messages: LanguageModelInput) -> int:
        if isinstance(messages, list):
            return len(messages)
        return 1

    def _log_provider_attempt(
        self,
        *,
        provider: ProviderName,
        max_tokens: int,
        temperature: float,
        schema_name: str | None,
        messages: LanguageModelInput,
        fallback: bool,
    ) -> None:
        logger.info(
            (
                "llm.invoke provider=%s model=%s region=%s schema=%s max_tokens=%s "
                "temperature=%s message_count=%s fallback=%s"
            ),
            provider,
            self._provider_model_name(provider),
            self.region,
            schema_name,
            max_tokens,
            temperature,
            self._message_count(messages),
            fallback,
        )

    def _log_provider_failure(
        self,
        *,
        provider: ProviderName,
        max_tokens: int,
        temperature: float,
        schema_name: str | None,
        messages: LanguageModelInput,
    ) -> None:
        logger.exception(
            (
                "llm.invoke_failed provider=%s model=%s region=%s schema=%s max_tokens=%s "
                "temperature=%s message_count=%s"
            ),
            provider,
            self._provider_model_name(provider),
            self.region,
            schema_name,
            max_tokens,
            temperature,
            self._message_count(messages),
        )

    def _invoke_text_with_model(
        self,
        model,
        messages: LanguageModelInput,
    ) -> str:
        response = model.invoke(messages)
        text = extract_text_content(response.content)
        if not text:
            raise BedrockClientError("Model did not return any text.")
        return text

    def _invoke_structured_with_model[T: BaseModel](
        self,
        model,
        messages: LanguageModelInput,
        schema: type[T],
    ) -> T:
        return model.with_structured_output(schema).invoke(messages)

    def invoke_text(
        self,
        messages: LanguageModelInput,
        max_tokens: int = 80000,
        temperature: float = 0.1,
    ) -> str:
        first_error: Exception | None = None

        for index, provider in enumerate(self._provider_chain()):
            try:
                self._log_provider_attempt(
                    provider=provider,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    schema_name=None,
                    messages=messages,
                    fallback=index > 0,
                )
                model = self._build_model(
                    provider,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                return self._invoke_text_with_model(model, messages)
            except Exception as exc:
                if first_error is None:
                    first_error = exc
                self._log_provider_failure(
                    provider=provider,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    schema_name=None,
                    messages=messages,
                )

        if first_error is None:
            raise BedrockClientError("No LLM provider could be invoked.")
        raise BedrockClientError(str(first_error)) from first_error

    def invoke_structured[T: BaseModel](
        self,
        messages: LanguageModelInput,
        schema: type[T],
        max_tokens: int = 80000,
        temperature: float = 0.0,
    ) -> T:
        first_error: Exception | None = None

        for index, provider in enumerate(self._provider_chain()):
            try:
                self._log_provider_attempt(
                    provider=provider,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    schema_name=schema.__name__,
                    messages=messages,
                    fallback=index > 0,
                )
                model = self._build_model(
                    provider,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                return self._invoke_structured_with_model(model, messages, schema)
            except Exception as exc:
                if first_error is None:
                    first_error = exc
                self._log_provider_failure(
                    provider=provider,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    schema_name=schema.__name__,
                    messages=messages,
                )

        if first_error is None:
            raise BedrockClientError("No LLM provider could be invoked.")
        raise BedrockClientError(str(first_error)) from first_error
