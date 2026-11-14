-- Free Food Radar schema (Person A runs this once on Postgres)

CREATE TABLE IF NOT EXISTS raw_posts (
    id            BIGSERIAL PRIMARY KEY,
    source        TEXT NOT NULL,
    source_url    TEXT,
    posted_at     TIMESTAMPTZ,
    caption       TEXT,
    image_key     TEXT,
    status        TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'processed', 'failed', 'not_food')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source, source_url)
);

CREATE TABLE IF NOT EXISTS events (
    id            BIGSERIAL PRIMARY KEY,
    raw_post_id   BIGINT REFERENCES raw_posts(id) ON DELETE SET NULL,
    title         TEXT NOT NULL,
    org           TEXT,
    start_time    TIMESTAMPTZ,
    end_time      TIMESTAMPTZ,
    location_name TEXT,
    lat           DOUBLE PRECISION,
    lng           DOUBLE PRECISION,
    has_food      BOOLEAN NOT NULL DEFAULT TRUE,
    food_desc     TEXT,
    dietary       TEXT[] NOT NULL DEFAULT '{}',
    confidence    DOUBLE PRECISION,
    cluster_id    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leftovers (
    id            BIGSERIAL PRIMARY KEY,
    location_name TEXT NOT NULL,
    lat           DOUBLE PRECISION,
    lng           DOUBLE PRECISION,
    description   TEXT NOT NULL,
    posted_by     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS buildings (
    name          TEXT PRIMARY KEY,
    aliases       TEXT[] NOT NULL DEFAULT '{}',
    lat           DOUBLE PRECISION NOT NULL,
    lng           DOUBLE PRECISION NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_start ON events (start_time);
CREATE INDEX IF NOT EXISTS idx_events_dietary ON events USING GIN (dietary);
CREATE INDEX IF NOT EXISTS idx_leftovers_expires ON leftovers (expires_at);
CREATE INDEX IF NOT EXISTS idx_raw_posts_status ON raw_posts (status);
