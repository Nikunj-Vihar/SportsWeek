import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

export async function loadFixture(name) {
  return JSON.parse(await readFile(path.join(FIXTURES, name), 'utf8'));
}

/** fetch stub that returns the given JSON body for every call and counts calls. */
export function fetchStub(body, { status = 200 } = {}) {
  const stub = async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  const counting = (...args) => {
    counting.calls += 1;
    return stub(...args);
  };
  counting.calls = 0;
  return counting;
}

export const silentLogger = { log() {}, warn() {}, error() {} };
