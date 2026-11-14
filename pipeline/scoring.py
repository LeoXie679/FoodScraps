
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


UCSD_TIMEZONE = ZoneInfo("America/Los_Angeles")


def calculate_freshness(event_date, start_time, current_time=None):
    """
    Calculate how fresh an event is.

    Freshness:
        Before event starts: 1.0
        At event start:      1.0
        30 minutes later:    0.5
        1 hour later:        0.0

    Returns a number between 0 and 1.
    """

    if not event_date or not start_time:
        return 1.0

    try:
        event_start = datetime.strptime(
            f"{event_date} {start_time}",
            "%Y-%m-%d %H:%M"
        ).replace(tzinfo=UCSD_TIMEZONE)

    except ValueError:
        return 1.0

    if current_time is None:
        current_time = datetime.now(UCSD_TIMEZONE)

    elif current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=UCSD_TIMEZONE)

    elapsed = current_time - event_start

    if elapsed <= timedelta(0):
        return 1.0

    one_hour = timedelta(hours=1)

    if elapsed >= one_hour:
        return 0.0

    freshness = 1 - (elapsed.total_seconds() / one_hour.total_seconds())

    return max(0.0, min(1.0, freshness))


def calculate_confidence(extraction_confidence, event_date, start_time):
    """
    Calculate final confidence using:

    extraction confidence * freshness
    """

    extraction_confidence = float(extraction_confidence)

    if not 0 <= extraction_confidence <= 1:
        raise ValueError("Extraction confidence must be between 0 and 1")

    freshness = calculate_freshness(event_date, start_time)

    return round(extraction_confidence * freshness, 3)
