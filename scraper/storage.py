"""Upload flyer images to Vultr Object Storage (S3-compatible)."""

from __future__ import annotations

import hashlib
import logging
import mimetypes
from urllib.parse import urlparse

import boto3
import httpx
from botocore.client import Config

log = logging.getLogger(__name__)


def make_s3_client(endpoint: str, access_key: str, secret_key: str, region: str = "us-east-1"):
    return boto3.client(
        "s3",
        endpoint_url=endpoint.rstrip("/"),
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
        config=Config(signature_version="s3v4"),
    )


def download_bytes(url: str, client: httpx.Client | None = None) -> tuple[bytes, str]:
    own = client is None
    client = client or httpx.Client(timeout=60.0, follow_redirects=True)
    try:
        r = client.get(url)
        r.raise_for_status()
        ctype = r.headers.get("content-type", "image/jpeg").split(";")[0].strip()
        return r.content, ctype
    finally:
        if own:
            client.close()


def image_key_for(source_url: str | None, image_url: str, content: bytes) -> str:
    digest = hashlib.sha256(content).hexdigest()[:16]
    path = urlparse(source_url or image_url).path.strip("/").replace("/", "_") or "post"
    ext = mimetypes.guess_extension(
        mimetypes.guess_type(image_url)[0] or "image/jpeg"
    ) or ".jpg"
    if ext == ".jpe":
        ext = ".jpg"
    return f"instagram/{path}_{digest}{ext}"


def upload_image(
    *,
    s3,
    bucket: str,
    image_url: str,
    source_url: str | None = None,
    http: httpx.Client | None = None,
) -> str:
    content, ctype = download_bytes(image_url, client=http)
    key = image_key_for(source_url, image_url, content)
    # Vultr Object Storage: omit ACL (not all regions support public-read ACL)
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=content,
        ContentType=ctype or "image/jpeg",
    )
    log.info("uploaded s3://%s/%s (%d bytes)", bucket, key, len(content))
    return key


def public_url(endpoint: str, bucket: str, key: str) -> str:
    # Vultr Object Storage public URL pattern
    host = endpoint.replace("https://", "").replace("http://", "").rstrip("/")
    return f"https://{bucket}.{host}/{key}"
