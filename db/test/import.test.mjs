// Import tests: the migration, the importer and the rules db/IMPORT.md promises,
// against a real PostgreSQL engine (PGlite) with a fresh database per test.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../migrate.mjs';
import { importSeed } from '../import.mjs';

const seed = JSON.parse(
  readFileSync(new URL('../../public/data/media_atlas_seed.json', import.meta.url), 'utf8')
);

const TOTALS = {
  sources: seed.sources.length,
  companies: seed.companies.length,
  franchises: seed.franchises.length,
  works: seed.works.length,
  tags: seed.tags.length,
};

async function withDb(run) {
  const db = new PGlite();
  try {
    await migrate(db);
    return await run(db);
  } finally {
    await db.close();
  }
}

const count = async (db, table) =>
  (await db.query(`select count(*)::int as n from ${table}`)).rows[0].n;

describe('migrations', () => {
  it('applies the base schema and the migrations once', async () => {
    await withDb(async (db) => {
      const again = await migrate(db);
      assert.deepEqual(again, []);
      const applied = await db.query('select name from schema_migrations order by name');
      assert.deepEqual(
        applied.rows.map((row) => row.name),
        ['001_review_and_seed_key.sql', 'base:schema.sql']
      );
    });
  });

  it('adds the review columns and refuses "reviewed" without a date', async () => {
    await withDb(async (db) => {
      await db.query("insert into works (title, format, seed_key) values ('x', 'film', 'x')");
      await assert.rejects(
        () => db.query("update works set review_status = 'reviewed' where seed_key = 'x'"),
        (error) => error.code === '23514'
      );
      await db.query("update works set review_status = 'reviewed', reviewed_at = current_date where seed_key = 'x'");
      const row = (await db.query("select review_status from works where seed_key = 'x'")).rows[0];
      assert.equal(row.review_status, 'reviewed');
    });
  });
});

describe('seed import', () => {
  it('fills the five tables on the first pass and updates them on the second', async () => {
    await withDb(async (db) => {
      const first = await importSeed(db, seed);
      for (const [table, total] of Object.entries(TOTALS)) {
        assert.equal(first[table].inserted, total, `${table} inserted`);
        assert.equal(first[table].updated, 0, `${table} updated`);
        assert.equal(await count(db, table), total, `${table} rows`);
      }
      const payloads = await count(db, 'imported_metadata');
      assert.equal(payloads, Object.values(TOTALS).reduce((sum, n) => sum + n, 0));

      const second = await importSeed(db, seed);
      for (const [table, total] of Object.entries(TOTALS)) {
        assert.equal(second[table].inserted, 0, `${table} re-inserted`);
        assert.equal(second[table].updated, total, `${table} re-updated`);
        assert.equal(await count(db, table), total, `${table} duplicated`);
      }
    });
  });

  it('leaves every imported row in draft state and keeps the original payload', async () => {
    await withDb(async (db) => {
      await importSeed(db, seed);
      for (const table of Object.keys(TOTALS)) {
        assert.equal(
          (await db.query(`select count(*)::int as n from ${table} where review_status <> 'needs_review'`)).rows[0].n,
          0,
          `${table} escaped the draft state`
        );
      }
      const work = seed.works.find((row) => row.animation_classification === null);
      const payload = await db.query(
        "select payload from imported_metadata where external_id = $1",
        [`works:${work.id}`]
      );
      assert.equal(payload.rows[0].payload.animation_classification, null);
    });
  });

  it('does not overwrite a reviewed row on re-import', async () => {
    await withDb(async (db) => {
      await importSeed(db, seed);
      const work = seed.works[0];
      await db.query(
        `update works set title = 'Curated title', review_status = 'reviewed', reviewed_at = current_date
         where seed_key = $1`,
        [work.id]
      );
      await importSeed(db, seed);
      const row = (await db.query('select title, review_status from works where seed_key = $1', [work.id])).rows[0];
      assert.equal(row.title, 'Curated title');
      assert.equal(row.review_status, 'reviewed');
    });
  });

  it('rolls the whole import back when a row cannot be stored', async () => {
    await withDb(async (db) => {
      const broken = structuredClone(seed);
      broken.works[0].title = null;
      await assert.rejects(() => importSeed(db, broken), (error) => error.code === '23502');
      assert.equal(await count(db, 'works'), 0);
      assert.equal(await count(db, 'sources'), 0);
    });
  });

  it('never promotes a claim into an enforced relationship', async () => {
    await withDb(async (db) => {
      await importSeed(db, seed);
      assert.equal(await count(db, 'company_relationships'), 0);
      assert.equal(await count(db, 'franchise_companies'), 0);
      assert.equal(await count(db, 'work_companies'), 0);
    });
  });

  it('refuses a seed section it has no mapping for', async () => {
    await withDb(async (db) => {
      const surprise = structuredClone(seed);
      surprise.awards = [{ id: 'x', name: 'x' }];
      await assert.rejects(() => importSeed(db, surprise), /has no mapping/);
    });
  });

  it('a dry run reports counts and keeps nothing', async () => {
    await withDb(async (db) => {
      const counts = await importSeed(db, seed, { dryRun: true });
      assert.equal(counts.works.inserted, TOTALS.works);
      assert.equal(await count(db, 'works'), 0);
      assert.equal(await count(db, 'imported_metadata'), 0);
    });
  });
});
