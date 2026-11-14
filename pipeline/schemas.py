
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class EventExtraction(BaseModel):
    is_event: bool
    has_food: bool

    title: Optional[str] = None
    org: Optional[str] = None

    date: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None

    location: Optional[str] = None
    food: Optional[str] = None

    dietary: list[str] = Field(default_factory=list)

    extraction_confidence: float = Field(ge=0.0, le=1.0)

    @field_validator("date")
    @classmethod
    def validate_date(cls, value):
        if value is None or value == "":
            return None

        try:
            date.fromisoformat(value)
        except ValueError:
            raise ValueError("Date must use YYYY-MM-DD format")

        return value

    @field_validator("start", "end")
    @classmethod
    def validate_time(cls, value):
        if value is None or value == "":
            return None

        try:
            datetime.strptime(value, "%H:%M")
        except ValueError:
            raise ValueError("Time must use HH:MM format")

        return value

    @field_validator("dietary")
    @classmethod
    def validate_dietary(cls, value):
        return [item.strip() for item in value if item.strip()]
