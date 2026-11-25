-- Seventh migration: remasters and announced works (owner request, 2026-11-25).
--
-- remaster_of / remaster_kind: a film or series that re-releases another film or series
-- (3d conversion, restoration, special edition). It is a separate work so a person can
-- show or hide remasters; it never counts towards a franchise. Comics and manga never
-- have one: another edition of a comic is not a remaster here.
--
-- release_status: 'announced' for a work that has been announced and has no release yet
-- (an untitled Bond film, a new series), 'released' otherwise.

ALTER TABLE works ADD COLUMN release_status text NOT NULL DEFAULT 'released';
ALTER TABLE works ADD CONSTRAINT works_release_status_check CHECK (release_status IN ('released', 'announced'));

ALTER TABLE works ADD COLUMN remaster_of bigint REFERENCES works(id);
ALTER TABLE works ADD COLUMN remaster_kind text;
ALTER TABLE works ADD CONSTRAINT works_remaster_kind_check CHECK (remaster_kind IN ('3d', 'restoration', 'special_edition'));
ALTER TABLE works ADD CONSTRAINT works_remaster_pair_check CHECK ((remaster_of IS NULL) = (remaster_kind IS NULL));
ALTER TABLE works ADD CONSTRAINT works_remaster_not_self_check CHECK (remaster_of IS NULL OR remaster_of <> id);
ALTER TABLE works ADD CONSTRAINT works_remaster_video_only_check CHECK (remaster_of IS NULL OR format IN ('film', 'series'));
CREATE INDEX works_remaster_of_idx ON works (remaster_of);

CREATE OR REPLACE FUNCTION enforce_remaster() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  original works%ROWTYPE;
BEGIN
  IF NEW.remaster_of IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO original FROM works WHERE id = NEW.remaster_of;
  IF original.id IS NULL THEN
    RAISE EXCEPTION 'remaster of a work that does not exist' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF original.format NOT IN ('film', 'series') THEN
    RAISE EXCEPTION 'a remaster can only re-release a film or a series' USING ERRCODE = 'check_violation';
  END IF;
  IF original.format <> NEW.format THEN
    RAISE EXCEPTION 'a remaster has the same format as the work it re-releases' USING ERRCODE = 'check_violation';
  END IF;
  IF original.remaster_of IS NOT NULL THEN
    RAISE EXCEPTION 'a remaster cannot re-release another remaster' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER works_remaster_trigger
  BEFORE INSERT OR UPDATE OF remaster_of, format ON works
  FOR EACH ROW EXECUTE FUNCTION enforce_remaster();
