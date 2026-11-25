#!/usr/bin/env node
// Builds the static site into site/ (committed), the folder GitHub Pages serves. The workflow
// (.github/workflows/pages.yml) only uploads site/: it never runs npm or builds anything, so what is
// published is exactly what was built and checked here.
//
//   npm run site:build        build, copy, check
//   node scripts/publish-site.mjs --check   check the committed site/ without rebuilding
import {spawnSync} from 'node:child_process';
import {cp, mkdir, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {join, relative, sep} from 'node:path';
import {forbiddenFiles, missingFiles} from './publish-guard.mjs';

const root = process.cwd();
const dist = join(root, 'dist');
const site = join(root, 'site');
const checkOnly = process.argv.includes('--check');

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(path));
    else out.push(relative(site, path).split(sep).join('/'));
  }
  return out;
}

if (!checkOnly) {
  const build = spawnSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], {stdio: 'inherit'});
  if (build.status !== 0) { console.error('The build failed; site/ was not touched.'); process.exit(1); }
  await rm(site, {recursive: true, force: true});
  await mkdir(site, {recursive: true});
  await cp(dist, site, {recursive: true});
  // Pages must serve the files as they are, not run them through Jekyll.
  await writeFile(join(site, '.nojekyll'), '');
}

const files = await listFiles(site).catch(() => []);
const bad = forbiddenFiles(files);
const missing = missingFiles(files);
if (bad.length || missing.length) {
  if (bad.length) console.error(`Not publishable (terms forbid redistributing it, or it is a secret):\n  ${bad.join('\n  ')}`);
  if (missing.length) console.error(`Missing from the site:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
let bytes = 0;
for (const file of files) bytes += (await stat(join(site, file))).size;
console.log(`site/ is ready: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB, nothing forbidden.`);
