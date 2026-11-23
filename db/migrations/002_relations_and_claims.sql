-- Second import pass (db/IMPORT.md, 2026-11-23): relations and claims.
--
-- The first migration covered the five entities and left the review columns on
-- the four claim join tables. Continuities and company claims are entities of
-- their own, so they need the same state: an imported row is 'needs_review' and
-- only a person may mark it 'reviewed', which then requires the date.
--
-- seed_key is the id from the conversation export, kept verbatim so a re-import
-- upserts instead of matching by name.
--
-- membership_type keeps the export's distinction between an 'included' work and
-- a 'related_series'; losing it would turn every row into the same claim.

ALTER TABLE continuities
  ADD COLUMN seed_key text,
  ADD COLUMN review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'reviewed', 'rejected')),
  ADD COLUMN reviewed_at date,
  ADD COLUMN reviewed_by text,
  ADD CONSTRAINT continuities_review_needs_date
    CHECK (review_status <> 'reviewed' OR reviewed_at IS NOT NULL);
CREATE UNIQUE INDEX continuities_seed_key ON continuities (seed_key) WHERE seed_key IS NOT NULL;

ALTER TABLE company_relationships
  ADD COLUMN seed_key text,
  ADD COLUMN review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'reviewed', 'rejected')),
  ADD COLUMN reviewed_at date,
  ADD COLUMN reviewed_by text,
  ADD CONSTRAINT company_relationships_review_needs_date
    CHECK (review_status <> 'reviewed' OR reviewed_at IS NOT NULL);
CREATE UNIQUE INDEX company_relationships_seed_key
  ON company_relationships (seed_key) WHERE seed_key IS NOT NULL;

ALTER TABLE franchise_memberships
  ADD COLUMN membership_type text NOT NULL DEFAULT 'included'
    CHECK (membership_type IN ('included', 'related_series'));

ALTER TABLE continuity_memberships
  ADD COLUMN membership_type text NOT NULL DEFAULT 'included'
    CHECK (membership_type IN ('included', 'related_series'));

-- The tag links are editorial too, so they carry the same draft state.
ALTER TABLE work_tags
  ADD COLUMN review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'reviewed', 'rejected'));
