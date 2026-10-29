"""Enumerated values stored as TEXT. Kept as StrEnum so they validate in Python and read cleanly in SQLite."""

from enum import StrEnum


class RecordState(StrEnum):
    DISCOVERED = "DISCOVERED"
    IN_REVIEW = "IN_REVIEW"
    REJECTED = "REJECTED"
    FAVORITED = "FAVORITED"
    APPROVED = "APPROVED"


# The normal review queue (spec §7.1, §19): rejected/approved/favorited never appear here.
REVIEW_QUEUE_STATES = (RecordState.DISCOVERED, RecordState.IN_REVIEW)


class WebsiteType(StrEnum):
    UNKNOWN = "UNKNOWN"
    OWN_WEBSITE = "OWN_WEBSITE"
    SOCIAL_ONLY = "SOCIAL_ONLY"
    WHATSAPP_ONLY = "WHATSAPP_ONLY"
    THIRD_PARTY_BOOKING = "THIRD_PARTY_BOOKING"
    MARKETPLACE_PROFILE = "MARKETPLACE_PROFILE"
    BROKEN_OR_INVALID = "BROKEN_OR_INVALID"


class RejectReason(StrEnum):
    GOOD_WEBSITE = "GOOD_WEBSITE"
    BUSINESS_CLOSED = "BUSINESS_CLOSED"
    REBRANDED = "REBRANDED"
    WEBSITE_NOT_USEFUL = "WEBSITE_NOT_USEFUL"
    TOO_LOW_VALUE = "TOO_LOW_VALUE"
    UNREACHABLE = "UNREACHABLE"
    WRONG_SECTOR = "WRONG_SECTOR"
    LOW_QUALITY_BUSINESS = "LOW_QUALITY_BUSINESS"
    DUPLICATE = "DUPLICATE"
    OTHER = "OTHER"


class RuleType(StrEnum):
    TAG = "TAG"
    NAME_REGEX = "NAME_REGEX"
    TAG_AND_NAME_REGEX = "TAG_AND_NAME_REGEX"
    TAG_AND_TAG_REGEX = "TAG_AND_TAG_REGEX"  # tag=value and another tag (regex_key) matching regex, e.g. cuisine~burger


class LocationType(StrEnum):
    CITY = "CITY"
    DISTRICT = "DISTRICT"
    NEIGHBORHOOD = "NEIGHBORHOOD"
    COMMERCIAL_AREA = "COMMERCIAL_AREA"


class CrmStage(StrEnum):
    READY_TO_CONTACT = "READY_TO_CONTACT"
    CONTACTED = "CONTACTED"
    NO_RESPONSE = "NO_RESPONSE"
    REPLIED = "REPLIED"
    FOLLOW_UP = "FOLLOW_UP"
    MEETING = "MEETING"
    OFFER_SENT = "OFFER_SENT"
    WON = "WON"
    LOST = "LOST"


class OutreachEventType(StrEnum):
    OUTBOUND = "OUTBOUND"  # a message/call the user sent manually
    INBOUND = "INBOUND"  # a reply received
    NOTE = "NOTE"
    STAGE_CHANGE = "STAGE_CHANGE"


class ContactChannel(StrEnum):
    WHATSAPP = "WHATSAPP"
    PHONE = "PHONE"
    INSTAGRAM_DM = "INSTAGRAM_DM"
    EMAIL = "EMAIL"
    WEBSITE_FORM = "WEBSITE_FORM"
    IN_PERSON = "IN_PERSON"


# --- Manual review checklist (spec §24) ---


class BusinessActive(StrEnum):
    YES = "YES"
    NO = "NO"
    UNCERTAIN = "UNCERTAIN"


class RebrandStatus(StrEnum):
    NO = "NO"
    POSSIBLE = "POSSIBLE"
    CONFIRMED = "CONFIRMED"


class VerifiedWebsiteStatus(StrEnum):
    NOT_CHECKED = "NOT_CHECKED"
    NO_INDEPENDENT_WEBSITE = "NO_INDEPENDENT_WEBSITE"
    SOCIAL_ONLY = "SOCIAL_ONLY"
    THIRD_PARTY_ONLY = "THIRD_PARTY_ONLY"
    BROKEN = "BROKEN"
    SEVERELY_OUTDATED = "SEVERELY_OUTDATED"
    POOR = "POOR"
    AVERAGE = "AVERAGE"
    GOOD = "GOOD"
    EXCELLENT = "EXCELLENT"


class WebsiteIssueCode(StrEnum):
    OLD_DESIGN = "OLD_DESIGN"
    POOR_MOBILE = "POOR_MOBILE"
    SLOW = "SLOW"
    BROKEN_LINKS = "BROKEN_LINKS"
    BROKEN_ELEMENTS = "BROKEN_ELEMENTS"
    MISSING_CTA = "MISSING_CTA"
    WEAK_CONTACT_FLOW = "WEAK_CONTACT_FLOW"
    WEAK_SERVICE_PRESENTATION = "WEAK_SERVICE_PRESENTATION"
    CONFUSING_NAVIGATION = "CONFUSING_NAVIGATION"
    POOR_VISUAL_TRUST = "POOR_VISUAL_TRUST"
    OLD_CONTENT = "OLD_CONTENT"
    BROKEN_BOOKING = "BROKEN_BOOKING"
    NO_ENGLISH = "NO_ENGLISH"
    OTHER = "OTHER"


class InstagramStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    NOT_FOUND = "NOT_FOUND"
    NOT_CHECKED = "NOT_CHECKED"


class ReachabilityChannel(StrEnum):
    WHATSAPP = "WHATSAPP"
    PHONE = "PHONE"
    INSTAGRAM_DM = "INSTAGRAM_DM"
    EMAIL = "EMAIL"
    WEBSITE_FORM = "WEBSITE_FORM"
    IN_PERSON = "IN_PERSON"


class CommercialValue(StrEnum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    UNCLEAR = "UNCLEAR"


class CustomerValue(StrEnum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    UNKNOWN = "UNKNOWN"


class ContactDecision(StrEnum):
    YES = "YES"
    MAYBE = "MAYBE"
    NO = "NO"
