// Database-level tests for db/schema.sql, run against a real PostgreSQL engine
// (@electric-sql/pglite, PostgreSQL in WebAssembly) instead of a parser.
//
// Each test gets a fresh database with the schema applied, so the order of
// tests cannot hide a bug. Run with: npm run test:db
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

async function withDb(run) {
  const db = new PGlite();
  try {
    await db.exec(schema);
    return await run(db);
  } finally {
    await db.close();
  }
}

/**
 * Asserts that the statement is refused with one of the expected SQLSTATEs.
 * Impossible calendar dates are refused while evaluating make_date(), which
 * raises 22008 (datetime field overflow) instead of a constraint violation.
 */
async function refuses(db, sql, codes, params) {
  const expected = Array.isArray(codes) ? codes : [codes];
  await assert.rejects(
    () => db.query(sql, params),
    (error) => {
      assert.ok(
        expected.includes(error.code),
        `expected SQLSTATE ${expected.join(' or ')} but got ${error.code}: ${error.message}`,
      );
      return true;
    },
  );
}

async function one(db, sql, params) {
  const result = await db.query(sql, params);
  assert.equal(result.rows.length, 1, `expected one row from: ${sql}`);
  return result.rows[0];
}

const id = async (db, sql, params) => (await one(db, sql, params)).id;

/** A franchise, a work inside it and a continuity of that franchise. */
async function seededContinuity(db, name = 'Franchise') {
  const franchiseId = await id(db, 'insert into franchises (name) values ($1) returning id', [name]);
  const continuityId = await id(
    db,
    'insert into continuities (franchise_id, name) values ($1, $2) returning id',
    [franchiseId, `${name} continuity`],
  );
  const workId = await id(db, "insert into works (title, format) values ($1, 'film') returning id", [
    `${name} film`,
  ]);
  await db.query('insert into franchise_memberships (work_id, franchise_id) values ($1, $2)', [
    workId,
    franchiseId,
  ]);
  await db.query(
    'insert into continuity_memberships (continuity_id, work_id, franchise_id) values ($1, $2, $3)',
    [continuityId, workId, franchiseId],
  );
  return { franchiseId, continuityId, workId };
}

describe('schema', () => {
  it('applies to an empty database', async () => {
    await withDb(async (db) => {
      const { rows } = await db.query(
        "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
      );
      const tables = rows.map((row) => row.table_name);
      for (const table of [
        'sources', 'works', 'franchises', 'continuities', 'chronology_entries',
        'chronology_relations', 'releases', 'locations', 'narrative_periods',
        'credits', 'imported_metadata', 'saved_views',
      ]) {
        assert.ok(tables.includes(table), `missing table ${table}`);
      }
      assert.ok(tables.includes('claims_without_source'), 'missing claim view');
    });
  });

  it('indexes the foreign keys used for lookups', async () => {
    await withDb(async (db) => {
      const { rows } = await db.query(
        "select indexname from pg_indexes where schemaname = 'public'",
      );
      const names = rows.map((row) => row.indexname);
      for (const index of [
        'works_parent_idx',
        'chronology_relations_later_idx',
        'releases_work_idx',
        'credits_work_idx',
        'locations_parent_idx',
        'continuity_memberships_work_idx',
      ]) {
        assert.ok(names.includes(index), `missing index ${index}`);
      }
    });
  });
});

describe('work hierarchy', () => {
  it('accepts series, season and episode in order', async () => {
    await withDb(async (db) => {
      const series = await id(db, "insert into works (title, format, episode_count) values ('S', 'series', 10) returning id");
      const season = await id(
        db,
        "insert into works (title, format, parent_work_id) values ('S1', 'season', $1) returning id",
        [series],
      );
      await db.query(
        "insert into works (title, format, parent_work_id) values ('S1E1', 'episode', $1)",
        [season],
      );
      // An episode may also hang directly from a series.
      await db.query(
        "insert into works (title, format, parent_work_id) values ('S-extra', 'episode', $1)",
        [series],
      );
    });
  });

  it('refuses a film or a series with a parent', async () => {
    await withDb(async (db) => {
      const series = await id(db, "insert into works (title, format) values ('S', 'series') returning id");
      await refuses(
        db,
        "insert into works (title, format, parent_work_id) values ('F', 'film', $1)",
        '23514',
        [series],
      );
      await refuses(
        db,
        "insert into works (title, format, parent_work_id) values ('S2', 'series', $1)",
        '23514',
        [series],
      );
    });
  });

  it('refuses a season under anything but a series', async () => {
    await withDb(async (db) => {
      const film = await id(db, "insert into works (title, format) values ('F', 'film') returning id");
      await refuses(
        db,
        "insert into works (title, format, parent_work_id) values ('S1', 'season', $1)",
        '23514',
        [film],
      );
    });
  });

  it('refuses an episode under a film', async () => {
    await withDb(async (db) => {
      const film = await id(db, "insert into works (title, format) values ('F', 'film') returning id");
      await refuses(
        db,
        "insert into works (title, format, parent_work_id) values ('E', 'episode', $1)",
        '23514',
        [film],
      );
    });
  });

  it('refuses a season or episode with no parent', async () => {
    await withDb(async (db) => {
      await refuses(db, "insert into works (title, format) values ('S1', 'season')", '23514');
      await refuses(db, "insert into works (title, format) values ('E1', 'episode')", '23514');
    });
  });

  it('refuses a dangling parent', async () => {
    await withDb(async (db) => {
      await refuses(
        db,
        "insert into works (title, format, parent_work_id) values ('E', 'episode', 999) returning id",
        '23503',
      );
    });
  });

  it('refuses a self parent', async () => {
    await withDb(async (db) => {
      const series = await id(db, "insert into works (title, format) values ('S', 'series') returning id");
      const season = await id(
        db,
        "insert into works (title, format, parent_work_id) values ('S1', 'season', $1) returning id",
        [series],
      );
      await refuses(
        db,
        'update works set parent_work_id = $1 where id = $1',
        '23514',
        [season],
      );
    });
  });

  it('refuses an episode count on a film', async () => {
    await withDb(async (db) => {
      await refuses(
        db,
        "insert into works (title, format, episode_count) values ('F', 'film', 12)",
        '23514',
      );
    });
  });

  it('refuses a blank title', async () => {
    await withDb(async (db) => {
      await refuses(db, "insert into works (title, format) values ('   ', 'film')", '23514');
    });
  });
});

describe('release dates', () => {
  it('accepts a real date, a year alone and a leap day', async () => {
    await withDb(async (db) => {
      const workId = await id(db, "insert into works (title, format) values ('F', 'film') returning id");
      await db.query('insert into releases (work_id, release_year) values ($1, 1999)', [workId]);
      await db.query(
        'insert into releases (work_id, release_year, release_month) values ($1, 1999, 7)',
        [workId],
      );
      await db.query(
        'insert into releases (work_id, release_year, release_month, release_day) values ($1, 2024, 2, 29)',
        [workId],
      );
    });
  });

  it('refuses 31 February', async () => {
    await withDb(async (db) => {
      const workId = await id(db, "insert into works (title, format) values ('F', 'film') returning id");
      await refuses(
        db,
        'insert into releases (work_id, release_year, release_month, release_day) values ($1, 2024, 2, 31)',
        ['23514', '22008'],
        [workId],
      );
    });
  });

  it('refuses 29 February outside a leap year', async () => {
    await withDb(async (db) => {
      const workId = await id(db, "insert into works (title, format) values ('F', 'film') returning id");
      await refuses(
        db,
        'insert into releases (work_id, release_year, release_month, release_day) values ($1, 2023, 2, 29)',
        ['23514', '22008'],
        [workId],
      );
    });
  });

  it('refuses a day without a month', async () => {
    await withDb(async (db) => {
      const workId = await id(db, "insert into works (title, format) values ('F', 'film') returning id");
      await refuses(
        db,
        'insert into releases (work_id, release_year, release_day) values ($1, 2024, 5)',
        '23514',
        [workId],
      );
    });
  });

  it('refuses an impossible month or day', async () => {
    await withDb(async (db) => {
      const workId = await id(db, "insert into works (title, format) values ('F', 'film') returning id");
      await refuses(
        db,
        'insert into releases (work_id, release_year, release_month) values ($1, 2024, 13)',
        '23514',
        [workId],
      );
      await refuses(
        db,
        'insert into releases (work_id, release_year, release_month, release_day) values ($1, 2024, 1, 32)',
        ['23514', '22008'],
        [workId],
      );
    });
  });
});

describe('franchise and continuity membership', () => {
  it('refuses a continuity membership in a franchise the work is not part of', async () => {
    await withDb(async (db) => {
      const { continuityId } = await seededContinuity(db, 'One');
      const otherFranchise = await id(db, "insert into franchises (name) values ('Two') returning id");
      const outsider = await id(db, "insert into works (title, format) values ('Outsider', 'film') returning id");
      await db.query('insert into franchise_memberships (work_id, franchise_id) values ($1, $2)', [
        outsider,
        otherFranchise,
      ]);
      await refuses(
        db,
        'insert into continuity_memberships (continuity_id, work_id, franchise_id) values ($1, $2, $3)',
        '23503',
        [continuityId, outsider, otherFranchise],
      );
    });
  });

  it('refuses a duplicate continuity name inside one franchise but allows it across franchises', async () => {
    await withDb(async (db) => {
      const { franchiseId } = await seededContinuity(db, 'Home');
      await refuses(
        db,
        'insert into continuities (franchise_id, name) values ($1, $2)',
        '23505',
        [franchiseId, 'Home continuity'],
      );
      const other = await id(db, "insert into franchises (name) values ('Away') returning id");
      await db.query('insert into continuities (franchise_id, name) values ($1, $2)', [
        other,
        'Home continuity',
      ]);
    });
  });
});

describe('chronology', () => {
  it('refuses an entry for a work that is not in the continuity', async () => {
    await withDb(async (db) => {
      const { continuityId } = await seededContinuity(db, 'C');
      const stranger = await id(db, "insert into works (title, format) values ('Stranger', 'film') returning id");
      await refuses(
        db,
        'insert into chronology_entries (continuity_id, work_id) values ($1, $2)',
        '23503',
        [continuityId, stranger],
      );
    });
  });

  it('refuses a relation between entries of different continuities', async () => {
    await withDb(async (db) => {
      const first = await seededContinuity(db, 'Alpha');
      const second = await seededContinuity(db, 'Beta');

      const alphaEntry = await id(
        db,
        'insert into chronology_entries (continuity_id, work_id) values ($1, $2) returning id',
        [first.continuityId, first.workId],
      );
      const betaEntry = await id(
        db,
        'insert into chronology_entries (continuity_id, work_id) values ($1, $2) returning id',
        [second.continuityId, second.workId],
      );

      await refuses(
        db,
        `insert into chronology_relations (continuity_id, earlier_entry_id, later_entry_id, relationship, certainty)
         values ($1, $2, $3, 'before', 'confirmed')`,
        '23503',
        [first.continuityId, alphaEntry, betaEntry],
      );
    });
  });

  it('refuses a relation that closes a cycle', async () => {
    await withDb(async (db) => {
      const { continuityId, workId } = await seededContinuity(db, 'Cycle');
      const otherWork = await id(db, "insert into works (title, format) values ('Sequel', 'film') returning id");
      await db.query('insert into franchise_memberships (work_id, franchise_id) select $1, franchise_id from continuities where id = $2', [otherWork, continuityId]);
      await db.query('insert into continuity_memberships (continuity_id, work_id, franchise_id) select $1, $2, franchise_id from continuities where id = $1', [continuityId, otherWork]);

      const first = await id(
        db,
        'insert into chronology_entries (continuity_id, work_id) values ($1, $2) returning id',
        [continuityId, workId],
      );
      const next = await id(
        db,
        'insert into chronology_entries (continuity_id, work_id) values ($1, $2) returning id',
        [continuityId, otherWork],
      );

      await db.query(
        `insert into chronology_relations (continuity_id, earlier_entry_id, later_entry_id, relationship, certainty)
         values ($1, $2, $3, 'before', 'confirmed')`,
        [continuityId, first, next],
      );

      await refuses(
        db,
        `insert into chronology_relations (continuity_id, earlier_entry_id, later_entry_id, relationship, certainty)
         values ($1, $2, $3, 'before', 'confirmed')`,
        '23514',
        [continuityId, next, first],
      );
    });
  });

  it('refuses an entry related to itself', async () => {
    await withDb(async (db) => {
      const { continuityId, workId } = await seededContinuity(db, 'Self');
      const entry = await id(
        db,
        'insert into chronology_entries (continuity_id, work_id) values ($1, $2) returning id',
        [continuityId, workId],
      );
      await refuses(
        db,
        `insert into chronology_relations (continuity_id, earlier_entry_id, later_entry_id, relationship, certainty)
         values ($1, $2, $2, 'before', 'confirmed')`,
        '23514',
        [continuityId, entry],
      );
    });
  });

  it('refuses the same entry twice in one continuity', async () => {
    await withDb(async (db) => {
      const { continuityId, workId } = await seededContinuity(db, 'Once');
      await db.query('insert into chronology_entries (continuity_id, work_id) values ($1, $2)', [
        continuityId,
        workId,
      ]);
      await refuses(
        db,
        'insert into chronology_entries (continuity_id, work_id) values ($1, $2)',
        '23505',
        [continuityId, workId],
      );
    });
  });
});

describe('locations', () => {
  it('accepts nested locations', async () => {
    await withDb(async (db) => {
      const universe = await id(db, "insert into locations (name, kind) values ('U', 'universe') returning id");
      const world = await id(
        db,
        "insert into locations (name, kind, parent_id) values ('W', 'world', $1) returning id",
        [universe],
      );
      await db.query("insert into locations (name, kind, parent_id) values ('P', 'place', $1)", [world]);
    });
  });

  it('refuses a location cycle', async () => {
    await withDb(async (db) => {
      const world = await id(db, "insert into locations (name, kind) values ('W', 'world') returning id");
      const region = await id(
        db,
        "insert into locations (name, kind, parent_id) values ('R', 'region', $1) returning id",
        [world],
      );
      await refuses(
        db,
        'update locations set parent_id = $1 where id = $2',
        '23514',
        [region, world],
      );
    });
  });
});

describe('editorial detail', () => {
  it('refuses a character name on a non-cast credit', async () => {
    await withDb(async (db) => {
      const workId = await id(db, "insert into works (title, format) values ('F', 'film') returning id");
      const personId = await id(db, "insert into people (name) values ('Someone') returning id");
      await refuses(
        db,
        "insert into credits (work_id, person_id, role, character_name) values ($1, $2, 'director', 'Character')",
        '23514',
        [workId, personId],
      );
      await db.query(
        "insert into credits (work_id, person_id, role, character_name) values ($1, $2, 'cast', 'Character')",
        [workId, personId],
      );
    });
  });

  it('allows one primary period per work', async () => {
    await withDb(async (db) => {
      const workId = await id(db, "insert into works (title, format) values ('F', 'film') returning id");
      await db.query(
        "insert into narrative_periods (work_id, label, certainty, is_primary) values ($1, 'first', 'confirmed', true)",
        [workId],
      );
      await refuses(
        db,
        "insert into narrative_periods (work_id, label, certainty, is_primary) values ($1, 'second', 'confirmed', true)",
        '23505',
        [workId],
      );
      await db.query(
        "insert into narrative_periods (work_id, label, certainty, is_primary) values ($1, 'second', 'estimated', false)",
        [workId],
      );
    });
  });

  it('refuses duplicate imported identifiers per provider', async () => {
    await withDb(async (db) => {
      await db.query("insert into imported_metadata (provider, external_id, payload) values ('p', '1', '{}')");
      await refuses(
        db,
        "insert into imported_metadata (provider, external_id, payload) values ('p', '1', '{}')",
        '23505',
      );
      await db.query("insert into imported_metadata (provider, external_id, payload) values ('q', '1', '{}')");
    });
  });

  it('refuses a saved view whose state is not an object', async () => {
    await withDb(async (db) => {
      await db.query("insert into saved_views (name, state) values ('ok', '{\"view\":\"cards\"}')");
      await refuses(db, "insert into saved_views (name, state) values ('bad', '\"cards\"')", '23514');
    });
  });

  it('lists unsourced claims and hides sourced ones', async () => {
    await withDb(async (db) => {
      const sourceId = await id(db, "insert into sources (title) values ('Book') returning id");
      const workId = await id(db, "insert into works (title, format) values ('F', 'film') returning id");
      const personId = await id(db, "insert into people (name) values ('P') returning id");

      await db.query(
        "insert into credits (work_id, person_id, role, source_id) values ($1, $2, 'director', $3)",
        [workId, personId, sourceId],
      );
      await db.query("insert into credits (work_id, person_id, role) values ($1, $2, 'producer')", [
        workId,
        personId,
      ]);

      const { rows } = await db.query('select kind, work_id from claims_without_source');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].kind, 'credit');
      assert.equal(Number(rows[0].work_id), Number(workId));
    });
  });
});

describe('corporate structure and franchise associations', () => {
  async function company(db, name) {
    return id(db, 'insert into companies (name) values ($1) returning id', [name]);
  }

  it('refuses a parent-company cycle', async () => {
    await withDb(async (db) => {
      const a = await company(db, 'A');
      const b = await company(db, 'B');
      const c = await company(db, 'C');
      await db.query(
        "insert into company_relationships (parent_company_id, child_company_id, relationship) values ($1, $2, 'parent_company')",
        [a, b],
      );
      await db.query(
        "insert into company_relationships (parent_company_id, child_company_id, relationship) values ($1, $2, 'parent_company')",
        [b, c],
      );
      await refuses(
        db,
        "insert into company_relationships (parent_company_id, child_company_id, relationship) values ($1, $2, 'parent_company')",
        '23514',
        [c, a],
      );
      await refuses(
        db,
        "insert into company_relationships (parent_company_id, child_company_id, relationship) values ($1, $2, 'parent_company')",
        '23514',
        [a, a],
      );
    });
  });

  it('allows non-parent relationships to repeat but refuses an unknown vocabulary', async () => {
    await withDb(async (db) => {
      const parent = await company(db, 'Parent');
      const child = await company(db, 'Child');
      await db.query(
        "insert into company_relationships (parent_company_id, child_company_id, relationship) values ($1, $2, 'division')",
        [parent, child],
      );
      await refuses(
        db,
        "insert into company_relationships (parent_company_id, child_company_id, relationship) values ($1, $2, 'owns everything')",
        '23514',
        [parent, child],
      );
    });
  });

  it('refuses a duplicate franchise/company claim of the same kind', async () => {
    await withDb(async (db) => {
      const franchiseId = await id(db, 'insert into franchises (name) values ($1) returning id', ['F']);
      const companyId = await company(db, 'Studio');
      await db.query(
        "insert into franchise_companies (franchise_id, company_id, relationship) values ($1, $2, 'catalog_association')",
        [franchiseId, companyId],
      );
      await refuses(
        db,
        "insert into franchise_companies (franchise_id, company_id, relationship) values ($1, $2, 'catalog_association')",
        '23505',
        [franchiseId, companyId],
      );
      await db.query(
        "insert into franchise_companies (franchise_id, company_id, relationship) values ($1, $2, 'rights_holder')",
        [franchiseId, companyId],
      );
    });
  });

  it('lists an unsourced franchise/company association', async () => {
    await withDb(async (db) => {
      const franchiseId = await id(db, 'insert into franchises (name) values ($1) returning id', ['F']);
      const companyId = await company(db, 'Studio');
      await db.query(
        "insert into franchise_companies (franchise_id, company_id, relationship) values ($1, $2, 'catalog_association')",
        [franchiseId, companyId],
      );
      const { rows } = await db.query("select kind from claims_without_source where kind = 'franchise_company'");
      assert.equal(rows.length, 1);
    });
  });
});

describe('presentation preferences and artwork', () => {
  it('refuses an unknown language, theme or calendar', async () => {
    await withDb(async (db) => {
      await db.query("insert into viewer_preferences (viewer_key) values ('local')");
      await refuses(
        db,
        "insert into viewer_preferences (viewer_key, language) values ('a', 'fr')",
        '23514',
      );
      await refuses(
        db,
        "insert into viewer_preferences (viewer_key, theme) values ('b', 'sepia')",
        '23514',
      );
      await refuses(
        db,
        "insert into viewer_preferences (viewer_key, calendar) values ('c', 'julian')",
        '23514',
      );
      await refuses(
        db,
        "insert into viewer_preferences (viewer_key, timeline_scale) values ('d', 'logarithmic')",
        '23514',
      );
    });
  });

  it('allows one preference row per viewer key', async () => {
    await withDb(async (db) => {
      await db.query("insert into viewer_preferences (viewer_key, language) values ('local', 'es')");
      await refuses(db, "insert into viewer_preferences (viewer_key) values ('local')", '23505');
    });
  });

  it('requires a provider poster cache to expire and a local poster not to', async () => {
    await withDb(async (db) => {
      const workId = await id(db, "insert into works (title, format) values ('F', 'film') returning id");
      await refuses(
        db,
        "insert into posters (work_id, source, file_name, provider_image_path) values ($1, 'tmdb', 'a.jpg', '/a.jpg')",
        '23514',
        [workId],
      );
      await db.query(
        "insert into posters (work_id, source, file_name, provider_image_path, cached_at, expires_at) values ($1, 'tmdb', 'a.jpg', '/a.jpg', now(), now() + interval '150 days')",
        [workId],
      );
      await refuses(
        db,
        "insert into posters (work_id, source, file_name) values ($1, 'local', 'b.jpg')",
        '23505',
        [workId],
      );
    });
  });

  it('refuses a provider poster without a provider image path', async () => {
    await withDb(async (db) => {
      const workId = await id(db, "insert into works (title, format) values ('F', 'film') returning id");
      await refuses(
        db,
        "insert into posters (work_id, source, file_name, cached_at, expires_at) values ($1, 'tmdb', 'a.jpg', now(), now() + interval '10 days')",
        '23514',
        [workId],
      );
    });
  });
});
