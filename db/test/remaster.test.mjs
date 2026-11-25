// Remasters and announced works (migration 007), against a real PostgreSQL engine (PGlite).
// A remaster is a film or series that re-releases another film or series (a 3D conversion, a
// restoration, a special edition). Comics and manga never have one: editions of a comic are not
// a remaster in this atlas. An announced work has no release yet.
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

const work = async (db, title, format) =>
  (await db.query('insert into works (title, format) values ($1, $2) returning id', [title, format])).rows[0].id;

async function refuses(db, sql, params) {
  await assert.rejects(() => db.query(sql, params), (error) => ['23514', '23503', '23505'].includes(error.code) || /remaster/i.test(error.message));
}

describe('works.remaster_of', () => {
  it('links a film to the film it re-releases', async () => {
    await withDb(async (db) => {
      const original = await work(db, 'The Lion King', 'film');
      const copy = await work(db, 'The Lion King 3D', 'film');
      await db.query("update works set remaster_of = $1, remaster_kind = '3d' where id = $2", [original, copy]);
      const row = (await db.query('select remaster_of, remaster_kind from works where id = $1', [copy])).rows[0];
      assert.equal(String(row.remaster_of), String(original));
      assert.equal(row.remaster_kind, '3d');
    });
  });
  it('links a series to a series too', async () => {
    await withDb(async (db) => {
      const original = await work(db, 'Dragon Ball Z', 'series');
      const kai = await work(db, 'Dragon Ball Z Kai', 'series');
      await db.query("update works set remaster_of = $1, remaster_kind = 'restoration' where id = $2", [original, kai]);
    });
  });
  it('refuses comics and manga on either side', async () => {
    await withDb(async (db) => {
      const film = await work(db, 'F', 'film');
      const comic = await work(db, 'C', 'comic_series');
      const manga = await work(db, 'M', 'manga_series');
      await refuses(db, "update works set remaster_of = $1, remaster_kind = '3d' where id = $2", [film, comic]);
      await refuses(db, "update works set remaster_of = $1, remaster_kind = '3d' where id = $2", [manga, film]);
      await refuses(db, "update works set remaster_of = $1, remaster_kind = 'restoration' where id = $2", [comic, manga]);
    });
  });
  it('refuses itself, a film of a series, a chain, a missing kind and an unknown kind', async () => {
    await withDb(async (db) => {
      const a = await work(db, 'A', 'film');
      const b = await work(db, 'B', 'film');
      const c = await work(db, 'C', 'film');
      const s = await work(db, 'S', 'series');
      await refuses(db, "update works set remaster_of = id, remaster_kind = '3d' where id = $1", [a]);
      await refuses(db, "update works set remaster_of = $1, remaster_kind = '3d' where id = $2", [s, a]);
      await db.query("update works set remaster_of = $1, remaster_kind = '3d' where id = $2", [a, b]);
      await refuses(db, "update works set remaster_of = $1, remaster_kind = '3d' where id = $2", [b, c]);
      await refuses(db, 'update works set remaster_of = $1 where id = $2', [a, c]);
      await refuses(db, "update works set remaster_kind = '3d' where id = $1", [c]);
      await refuses(db, "update works set remaster_of = $1, remaster_kind = 'colourised' where id = $2", [a, c]);
    });
  });
});

describe('works.release_status', () => {
  it('defaults to released, accepts announced and refuses anything else', async () => {
    await withDb(async (db) => {
      const id = await work(db, 'Bond 26', 'film');
      assert.equal((await db.query('select release_status from works where id = $1', [id])).rows[0].release_status, 'released');
      await db.query("update works set release_status = 'announced' where id = $1", [id]);
      await refuses(db, "update works set release_status = 'rumoured' where id = $1", [id]);
    });
  });
});

describe('the seed and the import', () => {
  it('has remasters only of films and series, each pointing at a work that exists and is not a remaster', () => {
    const byId = new Map([...seed.works, ...text.works].map((w) => [w.id, w]));
    const remasters = seed.works.filter((w) => w.remaster_of);
    assert.ok(remasters.length >= 10, `only ${remasters.length} remasters`);
    for (const w of remasters) {
      const original = byId.get(w.remaster_of);
      assert.ok(original, `${w.id} remasters a work that is not in the seed`);
      assert.ok(['film', 'series'].includes(w.format) && w.format === original.format, w.id);
      assert.ok(!original.remaster_of, `${w.id} remasters a remaster`);
      assert.ok(['3d', 'restoration', 'special_edition'].includes(w.remaster_kind), w.id);
    }
    assert.ok(text.works.every((w) => !w.remaster_of && !w.remaster_kind), 'a comic or manga carries a remaster');
  });
  it('imports remasters and announced works', async () => {
    await withDb(async (db) => {
      await importSeed(db, seed, { text });
      const lion = (await db.query("select id from works where seed_key = 'film--the-lion-king--1994'")).rows[0].id;
      const copy = (await db.query("select remaster_of, remaster_kind from works where seed_key = 'film--the-lion-king-3d--2011'")).rows[0];
      assert.equal(String(copy.remaster_of), String(lion));
      assert.equal(copy.remaster_kind, '3d');
      const announced = (await db.query("select count(*)::int as n from works where release_status = 'announced'")).rows[0].n;
      assert.ok(announced >= 2, `announced: ${announced}`);
    });
  });
  it('stops the import when a remaster points at a work that is not there', async () => {
    await withDb(async (db) => {
      const bad = structuredClone(seed);
      const w = bad.works.find((x) => x.remaster_of);
      w.remaster_of = 'film--nothing--1900';
      await assert.rejects(() => importSeed(db, bad, { text }), /remaster/);
    });
  });
});
