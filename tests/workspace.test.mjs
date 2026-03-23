import { test, expect } from 'vitest';
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

  expect(typeof manifest.scripts?.dev).toBe('string');
  expect(typeof manifest.scripts?.build).toBe('string');
  expect(typeof manifest.scripts?.test).toBe('string');
  expect(typeof manifest.scripts?.lint).toBe('string');
});

test('workspace includes apps and packages globs', async () => {
  const workspace = await readText('pnpm-workspace.yaml');

  expect(workspace).toMatch(/apps\/\*/);
  expect(workspace).toMatch(/packages\/\*/);
});

test('root test command wires vitest workspace and turbo test graph', async () => {
  const manifest = await readJson('package.json');
  const workspaceConfig = await readText('vitest.workspace.ts');

  expect(manifest.scripts['test:workspace']).toContain('vitest');
  expect(manifest.scripts['test:workspace']).toContain('--workspace vitest.workspace.ts');
  expect(manifest.scripts['test:packages']).toContain('turbo run test');
  expect(manifest.scripts.test).toContain('test:workspace');
  expect(manifest.scripts.test).toContain('test:packages');
  expect(workspaceConfig).toContain("include: ['tests/**/*.test.mjs']");
});

for (const appName of ['web', 'server', 'desktop']) {
  test(`${appName} app scripts perform real validation instead of placeholder logs`, async () => {
    const manifest = await readJson(`apps/${appName}/package.json`);

    expect(typeof manifest.scripts?.build).toBe('string');
    expect(typeof manifest.scripts?.test).toBe('string');
    expect(typeof manifest.scripts?.typecheck).toBe('string');
    expect(manifest.scripts.build).not.toMatch(/placeholder/i);
    expect(manifest.scripts.build).not.toMatch(/console\.log/);
    expect(manifest.scripts.test).not.toMatch(/placeholder/i);
    expect(manifest.scripts.test).not.toMatch(/console\.log/);
    expect(manifest.scripts.typecheck).not.toMatch(/placeholder/i);
    expect(manifest.scripts.typecheck).not.toMatch(/console\.log/);
  });
}

test('@loomic/config exports a single low-drift package contract', async () => {
  const source = await readText('packages/config/src/index.ts');

  expect(source).not.toContain('@loomic/shared');
  expect(source).not.toContain('apps/*');
  expect(source).not.toContain('packages/*');
});

test('root lint baseline is wired through Biome', async () => {
  const manifest = await readJson('package.json');
  const biomeConfig = await readJson('biome.json');

  expect(manifest.devDependencies['@biomejs/biome']).toBeTruthy();
  expect(manifest.scripts.lint).toContain('biome');
  expect(biomeConfig.$schema).toContain('biome');
  expect(biomeConfig.formatter.enabled).toBe(true);
  expect(biomeConfig.linter.enabled).toBe(true);
});
