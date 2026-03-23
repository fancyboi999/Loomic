import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(dirname, '..');

async function readJson(relativePath) {
  const filePath = path.join(rootDir, relativePath);
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function readText(relativePath) {
  const filePath = path.join(rootDir, relativePath);
  return readFile(filePath, 'utf8');
}

test('root manifest exposes dev, build, and test scripts', async () => {
  const manifest = await readJson('package.json');

  assert.equal(typeof manifest.scripts?.dev, 'string');
  assert.equal(typeof manifest.scripts?.build, 'string');
  assert.equal(typeof manifest.scripts?.test, 'string');
});

test('workspace includes apps and packages globs', async () => {
  const workspace = await readText('pnpm-workspace.yaml');

  assert.match(workspace, /apps\/\*/);
  assert.match(workspace, /packages\/\*/);
});
