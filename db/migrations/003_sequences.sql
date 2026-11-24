-- Third import pass: the seed's sequences (owner's rule, 2026-11-24).
--
-- The seed's 235 sequences are an *editorial proposal* from a conversation
-- export, without a source for any position. The owner decided they import with
-- certainty/placement 'unknown' and an explicit editorial provenance, never as
-- 'estimated' or 'confirmed'. `origin` records that; it is a one-value CHECK on
-- purpose, so a future verified order has to widen it deliberately.
--
-- A sequence is a *list*, not a date: release order and narrative order of the
-- same continuity are two sequences, so they cannot live in chronology_entries
-- (one position per work per continuity). chronology_entries and
-- chronology_relations stay empty: nothing here is a verified chronology.
--
-- Items reference continuity_memberships, so a work can only be sequenced in a
-- continuity it belongs to.

CREATE TABLE sequences (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seed_key text,
  franchise_id bigint NOT NULL REFERENCES franchises(id),
  continuity_id bigint NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  sequence_type text NOT NULL CHECK (sequence_type IN ('release', 'narrative')),
  ordering_basis text NOT NULL CHECK (btrim(ordering_basis) <> ''),
  certainty text NOT NULL DEFAULT 'unknown'
    CHECK (certainty IN ('confirmed', 'estimated', 'disputed', 'unknown')),
  origin text NOT NULL DEFAULT 'editorial_proposal'
    CHECK (origin IN ('editorial_proposal')),
  notes text,
  source_id bigint REFERENCES sources(id),
  review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'reviewed', 'rejected')),
  reviewed_at date,
  reviewed_by text,
  CONSTRAINT sequences_review_needs_date
    CHECK (review_status <> 'reviewed' OR reviewed_at IS NOT NULL),
  FOREIGN KEY (continuity_id, franchise_id) REFERENCES continuities (id, franchise_id),
  UNIQUE (id, continuity_id)
);
CREATE UNIQUE INDEX sequences_seed_key ON sequences (seed_key) WHERE seed_key IS NOT NULL;
CREATE INDEX sequences_continuity_idx ON sequences (continuity_id);

CREATE TABLE sequence_items (
  sequence_id bigint NOT NULL,
  continuity_id bigint NOT NULL,
  work_id bigint NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  simultaneous_group text,
  certainty text NOT NULL DEFAULT 'unknown'
    CHECK (certainty IN ('confirmed', 'estimated', 'disputed', 'unknown')),
  review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'reviewed', 'rejected')),
  PRIMARY KEY (sequence_id, work_id),
  UNIQUE (sequence_id, position),
  FOREIGN KEY (sequence_id, continuity_id) REFERENCES sequences (id, continuity_id) ON DELETE CASCADE,
  FOREIGN KEY (continuity_id, work_id) REFERENCES continuity_memberships (continuity_id, work_id)
);
CREATE INDEX sequence_items_work_idx ON sequence_items (work_id);
