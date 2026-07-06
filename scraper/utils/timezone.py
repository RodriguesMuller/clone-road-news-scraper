from datetime import datetime
from zoneinfo import ZoneInfo

BRASILIA_TZ = ZoneInfo("America/Sao_Paulo")


def brasilia_now() -> datetime:
    """Retorna o horario atual com fuso de Brasilia."""
    return datetime.now(BRASILIA_TZ)


def brasilia_now_iso() -> str:
    """ISO-8601 com offset de Brasilia, usado no campo scraped_at."""
    return brasilia_now().isoformat(timespec="seconds")


def as_brasilia(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=BRASILIA_TZ)
    return value.astimezone(BRASILIA_TZ)


def brasilia_iso_from_datetime(value: datetime) -> str:
    return as_brasilia(value).isoformat(timespec="seconds")
