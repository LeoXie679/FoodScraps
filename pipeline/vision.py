
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


def extract_event(image_path, caption=""):
    if not API_KEY:
        raise ValueError("VULTR_INFERENCE_API_KEY is missing from .env")

    image_path = Path(image_path)

    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    mime_type = mimetypes.guess_type(image_path)[0] or "image/jpeg"

    image_data = base64.b64encode(image_path.read_bytes()).decode("utf-8")
    image_uri = f"data:{mime_type};base64,{image_data}"

    prompt = f"""
Read this UC San Diego event flyer and extract its information.

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
- Never invent a date, time, or location.
- Use null for unknown information.
- has_food is true only when free food is offered.
- Confidence must be between 0 and 1.
- Use an empty dietary list if none is visible.
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
