-- Proposed PostgreSQL model. Not applied to any database in this repository;
-- it is loaded and exercised by db/test/schema.test.mjs against the PostgreSQL
-- engine. Imported metadata and editorial relationships stay separate.
--
-- Editorial judgement that a constraint cannot express (are two sources really
-- independent? is a chronology "confirmed"?) remains a review task: no schema
-- can certify it. There are no users, roles or row-level security yet.
--
-- Error codes are chosen so the tests can tell a rule apart from a typo:
-- check_violation for editorial rules, foreign_key_violation for dangling
-- references, unique_violation for duplicates. An impossible calendar date is
-- refused while evaluating make_date() and surfaces as datetime_field_overflow
-- (22008) instead.
--
-- Invariants that read other rows (work hierarchy, chronology cycles, location
-- cycles) are triggers; everything else stays declarative. db/test/schema.test.mjs
-- exercises each rule against the engine.

CREATE TABLE sources (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL CHECK (btrim(title) <> ''),
  url text,
  accessed_on date,
  attribution text,
  license_notes text
);

-- A work is a film, a series, a season or an episode. Which parent each format
-- may have, and refusing parent cycles, cannot be expressed in a CHECK because
-- it reads other rows: see enforce_work_hierarchy().
CREATE TABLE works (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL CHECK (btrim(title) <> ''),
  format text NOT NULL CHECK (format IN ('film', 'series', 'season', 'episode')),
  parent_work_id bigint REFERENCES works(id),
  is_animation boolean NOT NULL DEFAULT false,
  is_anime boolean NOT NULL DEFAULT false,
  episode_count integer CHECK (episode_count >= 0),
  synopsis text,
  CHECK (parent_work_id IS NULL OR parent_work_id <> id),
  -- Only a series or a season contains episodes, so only they may carry a count.
  CHECK (episode_count IS NULL OR format IN ('series', 'season'))
);
CREATE INDEX works_parent_idx ON works (parent_work_id);

CREATE FUNCTION enforce_work_hierarchy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_format text;
BEGIN
  IF NEW.parent_work_id IS NULL THEN
    IF NEW.format IN ('season', 'episode') THEN
      RAISE EXCEPTION 'a % needs a parent work', NEW.format USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.format IN ('film', 'series') THEN
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

  -- No cycle check is needed here: a season only hangs from a series and an
  -- episode from a season or a series, so the tree can only go downwards. A
  -- free-form hierarchy such as locations does need one, see
  -- enforce_location_hierarchy().
  RETURN NEW;
END $$;

CREATE TRIGGER works_hierarchy BEFORE INSERT OR UPDATE OF parent_work_id, format ON works
  FOR EACH ROW EXECUTE FUNCTION enforce_work_hierarchy();

CREATE TABLE franchises (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (btrim(name) <> '')
);

CREATE TABLE continuities (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  franchise_id bigint NOT NULL REFERENCES franchises(id),
  name text NOT NULL CHECK (btrim(name) <> ''),
  UNIQUE (franchise_id, name),
  -- Lets memberships below check both facts with one reference.
  UNIQUE (id, franchise_id)
);

CREATE TABLE franchise_memberships (
  work_id bigint NOT NULL REFERENCES works(id),
  franchise_id bigint NOT NULL REFERENCES franchises(id),
  source_id bigint REFERENCES sources(id),
  PRIMARY KEY (work_id, franchise_id)
);
CREATE INDEX franchise_memberships_franchise_idx ON franchise_memberships (franchise_id);

-- franchise_id is redundant but purposeful: the two references together refuse
-- a continuity membership in a franchise the work does not belong to.
CREATE TABLE continuity_memberships (
  continuity_id bigint NOT NULL,
  work_id bigint NOT NULL,
  franchise_id bigint NOT NULL,
  source_id bigint REFERENCES sources(id),
  PRIMARY KEY (continuity_id, work_id),
  FOREIGN KEY (continuity_id, franchise_id) REFERENCES continuities (id, franchise_id),
  FOREIGN KEY (work_id, franchise_id) REFERENCES franchise_memberships (work_id, franchise_id)
);
CREATE INDEX continuity_memberships_work_idx ON continuity_memberships (work_id);

-- position is editorial ordering inside a continuity; it is not a date.
CREATE TABLE chronology_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  continuity_id bigint NOT NULL REFERENCES continuities(id),
  work_id bigint NOT NULL,
  position numeric,
  placement text NOT NULL DEFAULT 'unknown'
    CHECK (placement IN ('confirmed', 'estimated', 'disputed', 'unknown')),
  notes text,
  source_id bigint REFERENCES sources(id),
  UNIQUE (continuity_id, work_id),
  UNIQUE (continuity_id, id),
  -- Ordering only makes sense for works inside that continuity.
  FOREIGN KEY (continuity_id, work_id) REFERENCES continuity_memberships (continuity_id, work_id)
);
CREATE INDEX chronology_entries_work_idx ON chronology_entries (work_id);

-- Both entries must live in the same continuity: one shared continuity_id takes
-- part in both references. Cycles are refused by enforce_chronology_order().
CREATE TABLE chronology_relations (
  continuity_id bigint NOT NULL,
  earlier_entry_id bigint NOT NULL,
  later_entry_id bigint NOT NULL,
  relationship text NOT NULL CHECK (relationship IN ('before', 'simultaneous', 'overlaps')),
  certainty text NOT NULL CHECK (certainty IN ('confirmed', 'estimated', 'disputed', 'unknown')),
  source_id bigint REFERENCES sources(id),
  PRIMARY KEY (earlier_entry_id, later_entry_id, relationship),
  CHECK (earlier_entry_id <> later_entry_id),
  FOREIGN KEY (continuity_id, earlier_entry_id) REFERENCES chronology_entries (continuity_id, id),
  FOREIGN KEY (continuity_id, later_entry_id) REFERENCES chronology_entries (continuity_id, id)
);
CREATE INDEX chronology_relations_later_idx ON chronology_relations (later_entry_id);

CREATE FUNCTION enforce_chronology_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Storing "A before B" while B already reaches A would make the ordering
  -- unsatisfiable, so the graph is kept acyclic.
  IF NEW.relationship = 'before' AND EXISTS (
    WITH RECURSIVE reachable AS (
      SELECT later_entry_id AS node FROM chronology_relations
       WHERE relationship = 'before' AND earlier_entry_id = NEW.later_entry_id
      UNION
      SELECT r.later_entry_id
        FROM chronology_relations r JOIN reachable ON r.earlier_entry_id = reachable.node
       WHERE r.relationship = 'before'
    )
    SELECT 1 FROM reachable WHERE node = NEW.earlier_entry_id
  ) THEN
    RAISE EXCEPTION 'chronology % -> % would create a cycle',
      NEW.earlier_entry_id, NEW.later_entry_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER chronology_relations_order
  BEFORE INSERT OR UPDATE OF earlier_entry_id, later_entry_id, relationship ON chronology_relations
  FOR EACH ROW EXECUTE FUNCTION enforce_chronology_order();

CREATE TABLE companies (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (btrim(name) <> '')
);

-- A claim about corporate structure, not a verified ownership fact. Restricting
-- the vocabulary is what lets the cycle trigger below reason about ancestry.
CREATE TABLE company_relationships (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_company_id bigint NOT NULL REFERENCES companies(id),
  child_company_id bigint NOT NULL REFERENCES companies(id),
  relationship text NOT NULL CHECK (relationship IN ('parent_company', 'division', 'joint_venture')),
  valid_from date,
  valid_until date,
  source_id bigint REFERENCES sources(id),
  CHECK (parent_company_id <> child_company_id),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);
CREATE INDEX company_relationships_parent_idx ON company_relationships (parent_company_id);
CREATE INDEX company_relationships_child_idx ON company_relationships (child_company_id);

CREATE FUNCTION enforce_company_parent_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.relationship <> 'parent_company' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    WITH RECURSIVE ancestors(company_id) AS (
      SELECT NEW.parent_company_id
      UNION
      SELECT r.parent_company_id
        FROM company_relationships r
        JOIN ancestors a ON r.child_company_id = a.company_id
       WHERE r.relationship = 'parent_company'
         AND r.id <> COALESCE(NEW.id, -1)
    )
    SELECT 1 FROM ancestors WHERE company_id = NEW.child_company_id
  ) THEN
    RAISE EXCEPTION 'parent claim would create a corporate cycle'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER company_relationships_cycle
  BEFORE INSERT OR UPDATE OF parent_company_id, child_company_id, relationship
  ON company_relationships FOR EACH ROW EXECUTE FUNCTION enforce_company_parent_cycle();

-- Which company a franchise is catalogued under. Separate from production and
-- distribution credits on individual works, which live in work_companies.
CREATE TABLE franchise_companies (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  franchise_id bigint NOT NULL REFERENCES franchises(id),
  company_id bigint NOT NULL REFERENCES companies(id),
  relationship text NOT NULL CHECK (relationship IN ('catalog_association', 'rights_holder', 'production')),
  valid_from date,
  valid_until date,
  source_id bigint REFERENCES sources(id),
  UNIQUE (franchise_id, company_id, relationship),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);
CREATE INDEX franchise_companies_company_idx ON franchise_companies (company_id);

CREATE TABLE work_companies (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_id bigint NOT NULL REFERENCES works(id),
  company_id bigint NOT NULL REFERENCES companies(id),
  role text NOT NULL CHECK (role IN ('production', 'distribution', 'rights_holder')),
  territory text,
  valid_from date,
  valid_until date,
  source_id bigint REFERENCES sources(id),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);
CREATE INDEX work_companies_work_idx ON work_companies (work_id);
CREATE INDEX work_companies_company_idx ON work_companies (company_id);

CREATE TABLE people (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (btrim(name) <> '')
);

CREATE TABLE credits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_id bigint NOT NULL REFERENCES works(id),
  person_id bigint NOT NULL REFERENCES people(id),
  role text NOT NULL CHECK (role IN ('director', 'screenwriter', 'producer', 'cast', 'other')),
  character_name text,
  source_id bigint REFERENCES sources(id),
  -- Only a cast credit can name a character.
  CHECK (character_name IS NULL OR role = 'cast')
);
CREATE INDEX credits_work_idx ON credits (work_id);
CREATE INDEX credits_person_idx ON credits (person_id);

-- Dates are validated as real calendar dates: 31 February or 29 February in a
-- non-leap year are refused. Precision is not invented: month and day are
-- optional, and a day requires a month.
CREATE TABLE releases (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_id bigint NOT NULL REFERENCES works(id),
  territory text,
  release_kind text,
  release_year integer NOT NULL CHECK (release_year BETWEEN 1800 AND 2200),
  release_month integer CHECK (release_month BETWEEN 1 AND 12),
  release_day integer CHECK (release_day BETWEEN 1 AND 31),
  source_id bigint REFERENCES sources(id),
  CHECK (release_day IS NULL OR release_month IS NOT NULL),
  CHECK (release_day IS NULL OR make_date(release_year, release_month, release_day) IS NOT NULL)
);
CREATE INDEX releases_work_idx ON releases (work_id);

CREATE TABLE locations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id bigint REFERENCES locations(id),
  name text NOT NULL CHECK (btrim(name) <> ''),
  kind text NOT NULL CHECK (kind IN ('universe', 'world', 'region', 'place')),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX locations_parent_idx ON locations (parent_id);

CREATE FUNCTION enforce_location_hierarchy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM locations WHERE id = NEW.parent_id) THEN
    RAISE EXCEPTION 'parent location % does not exist', NEW.parent_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id FROM locations WHERE id = NEW.parent_id
      UNION ALL
      SELECT l.id, l.parent_id
        FROM locations l JOIN ancestors a ON l.id = a.parent_id
    )
    SELECT 1 FROM ancestors WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'parent location % would create a cycle', NEW.parent_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER locations_hierarchy BEFORE INSERT OR UPDATE OF parent_id ON locations
  FOR EACH ROW EXECUTE FUNCTION enforce_location_hierarchy();

CREATE TABLE narrative_periods (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_id bigint NOT NULL REFERENCES works(id),
  label text NOT NULL CHECK (btrim(label) <> ''),
  calendar text,
  era text,
  certainty text NOT NULL CHECK (certainty IN ('confirmed', 'estimated', 'disputed', 'unknown')),
  is_primary boolean NOT NULL DEFAULT false,
  source_id bigint REFERENCES sources(id)
);
CREATE INDEX narrative_periods_work_idx ON narrative_periods (work_id);
-- At most one primary period per work.
CREATE UNIQUE INDEX narrative_periods_one_primary_idx
  ON narrative_periods (work_id) WHERE is_primary;

CREATE TABLE work_locations (
  work_id bigint NOT NULL REFERENCES works(id),
  location_id bigint NOT NULL REFERENCES locations(id),
  source_id bigint REFERENCES sources(id),
  PRIMARY KEY (work_id, location_id)
);
CREATE INDEX work_locations_location_idx ON work_locations (location_id);

CREATE TABLE tags (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  rationale text,
  source_id bigint REFERENCES sources(id)
);

CREATE TABLE work_tags (
  work_id bigint NOT NULL REFERENCES works(id),
  tag_id bigint NOT NULL REFERENCES tags(id),
  PRIMARY KEY (work_id, tag_id)
);
CREATE INDEX work_tags_tag_idx ON work_tags (tag_id);

-- Provider payloads are stored verbatim and never treated as curated facts.
CREATE TABLE imported_metadata (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_id bigint REFERENCES works(id),
  provider text NOT NULL CHECK (btrim(provider) <> ''),
  external_id text NOT NULL CHECK (btrim(external_id) <> ''),
  payload jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  source_id bigint REFERENCES sources(id),
  UNIQUE (provider, external_id)
);
CREATE INDEX imported_metadata_work_idx ON imported_metadata (work_id);

CREATE TABLE saved_views (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (btrim(name) <> ''),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object')
);

-- Presentation preferences. A year-only release date is never converted, so the
-- calendar here is a display default, not permission to invent precision.
CREATE TABLE viewer_preferences (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  viewer_key text NOT NULL UNIQUE CHECK (btrim(viewer_key) <> ''),
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es')),
  theme text NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light', 'system')),
  calendar text NOT NULL DEFAULT 'gregory'
    CHECK (calendar IN ('gregory', 'hebrew', 'islamic-civil', 'islamic-umalqura', 'islamic-tbla')),
  timeline_scale text NOT NULL DEFAULT 'proportional'
    CHECK (timeline_scale IN ('equal', 'proportional', 'log')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Artwork provenance. An expired provider cache must be removed rather than
-- silently republished; locally owned images have no provider expiry.
CREATE TABLE posters (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_id bigint NOT NULL UNIQUE REFERENCES works(id),
  source text NOT NULL CHECK (source IN ('tmdb', 'local', 'other')),
  provider_image_path text,
  file_name text NOT NULL CHECK (btrim(file_name) <> ''),
  attribution text,
  license_notes text,
  cached_at timestamptz,
  expires_at timestamptz,
  content_sha256 char(64),
  source_id bigint REFERENCES sources(id),
  CHECK (source = 'local' OR expires_at IS NOT NULL),
  CHECK (expires_at IS NULL OR cached_at IS NULL OR expires_at > cached_at),
  CHECK ((source = 'tmdb') = (provider_image_path IS NOT NULL))
);

-- Editorial policy, visible rather than enforced: which claims carry no source.
CREATE VIEW claims_without_source AS
  SELECT 'credit' AS kind, c.id AS claim_id, c.work_id FROM credits c WHERE c.source_id IS NULL
  UNION ALL
  SELECT 'release', r.id, r.work_id FROM releases r WHERE r.source_id IS NULL
  UNION ALL
  SELECT 'narrative_period', p.id, p.work_id FROM narrative_periods p WHERE p.source_id IS NULL
  UNION ALL
  SELECT 'chronology_entry', e.id, e.work_id FROM chronology_entries e WHERE e.source_id IS NULL
  UNION ALL
  SELECT 'chronology_relation', NULL::bigint, e.work_id
    FROM chronology_relations r JOIN chronology_entries e ON e.id = r.earlier_entry_id
   WHERE r.source_id IS NULL
  UNION ALL
  SELECT 'work_company', w.id, w.work_id FROM work_companies w WHERE w.source_id IS NULL
  UNION ALL
  SELECT 'company_relationship', c.id, NULL::bigint
    FROM company_relationships c WHERE c.source_id IS NULL
  UNION ALL
  SELECT 'franchise_membership', NULL::bigint, m.work_id
    FROM franchise_memberships m WHERE m.source_id IS NULL
  UNION ALL
  SELECT 'continuity_membership', NULL::bigint, m.work_id
    FROM continuity_memberships m WHERE m.source_id IS NULL
  UNION ALL
  SELECT 'work_location', NULL::bigint, l.work_id FROM work_locations l WHERE l.source_id IS NULL
  UNION ALL
  SELECT 'tag', t.id, NULL::bigint FROM tags t WHERE t.source_id IS NULL
  UNION ALL
  SELECT 'franchise_company', f.id, NULL::bigint FROM franchise_companies f WHERE f.source_id IS NULL;
