"""Minimal website source classification (spec §9). UNKNOWN means "not recorded", never "no website"."""

from urllib.parse import urlsplit

from app.models.enums import WebsiteType

SOCIAL_HOSTS = {
    "instagram.com", "facebook.com", "fb.com", "m.facebook.com", "tiktok.com", "twitter.com", "x.com",
    "youtube.com", "linktr.ee", "linkedin.com", "pinterest.com",
}
WHATSAPP_HOSTS = {"wa.me", "whatsapp.com", "api.whatsapp.com", "chat.whatsapp.com", "wa.link"}
BOOKING_HOSTS = {
    "kolayrandevu.com", "booksy.com", "fresha.com", "treatwell.com", "planity.com", "setmore.com",
    "calendly.com", "randevu.com", "randevuburada.com", "salonrandevu.com", "simplybook.me",
}
MARKETPLACE_HOSTS = {
    "armut.com", "business.site", "yandex.com", "yandex.com.tr", "foursquare.com", "trendyol.com",
    "hepsiburada.com", "sahibinden.com", "n11.com", "etsy.com", "google.com", "maps.app.goo.gl",
    "g.page", "goo.gl", "yemeksepeti.com", "getir.com",
}


def _host(url: str) -> str | None:
    value = url.strip()
    if not value or " " in value:
        return None
    if "://" not in value:
        value = "http://" + value
    try:
        host = urlsplit(value).hostname
    except ValueError:
        return None
    if not host or "." not in host:
        return None
    return host.lower().removeprefix("www.")


def _matches(host: str, domains: set[str]) -> bool:
    return any(host == d or host.endswith("." + d) for d in domains)


def classify_website(url: str | None) -> WebsiteType:
    if not url or not url.strip():
        return WebsiteType.UNKNOWN
    host = _host(url)
    if host is None:
        return WebsiteType.BROKEN_OR_INVALID
    if _matches(host, WHATSAPP_HOSTS):
        return WebsiteType.WHATSAPP_ONLY
    if _matches(host, SOCIAL_HOSTS):
        return WebsiteType.SOCIAL_ONLY
    if _matches(host, BOOKING_HOSTS):
        return WebsiteType.THIRD_PARTY_BOOKING
    if _matches(host, MARKETPLACE_HOSTS):
        return WebsiteType.MARKETPLACE_PROFILE
    return WebsiteType.OWN_WEBSITE
