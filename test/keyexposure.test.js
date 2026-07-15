// §9.6 — Key exposure check: the deployed frontend is public/ verbatim (no
// build step), so scan every shipped frontend file for anything that looks
// like a provider key, secret, or a direct provider call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

async function allPublicFiles(dir = PUBLIC_DIR) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await allPublicFiles(full)));
    else out.push(full);
  }
  return out;
}

test('no provider key, secret, or direct provider URL ships in the frontend', async () => {
  const files = await allPublicFiles();
  assert.ok(files.length >= 4, 'expected the frontend files to exist');

  const forbidden = [
    /thesportsdb\.com/i,          // frontend must never call the provider directly
    /jolpi\.ca/i,
    /api\/v1\/json\/[^/\s"']+\//i, // TheSportsDB keyed URL pattern
    /THESPORTSDB_KEY/,
    /api[_-]?key\s*[:=]/i,
    /secret/i,
    /bearer\s+[a-z0-9._-]+/i,
  ];

  // If a real key is configured in the environment, its literal value must
  // not appear anywhere in the shipped files either.
  const liveKey = process.env.THESPORTSDB_KEY;

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(content), `${path.basename(file)} matches forbidden pattern ${pattern}`);
    }
    if (liveKey && liveKey.length > 1) {
      assert.ok(!content.includes(liveKey), `${path.basename(file)} contains the live API key`);
    }
  }
});
