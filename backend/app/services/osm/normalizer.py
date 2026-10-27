"""OSM normalization layer (spec §8). Raw tags are always preserved; missing values stay None (= UNKNOWN)."""

import re
from dataclasses import dataclass

from app.models.enums import WebsiteType
from app.services.osm.base import RawOSMElement
from app.services.osm.website_type import classify_website

NAME_KEYS = ("name", "brand", "operator")
PHONE_KEYS = ("phone", "contact:phone", "mobile", "contact:mobile")
WEBSITE_KEYS = ("website", "contact:website", "url")
EMAIL_KEYS = ("email", "contact:email")


@dataclass
class NormalizedBusiness:
    osm_type: str
    osm_id: int
    lat: float | None
    lon: float | None
    name: str | None
    name_source: str | None
    phone: str | None
    phone_raw: str | None
    website: str | None
    email: str | None
    opening_hours: str | None
    address_text: str | None
    website_type: WebsiteType
    tags: dict[str, str]


def _first(tags: dict[str, str], keys: tuple[str, ...]) -> tuple[str | None, str | None]:
    for key in keys:
        value = (tags.get(key) or "").strip()
        if value:
            return key, value
    return None, None


def _first_of_list(value: str) -> str:
    # OSM uses ";" to separate multiple values.
    return value.split(";")[0].strip()


def normalize_phone(raw: str | None) -> str | None:
    """Format Turkish numbers as +90 XXX XXX XX XX when parseable; otherwise keep the cleaned original."""
    if not raw:
        return None
    first = _first_of_list(raw)
    digits = re.sub(r"\D", "", first)
    if first.startswith("+") and not digits.startswith("90"):
        return first  # foreign number: keep as recorded
    if digits.startswith("0090"):
        digits = digits[4:]
    elif digits.startswith("90") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if len(digits) == 10 and digits[0] in "2345789":
        return f"+90 {digits[0:3]} {digits[3:6]} {digits[6:8]} {digits[8:10]}"
    return first


def build_address(tags: dict[str, str]) -> str | None:
    if tags.get("addr:full"):
        return tags["addr:full"].strip()
    street = " ".join(p for p in (tags.get("addr:street"), tags.get("addr:housenumber")) if p)
    parts = [
        street,
        tags.get("addr:neighbourhood") or tags.get("addr:suburb"),
        tags.get("addr:district"),
        tags.get("addr:city"),
        tags.get("addr:postcode"),
    ]
    text = ", ".join(p.strip() for p in parts if p and p.strip())
    return text or None


def normalize(element: RawOSMElement) -> NormalizedBusiness:
    tags = element.tags
    name_key, name = _first(tags, NAME_KEYS)  # never invent a name
    _, phone_raw = _first(tags, PHONE_KEYS)
    _, website = _first(tags, WEBSITE_KEYS)
    _, email = _first(tags, EMAIL_KEYS)
    website = _first_of_list(website) if website else None
    return NormalizedBusiness(
        osm_type=element.osm_type,
        osm_id=element.osm_id,
        lat=element.lat,
        lon=element.lon,
        name=name,
        name_source=name_key,
        phone=normalize_phone(phone_raw),
        phone_raw=phone_raw,
        website=website,
        email=_first_of_list(email) if email else None,
        opening_hours=(tags.get("opening_hours") or "").strip() or None,
        address_text=build_address(tags),
        website_type=classify_website(website),
        tags=dict(tags),
    )
