import {defineConfig, type Plugin} from 'vite';
import {mkdir, readdir, readFile, rename, rm, unlink, writeFile} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {tmdbExpiry} from './scripts/tmdb-cache.mjs';

// Reading 800+ sidecars on every load is slow; the status scan is cached briefly
// and invalidated whenever a poster is saved.
let statusCache: {at: number; body: {configured: boolean; posters: string[]; types: Record<string, string>}} | null = null;
const COVER_TYPES = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'} as Record<string, string>;

// Local-only development adapter, not an authenticated production API.
function localPosters(): Plugin {
  return {
    name: 'local-posters',
    configureServer(server) {
      server.middlewares.use('/api/posters', async (req, res) => {
        const send = (status: number, data: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(data));
        };
        const origin = req.headers.origin;
        const host = req.headers.host;
        if (!host || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || (origin && origin !== `http://${host}`)) {
          return send(403, {error: 'Local requests only'});
        }
        try {
          const url = new URL(req.url ?? '/', `http://${host}`);
          if (req.method === 'GET' && url.pathname === '/status' && statusCache && Date.now() - statusCache.at < 15000) {
            return send(200, statusCache.body);
          }
          if (req.method === 'GET' && url.pathname === '/status') {
            const dir = join(process.cwd(), 'public', 'posters');
            const files = await readdir(dir).catch(() => [] as string[]);
            const posters: string[] = [];
            const types: Record<string, string> = {};
            for (const file of files.filter(f => /^(film|series|text)--[a-z0-9-]+\.(jpg|png|webp)$/.test(f))) {
              const path = join(dir, file);
              try {
                const meta = JSON.parse(await readFile(`${path}.json`, 'utf8')) as {expires: string; sha256: string};
                if (Date.now() >= Date.parse(meta.expires)) {
                  const digest = createHash('sha256').update(await readFile(path)).digest('hex');
                  // Never remove an image changed independently since our download.
                  if (digest === meta.sha256) {await unlink(path); await unlink(`${path}.json`);}
                  continue;
                }
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') continue;
              }
              const id = file.slice(0, file.lastIndexOf('.'));
              const ext = file.slice(file.lastIndexOf('.') + 1);
              if (!posters.includes(id)) posters.push(id);
              if (ext !== 'jpg') types[id] = ext;
            }
            statusCache = {at: Date.now(), body: {configured: !!process.env.TMDB_API_KEY, posters, types}};
            return send(200, statusCache.body);
          }
          // A cover the owner supplies for a comic or manga: raw image bytes, validated by magic number.
          if (req.method === 'POST' && url.pathname === '/upload') {
            const type = String(req.headers['content-type'] ?? '').split(';')[0].trim();
            const ext = COVER_TYPES[type];
            const workId = url.searchParams.get('workId') ?? '';
            if (!origin || !ext) return send(403, {error: 'Same-origin JPEG, PNG or WebP required'});
            if (!/^text--[a-z0-9-]+$/.test(workId)) return send(400, {error: 'Only comics and manga take an uploaded cover'});
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of req) { size += chunk.length; if (size > 5_000_000) return send(413, {error: 'Cover too large'}); chunks.push(chunk as Buffer); }
            const data = Buffer.concat(chunks);
            const magic = {jpg: [0xff, 0xd8, 0xff], png: [0x89, 0x50, 0x4e, 0x47], webp: [0x52, 0x49, 0x46, 0x46]}[ext]!;
            if (!magic.every((value, index) => data[index] === value)) return send(400, {error: 'The file is not the image type it claims'});
            const dir = join(process.cwd(), 'public', 'posters');
            await mkdir(dir, {recursive: true});
            for (const other of ['jpg', 'png', 'webp']) { await rm(join(dir, `${workId}.${other}`), {force: true}); await rm(join(dir, `${workId}.${other}.json`), {force: true}); }
            const target = join(dir, `${workId}.${ext}`);
            await writeFile(target, data);
            // No expiry: the owner chose this file, it is not a provider cache.
            await writeFile(`${target}.json`, JSON.stringify({source: 'uploaded by the owner', cachedAt: new Date().toISOString(), sha256: createHash('sha256').update(data).digest('hex')}, null, 2));
            statusCache = null;
            return send(200, {url: `/posters/${workId}.${ext}`});
          }
          return send(404, {error: 'Not found'});
        } catch {
          return send(500, {error: 'Poster operation failed. Check connectivity and server configuration.'});
        }
      });
    }
  };
}
// Vite copies public/ into the build. The TMDB cache (posters, imported years and credits)
// is local-only: TMDB's terms forbid redistributing it, so a build never ships it.
function stripTmdbCache(): Plugin {
  let outDir = 'dist';
  return {
    name: 'strip-tmdb-cache',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir; },
    async closeBundle() {
      await rm(join(outDir, 'posters'), {recursive: true, force: true});
      await rm(join(outDir, 'data', 'tmdb_metadata.json'), {force: true});
      await rm(join(outDir, 'data', 'tmdb_credits.json'), {force: true});
      await rm(join(outDir, 'data', 'text_metadata.json'), {force: true});
      await rm(join(outDir, 'data', 'text_adaptation_proposals.json'), {force: true});
    },
  };
}

export default defineConfig({plugins: [localPosters(), stripTmdbCache()], server: {host: '127.0.0.1'}});
