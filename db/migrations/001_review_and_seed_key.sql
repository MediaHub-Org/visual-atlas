-- Review state and a stable key for the seed import (db/IMPORT.md, approved
-- 2026-11-22). The schema is a proposal and nothing is deployed, so this is the
-- first migration rather than a change to schema.sql: applied databases keep a
-- history instead of being recreated.
--
-- seed_key is the id from the conversation export, kept verbatim. Renames do not
-- recompute it, and a re-import upserts on it instead of matching by title.
--
-- review_status is the rule the import needs: an imported row is 'needs_review'
-- and only a person may set 'reviewed' (which then requires the date it happened).
-- The import never writes this column.

ALTER TABLE sources
  ADD COLUMN seed_key text,
  ADD COLUMN review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'reviewed', 'rejected')),
  ADD COLUMN reviewed_at date,
  ADD COLUMN reviewed_by text,
  ADD CONSTRAINT sources_review_needs_date
    CHECK (review_status <> 'reviewed' OR reviewed_at IS NOT NULL);
CREATE UNIQUE INDEX sources_seed_key ON sources (seed_key) WHERE seed_key IS NOT NULL;

ALTER TABLE companies
  ADD COLUMN seed_key text,
  ADD COLUMN review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'reviewed', 'rejected')),
  ADD COLUMN reviewed_at date,
  ADD COLUMN reviewed_by text,
  ADD CONSTRAINT companies_review_needs_date
    CHECK (review_status <> 'reviewed' OR reviewed_at IS NOT NULL);
CREATE UNIQUE INDEX companies_seed_key ON companies (seed_key) WHERE seed_key IS NOT NULL;

ALTER TABLE franchises
  ADD COLUMN seed_key text,
  ADD COLUMN review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'reviewed', 'rejected')),
  ADD COLUMN reviewed_at date,
  ADD COLUMN reviewed_by text,
  ADD CONSTRAINT franchises_review_needs_date
    CHECK (review_status <> 'reviewed' OR reviewed_at IS NOT NULL);
CREATE UNIQUE INDEX franchises_seed_key ON franchises (seed_key) WHERE seed_key IS NOT NULL;

ALTER TABLE works
  ADD COLUMN seed_key text,
  ADD COLUMN review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'reviewed', 'rejected')),
  ADD COLUMN reviewed_at date,
  ADD COLUMN reviewed_by text,
  ADD CONSTRAINT works_review_needs_date
    CHECK (review_status <> 'reviewed' OR reviewed_at IS NOT NULL);
CREATE UNIQUE INDEX works_seed_key ON works (seed_key) WHERE seed_key IS NOT NULL;

ALTER TABLE tags
  ADD COLUMN seed_key text,
  ADD COLUMN review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'reviewed', 'rejected')),
  ADD COLUMN reviewed_at date,
  ADD COLUMN reviewed_by text,
  ADD CONSTRAINT tags_review_needs_date
    CHECK (review_status <> 'reviewed' OR reviewed_at IS NOT NULL);
CREATE UNIQUE INDEX tags_seed_key ON tags (seed_key) WHERE seed_key IS NOT NULL;

-- Claims in join tables need the same state: a membership imported from the
-- conversation is not a fact because it has a row.
ALTER TABLE franchise_memberships
  ADD COLUMN review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'reviewed', 'rejected'));

ALTER TABLE continuity_memberships
  ADD COLUMN review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'reviewed', 'rejected'));

ALTER TABLE franchise_companies
  ADD COLUMN review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'reviewed', 'rejected'));

ALTER TABLE work_companies
  ADD COLUMN review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'reviewed', 'rejected'));
