# Person B — AI Vision Pipeline

## Overview

The AI vision pipeline is responsible for turning UC San Diego event flyers and social media posts into structured event information for Free Food Radar.

It uses a vision-language AI model to read event flyers, identify whether free food is offered, and extract important event details. The extracted information is then validated, matched against UCSD campus buildings, scored for confidence, and checked for duplicates before being saved to the database.

## How It Works

The pipeline processes each scraped post through the following steps:

1. **Image Retrieval** — Retrieves the event flyer image from Vultr Object Storage.
2. **AI Vision Extraction** — Sends the flyer image and its caption to a vision-language model through Vultr Serverless Inference.
3. **Structured Data Extraction** — Extracts:
   - Event title
   - Organization
   - Date
   - Start and end times
   - Location
   - Food description
   - Dietary information
   - Extraction confidence
4. **Schema Validation** — Uses Pydantic to validate the AI response and ensure the extracted data follows the expected structure.
5. **Food Filtering** — Rejects posts that are not events or do not offer free food.
6. **Building Matching** — Uses fuzzy string matching with RapidFuzz to match extracted locations to UCSD campus buildings.
7. **Confidence Scoring** — Calculates a confidence score based on the extraction results and available event information.
8. **Duplicate Detection** — Checks whether an event already exists using its title, organization, location, and date.
9. **Database Storage** — Saves valid event information to PostgreSQL and updates the original post's processing status.

## Technologies Used

- **Python** — Main pipeline implementation
- **Vultr Serverless Inference** — Vision-language AI inference
- **Nemotron 3 Nano Omni** — Model used for flyer understanding and information extraction
- **Pydantic** — Structured data validation
- **RapidFuzz** — Fuzzy building matching and duplicate detection
- **PostgreSQL** — Event and building data storage
- **Vultr Object Storage** — Flyer image storage
- **FastAPI** — Pipeline API

## Project Structure

```text
pipeline/
├── app.py              # Main processing pipeline and API
├── vision.py           # AI flyer image extraction
├── schemas.py          # Pydantic data validation
├── buildings.py        # Building matching utilities
├── scoring.py          # Event confidence scoring
├── dedup.py             # Duplicate event detection
├── test_dedup.py        # Duplicate detection tests
├── vision_test.py       # Vision extraction tests
└── testset/             # Sample flyer images
```

## API

The pipeline exposes a processing endpoint:

`POST /process`

It retrieves new scraped posts, processes their flyer images, and stores valid food events in the database.

Health check:

`GET /health`

Example successful processing response:

```json
{
  "total": 1,
  "processed": 1,
  "not_food": 0,
  "duplicate": 0,
  "failed": 0
}
```

## Configuration

The pipeline uses environment variables for its database, object storage, and AI inference connections.

Required environment variables:

- `DATABASE_URL`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `VULTR_INFERENCE_API_KEY`

Additional object storage configuration may include:

- `S3_BUCKET`
- `S3_REGION`

**Security:** Keep API keys and credentials in your local `.env` file. Never commit secrets to GitHub.

## Running Locally

From the repository root:

1. Activate the Python virtual environment.
2. Install the project dependencies.
3. Configure the required environment variables in `.env`.
4. Start the pipeline API:

```bash
uvicorn pipeline.app:app --host 127.0.0.1 --port 8001
```

5. Check the health endpoint:

`http://127.0.0.1:8001/health`

## Testing

Run the duplicate detection tests:

```bash
python -m unittest pipeline.test_dedup -v
```

Compile the pipeline files:

```bash
python -m compileall pipeline
```

## Error Handling

- Invalid AI responses are retried once.
- Posts without images are marked as failed.
- Posts that are not food-related are marked as `not_food`.
- Duplicate events are skipped.
- Processing errors are logged and the post is marked as failed.

## Person B Contribution

Developed the AI vision pipeline for Free Food Radar, including:

- Vision-language model integration through Vultr Serverless Inference.
- Automated event information extraction from flyer images.
- Pydantic schema validation.
- Free-food event filtering.
- UCSD building matching.
- Event confidence scoring.
- Duplicate event detection.
- FastAPI processing endpoint.
- Integration with PostgreSQL and Vultr Object Storage.

The goal is to transform unstructured event flyers into reliable, structured information that UCSD students can use to discover free food on campus.
