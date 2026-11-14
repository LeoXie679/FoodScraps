
from rapidfuzz import fuzz


def are_duplicates(event_a, event_b, threshold=85):
    """
    Check whether two event dictionaries probably describe
    the same event.

    Both dictionaries should contain:
        title
        org
        date
        location (or location_name)
    """

    # Dates must match
    date_a = event_a.get("date")
    date_b = event_b.get("date")

    if not date_a or not date_b or date_a != date_b:
        return False

    # Locations must match
    location_a = event_a.get("location") or event_a.get("location_name")
    location_b = event_b.get("location") or event_b.get("location_name")

    if not location_a or not location_b:
        return False

    location_score = fuzz.WRatio(
        str(location_a).lower(),
        str(location_b).lower()
    )

    if location_score < threshold:
        return False

    # Compare event title and organization together
    text_a = " ".join([
        str(event_a.get("title") or ""),
        str(event_a.get("org") or "")
    ]).strip()

    text_b = " ".join([
        str(event_b.get("title") or ""),
        str(event_b.get("org") or "")
    ]).strip()

    if not text_a or not text_b:
        return False

    text_score = fuzz.WRatio(
        text_a.lower(),
        text_b.lower()
    )

    return text_score >= threshold
