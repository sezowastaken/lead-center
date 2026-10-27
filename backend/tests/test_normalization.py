from app.models.enums import WebsiteType
from app.services.osm.base import RawOSMElement
from app.services.osm.normalizer import normalize, normalize_phone
from app.services.osm.website_type import classify_website


def _el(tags: dict) -> RawOSMElement:
    return RawOSMElement("node", 1, 41.0, 29.0, tags)


def test_missing_fields_are_unknown_not_negative():
    nb = normalize(_el({"shop": "beauty"}))
    assert nb.name is None and nb.name_source is None  # never invent a name
    assert nb.phone is None and nb.website is None and nb.email is None
    assert nb.website_type == WebsiteType.UNKNOWN


def test_name_fallback_order():
    assert normalize(_el({"brand": "B", "operator": "O"})).name == "B"
    nb = normalize(_el({"operator": "O"}))
    assert (nb.name, nb.name_source) == ("O", "operator")


def test_contact_variants():
    nb = normalize(_el({"contact:phone": "+90 532 111 22 33", "contact:website": "x.com.tr", "contact:email": "a@b.c"}))
    assert nb.phone == "+90 532 111 22 33"
    assert nb.phone_raw == "+90 532 111 22 33"
    assert nb.website == "x.com.tr"
    assert nb.email == "a@b.c"


def test_phone_normalization():
    assert normalize_phone("0216 555 12 34") == "+90 216 555 12 34"
    assert normalize_phone("+902165551234") == "+90 216 555 12 34"
    assert normalize_phone("5321112233; 02165551234") == "+90 532 111 22 33"
    assert normalize_phone("+44 20 7946 0958") == "+44 20 7946 0958"
    assert normalize_phone("444 1 444") == "444 1 444"  # unparseable: keep as recorded
    assert normalize_phone(None) is None


def test_address():
    nb = normalize(_el({"addr:street": "Moda Cd.", "addr:housenumber": "5", "addr:district": "Kadıköy"}))
    assert nb.address_text == "Moda Cd. 5, Kadıköy"


def test_website_classification():
    assert classify_website(None) == WebsiteType.UNKNOWN
    assert classify_website("") == WebsiteType.UNKNOWN
    assert classify_website("https://www.instagram.com/foo") == WebsiteType.SOCIAL_ONLY
    assert classify_website("https://wa.me/905321112233") == WebsiteType.WHATSAPP_ONLY
    assert classify_website("kolayrandevu.com/salon") == WebsiteType.THIRD_PARTY_BOOKING
    assert classify_website("https://booksy.com/tr-tr/1") == WebsiteType.THIRD_PARTY_BOOKING
    assert classify_website("https://normalbusiness.com") == WebsiteType.OWN_WEBSITE
    assert classify_website("not a url") == WebsiteType.BROKEN_OR_INVALID
