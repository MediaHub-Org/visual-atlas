-- Fifth migration: text media, comics and manga
-- (docs/superpowers/specs/2026-11-24-text-media-design.md).
--
-- The medium is derived from works.format, never stored: film / series / season /
-- episode are video, comic_series / manga_series / graphic_novel are text. A text
-- work has no parent and none of the video-only attributes (anime / animation
-- flags; the episode_count CHECK already limits that count to series and seasons).
--
-- adaptations links a source work to the work adapted from it, in either medium
-- direction. A link is an editorial claim: certainty starts 'unknown', the import
-- never writes 'confirmed', and review_status starts 'needs_review'.

ALTER TABLE works DROP CONSTRAINT works_format_check;
ALTER TABLE works ADD CONSTRAINT works_format_check
  CHECK (format IN ('film', 'series', 'season', 'episode', 'comic_series', 'manga_series', 'graphic_novel'));
ALTER TABLE works ADD CONSTRAINT works_text_has_no_video_flags
  CHECK (format NOT IN ('comic_series', 'manga_series', 'graphic_novel') OR (NOT is_anime AND NOT is_animation));

CREATE OR REPLACE FUNCTION enforce_work_hierarchy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_format text;
BEGIN
  IF NEW.parent_work_id IS NULL THEN
    IF NEW.format IN ('season', 'episode') THEN
      RAISE EXCEPTION 'a % needs a parent work', NEW.format USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.format IN ('film', 'series', 'comic_series', 'manga_series', 'graphic_novel') THEN
    RAISE EXCEPTION 'a % cannot have a parent work', NEW.format USING ERRCODE = 'check_violation';
  END IF;

  SELECT format INTO parent_format FROM works WHERE id = NEW.parent_work_id;
  IF parent_format IS NULL THEN
    RAISE EXCEPTION 'parent work % does not exist', NEW.parent_work_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.format = 'season' AND parent_format <> 'series' THEN
    RAISE EXCEPTION 'a season belongs to a series, not to a %', parent_format
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.format = 'episode' AND parent_format NOT IN ('season', 'series') THEN
    RAISE EXCEPTION 'an episode belongs to a season or a series, not to a %', parent_format
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

CREATE TABLE adaptations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seed_key text,
  source_work_id bigint NOT NULL REFERENCES works(id),
  adapted_work_id bigint NOT NULL REFERENCES works(id),
  kind text NOT NULL
    CHECK (kind IN ('anime', 'film', 'live_action', 'series', 'comic', 'novelisation', 'other')),
  certainty text NOT NULL DEFAULT 'unknown'
    CHECK (certainty IN ('unknown', 'estimated', 'confirmed')),
  source_id bigint REFERENCES sources(id),
  review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review', 'reviewed', 'rejected')),
  reviewed_at date,
  reviewed_by text,
  notes text,
  CONSTRAINT adaptations_not_self CHECK (source_work_id <> adapted_work_id),
  CONSTRAINT adaptations_review_needs_date
    CHECK (review_status <> 'reviewed' OR reviewed_at IS NOT NULL),
  UNIQUE (source_work_id, adapted_work_id, kind)
);
CREATE UNIQUE INDEX adaptations_seed_key ON adaptations (seed_key) WHERE seed_key IS NOT NULL;
CREATE INDEX adaptations_adapted_idx ON adaptations (adapted_work_id);
