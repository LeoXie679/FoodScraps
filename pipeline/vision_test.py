
import argparse
import base64
import json
import mimetypes
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

API_KEY = os.getenv("VULTR_INFERENCE_API_KEY")
MODEL = "nemotron-3-nano-omni-30b-a3b-reasoning"
URL = "https://api.vultrinference.com/v1/responses"


def extract_flyer(image_path, caption=""):
    if not API_KEY:
        raise RuntimeError("VULTR_INFERENCE_API_KEY is missing from .env")

    image_path = Path(image_path)

    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    mime_type = mimetypes.guess_type(image_path)[0] or "image/jpeg"

    if mime_type not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        raise ValueError("Use a JPG, PNG, WebP, or GIF image.")

    image_data = base64.b64encode(image_path.read_bytes()).decode("utf-8")
    image_uri = f"data:{mime_type};base64,{image_data}"

    prompt = f"""
    Read this UCSD club event flyer and extract its information.

    Instagram caption: {caption}

    Return ONLY one valid JSON object with these exact fields:
    {{
      "is_event": true,
      "has_food": true,
      "title": "event title",
      "org": "organization",
      "date": "YYYY-MM-DD",
      "start": "HH:MM",
      "end": "HH:MM",
      "location": "building or location",
      "food": "food description",
      "dietary": [],
      "extraction_confidence": 0.0
    }}

    Rules:
    - Do not invent missing information.
    - Use null for unknown values.
    - Use true or false for is_event and has_food.
    - Confidence must be between 0 and 1.
    - Return JSON only. No markdown.
    """

    payload = {
        "model": MODEL,
        "instructions": "You are an accurate event flyer information extractor.",
        "input": [
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                    {"type": "input_image", "image_url": image_uri}
                ]
            }
        ],
        "max_output_tokens": 4000,
        "temperature": 0.1
    }

    response = requests.post(
        URL,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        },
        json=payload,
        timeout=180
    )

    if not response.ok:
        raise RuntimeError(
            f"Vultr returned HTTP {response.status_code}: {response.text}"
        )

    result = response.json()
    print("\nFULL API RESPONSE:")
    print(json.dumps(result, indent=2))

    print("\nMODEL:", result.get("model"))
    print("\nEXTRACTED RESPONSE:")

    for item in result.get("output", []):
        if item.get("type") == "message":
            for part in item.get("content", []):
                if part.get("type") in ("output_text", "text"):
                    print(part.get("text", ""))

    if not result.get("output"):
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("image", help="Path to flyer image")
    parser.add_argument("--caption", default="", help="Instagram caption")
    args = parser.parse_args()

    try:
        extract_flyer(args.image, args.caption)
    except Exception as error:
        print("\nERROR:", error)
