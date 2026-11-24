-- Fourth import pass: in-world dates in a universe's own calendar
-- (docs/superpowers/specs/2026-11-24-inworld-chronology-design.md).
--
-- fictional_calendars is data, not a CHECK list: a new universe is a row.
-- narrative_periods (empty until now) gains the numeric span, the qualifier the
-- source used ("c.", "during or after", "days before"), the raw string and the
-- provenance of the date. Values are signed years on the calendar's own line
-- (N BBY = -N, N ABY = +N); NULL means unknown, never zero.
--
-- certainty keeps the existing four values: the importer writes 'estimated' for a
-- stated date and 'unknown' for an open-ended one, never 'confirmed'; review_status
-- starts 'needs_review' and only a person marks 'reviewed'.

CREATE TABLE fictional_calendars (
  id text PRIMARY KEY CHECK (btrim(id) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  franchise_id bigint REFERENCES franchises(id),
  anchor_event text NOT NULL CHECK (btrim(anchor_event) <> ''),
  unit text NOT NULL CHECK (unit IN ('year')),
  era_before text NOT NULL,
  era_after text NOT NULL,
  zero_year_exists boolean NOT NULL DEFAULT true
);

ALTER TABLE narrative_periods
  ADD COLUMN seed_key text,
  ADD COLUMN calendar_id text REFERENCES fictional_calendars(id),
  ADD COLUMN start_value integer,
  ADD COLUMN end_value integer,
  ADD COLUMN qualifier text
    CHECK (qualifier IN ('exact', 'circa', 'open_after', 'days_before')),
  ADD COLUMN raw_text text,
  ADD COLUMN source_page text,
  ADD COLUMN source_revision bigint,
  ADD COLUMN retrieved_at timestamptz,
  ADD COLUMN licence text,
  ADD COLUMN review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'reviewed', 'rejected')),
  ADD COLUMN reviewed_at date,
  ADD COLUMN reviewed_by text,
  ADD CONSTRAINT narrative_periods_review_needs_date
    CHECK (review_status <> 'reviewed' OR reviewed_at IS NOT NULL),
  ADD CONSTRAINT narrative_periods_span_ordered
    CHECK (start_value IS NULL OR end_value IS NULL OR start_value <= end_value);
CREATE UNIQUE INDEX narrative_periods_seed_key
  ON narrative_periods (seed_key) WHERE seed_key IS NOT NULL;
