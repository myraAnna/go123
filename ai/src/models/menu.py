from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, Field, field_validator, model_validator

MenuCategory = Literal["main", "side", "drink", "dessert", "other"]
TaxTypeCode = Literal["01", "02", "03", "04", "05", "06", "E"]
TaxRateMode = Literal["percentage", "perUnit"]
UnitCode = Literal["C62", "DZN", "KGM", "GRM", "LTR", "MLT", "HUR", "DAY", "MON", "ANN"]


class ParseMenuRequest(BaseModel):
    text: str | None = None
    files: list[str] = Field(default_factory=list)
    urls: list[AnyHttpUrl] = Field(default_factory=list)

    @field_validator("text")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None

        value = " ".join(value.split())
        return value or None

    @field_validator("files")
    @classmethod
    def normalize_files(cls, value: list[str]) -> list[str]:
        cleaned = [bucket_key.strip() for bucket_key in value if bucket_key.strip()]
        if len(cleaned) != len(value):
            raise ValueError("files must only contain non-empty bucket keys")
        return cleaned

    @model_validator(mode="after")
    def validate_inputs(self) -> "ParseMenuRequest":
        if not self.text and not self.files and not self.urls:
            raise ValueError("at least one of text, files, or urls is required")
        return self


class ParseMenuItemDraft(BaseModel):
    name: str = Field(min_length=1)
    priceCents: int = Field(gt=0)
    category: MenuCategory | None = None
    description: str | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = " ".join(value.split()).strip()
        if not value:
            raise ValueError("name is required")
        return value

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None

        value = " ".join(value.split()).strip()
        return value or None


class ParseMenuResponse(BaseModel):
    items: list[ParseMenuItemDraft]
