
from rapidfuzz import process, fuzz


# Temporary building list.
# We will connect this to the actual database later.

BUILDINGS = {
    "Price Center": [
        "Price Center",
        "PC",
        "Price Center West",
        "Price Center East",
    ],
    "Geisel Library": [
        "Geisel Library",
        "Geisel",
    ],
    "Muir College": [
        "Muir College",
        "Muir",
    ],
    "Malk Hall": [
        "Malk Hall",
        "Malk",
    ],
    "RIMAC": [
        "RIMAC",
        "RIMAC Arena",
    ],
    "Student Services Center": [
        "Student Services Center",
        "SSC",
    ],
    "Warren Lecture Hall": [
        "Warren Lecture Hall",
        "WLH",
    ],
    "Center Hall": [
        "Center Hall",
        "Center",
    ],
}


def match_building(location, threshold=80):
    """
    Match an extracted location to a known UCSD building.

    Returns:
        {
            "building": official building name or None,
            "score": matching score,
            "matched": True or False
        }
    """

    if not location or not location.strip():
        return {
            "building": None,
            "score": 0,
            "matched": False,
        }

    choices = {}

    for official_name, aliases in BUILDINGS.items():
        for alias in aliases:
            choices[alias] = official_name

    result = process.extractOne(
        location.strip(),
        list(choices.keys()),
        scorer=fuzz.WRatio,
    )

    if result is None:
        return {
            "building": None,
            "score": 0,
            "matched": False,
        }

    matched_alias, score, _ = result

    if score < threshold:
        return {
            "building": None,
            "score": score,
            "matched": False,
        }

    return {
        "building": choices[matched_alias],
        "score": score,
        "matched": True,
    }
