-- Proposed PostgreSQL model. Not yet applied to a database.
-- Imported metadata and editorial relationships are deliberately separate.
CREATE TABLE sources (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL,
  url text,
  accessed_on date,
  attribution text,
  license_notes text
);

CREATE TABLE works (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL,
  format text NOT NULL CHECK (format IN ('film', 'series', 'season', 'episode')),
  parent_work_id bigint REFERENCES works(id),
  is_animation boolean NOT NULL DEFAULT false,
  is_anime boolean NOT NULL DEFAULT false,
  episode_count integer CHECK (episode_count >= 0),
  synopsis text,
  CHECK (parent_work_id IS NULL OR parent_work_id <> id)
);

CREATE TABLE franchises (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL);
CREATE TABLE continuities (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  franchise_id bigint NOT NULL REFERENCES franchises(id),
  name text NOT NULL,
  UNIQUE (franchise_id, name)
);
CREATE TABLE franchise_memberships (
  work_id bigint NOT NULL REFERENCES works(id),
  franchise_id bigint NOT NULL REFERENCES franchises(id),
  source_id bigint REFERENCES sources(id),
  PRIMARY KEY (work_id, franchise_id)
);
CREATE TABLE continuity_memberships (
  work_id bigint NOT NULL REFERENCES works(id),
  continuity_id bigint NOT NULL REFERENCES continuities(id),
  source_id bigint REFERENCES sources(id),
  PRIMARY KEY (work_id, continuity_id)
);
CREATE TABLE chronology_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  continuity_id bigint NOT NULL REFERENCES continuities(id),
  work_id bigint NOT NULL REFERENCES works(id),
  position numeric,
  placement text NOT NULL DEFAULT 'unknown' CHECK (placement IN ('confirmed', 'estimated', 'disputed', 'unknown')),
  notes text,
  source_id bigint REFERENCES sources(id),
  UNIQUE (continuity_id, work_id)
);
CREATE TABLE chronology_relations (
  earlier_entry_id bigint NOT NULL REFERENCES chronology_entries(id),
  later_entry_id bigint NOT NULL REFERENCES chronology_entries(id),
  relationship text NOT NULL CHECK (relationship IN ('before', 'simultaneous', 'overlaps')),
  certainty text NOT NULL CHECK (certainty IN ('confirmed', 'estimated', 'disputed', 'unknown')),
  source_id bigint REFERENCES sources(id),
  PRIMARY KEY (earlier_entry_id, later_entry_id, relationship),
  CHECK (earlier_entry_id <> later_entry_id)
);

CREATE TABLE companies (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL);
CREATE TABLE company_relationships (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_company_id bigint NOT NULL REFERENCES companies(id),
  child_company_id bigint NOT NULL REFERENCES companies(id),
  relationship text NOT NULL,
  valid_from date, valid_until date,
  source_id bigint REFERENCES sources(id),
  CHECK (parent_company_id <> child_company_id),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);
CREATE TABLE work_companies (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_id bigint NOT NULL REFERENCES works(id),
  company_id bigint NOT NULL REFERENCES companies(id),
  role text NOT NULL CHECK (role IN ('production', 'distribution', 'rights_holder')),
  territory text, valid_from date, valid_until date,
  source_id bigint REFERENCES sources(id),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);
CREATE TABLE people (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL);
CREATE TABLE credits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_id bigint NOT NULL REFERENCES works(id),
  person_id bigint NOT NULL REFERENCES people(id),
  role text NOT NULL CHECK (role IN ('director', 'screenwriter', 'producer', 'cast', 'other')),
  character_name text, source_id bigint REFERENCES sources(id)
);
CREATE TABLE releases (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_id bigint NOT NULL REFERENCES works(id),
  territory text, release_kind text,
  release_year integer NOT NULL,
  release_month integer CHECK (release_month BETWEEN 1 AND 12),
  release_day integer CHECK (release_day BETWEEN 1 AND 31),
  source_id bigint REFERENCES sources(id),
  CHECK (release_day IS NULL OR release_month IS NOT NULL)
);
CREATE TABLE locations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id bigint REFERENCES locations(id),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('universe', 'world', 'region', 'place')),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE TABLE narrative_periods (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_id bigint NOT NULL REFERENCES works(id),
  label text NOT NULL, calendar text, era text,
  certainty text NOT NULL CHECK (certainty IN ('confirmed', 'estimated', 'disputed', 'unknown')),
  is_primary boolean NOT NULL DEFAULT false,
  source_id bigint REFERENCES sources(id)
);
CREATE TABLE work_locations (
  work_id bigint NOT NULL REFERENCES works(id),
  location_id bigint NOT NULL REFERENCES locations(id),
  source_id bigint REFERENCES sources(id),
  PRIMARY KEY (work_id, location_id)
);
CREATE TABLE tags (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE,
  rationale text, source_id bigint REFERENCES sources(id)
);
CREATE TABLE work_tags (
  work_id bigint NOT NULL REFERENCES works(id),
  tag_id bigint NOT NULL REFERENCES tags(id),
  PRIMARY KEY (work_id, tag_id)
);
CREATE TABLE imported_metadata (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_id bigint REFERENCES works(id),
  provider text NOT NULL, external_id text NOT NULL,
  payload jsonb NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(),
  source_id bigint REFERENCES sources(id),
  UNIQUE (provider, external_id)
);
CREATE TABLE saved_views (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL, state jsonb NOT NULL
);
