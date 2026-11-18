# Database design

`schema.sql` is a proposed initial PostgreSQL schema, not a running database or
migration. It separates imported payloads from curated relationships. The UI
currently reads a separate local demonstration dataset, not this schema.

Before deployment, validate real dates (including leap days), chronology
relationships within a continuity, hierarchy cycles, season/episode parent
types, source requirements, access control, migrations and indexes. No schema
constraints should be mistaken for a complete editorial validation policy.
