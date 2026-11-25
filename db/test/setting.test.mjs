// Setting classification (migration 006): is a story set on Earth or in a completely fictional
// world? A work starts 'unknown'; the import carries the seed's value and refuses anything else.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../migrate.mjs';
import { importSeed } from '../import.mjs';

const seed = JSON.parse(readFileSync(new URL('../../public/data/media_atlas_seed.json', import.meta.url), 'utf8'));
const text = JSON.parse(readFileSync(new URL('../../public/data/media_text_seed.json', import.meta.url), 'utf8'));

async function withDb(run) {
  const db = new PGlite();
  try {
    await migrate(db);
    return await run(db);
  } finally {
    await db.close();
  }
}

describe('works.setting', () => {
  it('defaults to unknown and accepts earth and fictional_world', async () => {
    await withDb(async (db) => {
      const id = (await db.query("insert into works (title, format) values ('A', 'film') returning id")).rows[0].id;
      assert.equal((await db.query('select setting from works where id = $1', [id])).rows[0].setting, 'unknown');
      for (const value of ['earth', 'fictional_world']) {
        await db.query('update works set setting = $1 where id = $2', [value, id]);
      }
    });
  });
  it('refuses any other value', async () => {
    await withDb(async (db) => {
      await assert.rejects(() => db.query("insert into works (title, format, setting) values ('B', 'film', 'mars')"), (error) => error.code === '23514');
    });
  });
  it('is imported from the seed, and a seed value the column refuses stops the import', async () => {
    await withDb(async (db) => {
      await importSeed(db, seed, { text });
      const counts = (await db.query('select setting, count(*)::int as n from works group by setting')).rows;
      const byValue = Object.fromEntries(counts.map((row) => [row.setting, row.n]));
      assert.ok(byValue.earth > 0 && byValue.fictional_world > 0, JSON.stringify(byValue));
      const starWars = await db.query("select setting from works where seed_key = 'film--a-new-hope--1977'");
      assert.equal(starWars.rows[0]?.setting, 'fictional_world');
    });
    await withDb(async (db) => {
      const bad = structuredClone(seed);
      bad.works[0].setting = 'mars';
      await assert.rejects(() => importSeed(db, bad, { text }), /setting/);
    });
  });
  it('is only ever earth, fictional_world or absent in the committed seeds', () => {
    for (const work of [...seed.works, ...text.works]) {
      assert.ok(work.setting === undefined || ['earth', 'fictional_world'].includes(work.setting), `${work.id}: ${work.setting}`);
    }
  });
});
