
import os
import json
import base64
import mimetypes
import requests
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

API_KEY = os.getenv("VULTR_INFERENCE_API_KEY")
MODEL = "nemotron-3-nano-omni-30b-a3b-reasoning"
API_URL = "https://api.vultrinference.com/v1/responses"




def extract_event(image_input, caption="", mime_type=None):
    if not API_KEY:
        raise ValueError("VULTR_INFERENCE_API_KEY is missing from .env")

    if isinstance(image_input, (bytes, bytearray)):
        image_data = base64.b64encode(image_input).decode("utf-8")
        mime_type = mime_type or "image/jpeg"
    else:
        image_path = Path(image_input)

        if not image_path.exists():
            raise FileNotFoundError(f"Image not found: {image_path}")

        mime_type = mime_type or mimetypes.guess_type(image_path)[0] or "image/jpeg"
        image_data = base64.b64encode(image_path.read_bytes()).decode("utf-8")

    image_uri = f"data:{mime_type};base64,{image_data}"

    # Help the model resolve weekday/month captions into ISO dates.
    today = __import__("datetime").date.today().isoformat()

    prompt = f"""
Read this UC San Diego event flyer and extract its information.

Today's date (Pacific): {today}
Caption: {caption}

Return ONLY one valid JSON object with exactly these fields:
{{
  "is_event": true,
  "has_food": true,
  "title": "event title",
  "org": "organization",
  "date": "YYYY-MM-DD or null",
  "start": "HH:MM or null",
  "end": "HH:MM or null",
  "location": "building or location",
  "food": "food description",
  "dietary": [],
  "extraction_confidence": 0.0
}}


Rules:
- Copy the event title exactly as written on the flyer. Do not paraphrase, shorten, or rename it.
- has_food is true ONLY if the flyer or caption explicitly mentions food, meals, snacks, refreshments, hot cocoa, or specific food items being offered.
- Do not assume an event has food because it is a social, cultural, career, or campus event.
- If food is not explicitly mentioned, set has_food to false and food to null.
- Reject non-food events by setting is_event to false when no food is explicitly mentioned.
- Only list dietary restrictions or labels explicitly stated on the flyer or caption. Otherwise return [].
- Never invent dates, times, locations, organizations, food descriptions, or dietary information.
- Use null for unknown information.
- date MUST be YYYY-MM-DD. If the flyer/caption has a weekday + month/day (e.g. "Thursday, November 19" or "Nov 17"), convert it using today's date above to pick the correct year. Only use null if no calendar date appears at all.
- start/end MUST be 24-hour HH:MM (e.g. 4pm → 16:00).
- Confidence must be between 0 and 1.
- Return JSON only. No markdown or explanations.
"""

    payload = {
        "model": MODEL,
        "instructions": "You are an accurate UCSD event flyer information extractor. Follow the requested JSON format exactly.",
        "input": [
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                    {"type": "input_image", "image_url": image_uri}
                ]
            }
        ],
        "max_output_tokens": 1600,
        "temperature": 0.1
    }

    response = requests.post(
        API_URL,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        },
        json=payload,
        timeout=180
    )

    if not response.ok:
        raise RuntimeError(
            f"Vultr returned HTTP {response.status_code}: {response.text[:1000]}"
        )

    result = response.json()

    text_parts = []

    for item in result.get("output", []):
        if item.get("type") == "message":
            for part in item.get("content", []):
                if part.get("type") in ("output_text", "text"):
                    text_parts.append(part.get("text", ""))

    content = "\n".join(text_parts).strip()

    if not content:
        raise ValueError(
            f"Vultr returned no text. Response: {json.dumps(result)[:1000]}"
        )

    if content.startswith("```"):
        content = content.split("\n", 1)[-1]
        content = content.rsplit("```", 1)[0].strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError as error:
        raise ValueError(
            f"Vision model returned invalid JSON: {content[:1000]}"
        ) from error
