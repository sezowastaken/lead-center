"""Timestamps are stored as naive UTC. "Today" / "this month" are Istanbul calendar periods."""

from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

LOCAL_TZ = ZoneInfo("Europe/Istanbul")


def to_utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def local_now() -> datetime:
    return datetime.now(LOCAL_TZ)


def local_day_start_utc(day: date) -> datetime:
    return to_utc_naive(datetime.combine(day, time.min, tzinfo=LOCAL_TZ))


def today_start_utc() -> datetime:
    return local_day_start_utc(local_now().date())


def month_start_utc() -> datetime:
    return local_day_start_utc(local_now().date().replace(day=1))
