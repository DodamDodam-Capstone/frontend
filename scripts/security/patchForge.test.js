/** @jest-environment node */

const { afterEach, expect, test } = require('@jest/globals');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const os = require('node:os');
const path = require('node:path');

const root = process.cwd();
const realRequire = createRequire(path.join(root, 'package.json'));
const installer = path.join(root, 'scripts/security/patchForge.cjs');
const source = fs.readFileSync(path.join(path.dirname(realRequire.resolve('node-forge/package.json')), 'lib/rsa.js'), 'utf8');
const before = '            obj.value.length !== 2) {';
const after = "            obj.value.length !== 2 ||\n            obj.value[0].value.length !==\n              (('parameters' in capture) ? 2 : 1) ||\n            ('parameters' in capture && capture.parameters !== '')) {";
const originalHash = 'fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50';
const patchedHash = 'ff1d46675dbf07c80b438381c0a41b9b16ae3d4c84d103b1e9f067ad4a9c00fe';
const hash = data => createHash('sha256').update(data).digest('hex');
const original = hash(source) === originalHash ? source : source.replace(after, before);
const patched = original.replace(before, after);
const owned = [];

function fixture(paths = ['node_modules/node-forge']) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-installer-'));
  owned.push(base);
  const project = path.join(base, 'project');
  fs.mkdirSync(project);
  const packages = {};
  for (const name of paths) {
    const directory = path.resolve(project, name);
    fs.mkdirSync(path.join(directory, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ version: '1.4.0' }));
    fs.writeFileSync(path.join(directory, 'lib/rsa.js'), original);
    packages[name] = { version: '1.4.0' };
  }
  fs.writeFileSync(path.join(project, 'package-lock.json'), JSON.stringify({ packages }));
  return project;
}

const file = (project, name = 'node_modules/node-forge') => path.resolve(project, name, 'lib/rsa.js');
const run = project => spawnSync(process.execPath, [installer], { cwd: project, encoding: 'utf8', timeout: 5000 });
afterEach(() => { for (const directory of owned.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

test('patches every locked Forge copy', () => {
  expect(hash(original)).toBe(originalHash);
  const paths = ['node_modules/node-forge', 'node_modules/synthetic/node_modules/node-forge'];
  const project = fixture(paths);
  expect(run(project).status).toBe(0);
  for (const name of paths) expect(hash(fs.readFileSync(file(project, name)))).toBe(patchedHash);
});

test('accepts a verified already-patched copy without changing it', () => {
  const project = fixture();
  fs.writeFileSync(file(project), patched);
  expect(run(project).status).toBe(0);
  expect(hash(fs.readFileSync(file(project)))).toBe(patchedHash);
});

test('rejects unknown source before writing any locked copy', () => {
  const paths = ['node_modules/node-forge', 'node_modules/synthetic/node_modules/node-forge'];
  const project = fixture(paths);
  fs.appendFileSync(file(project, paths[1]), '\n// unexpected source');
  const result = run(project);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/Unexpected node-forge source/);
  expect(hash(fs.readFileSync(file(project)))).toBe(originalHash);
});

test.each(['lock', 'installed'])('rejects unsupported %s version', kind => {
  const project = fixture();
  const target = path.join(project, kind === 'lock' ? 'package-lock.json' : 'node_modules/node-forge/package.json');
  const metadata = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (kind === 'lock') metadata.packages['node_modules/node-forge'].version = '1.4.1';
  else metadata.version = '1.4.1';
  fs.writeFileSync(target, JSON.stringify(metadata));
  const result = run(project);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/Unsupported node-forge version/);
  expect(hash(fs.readFileSync(file(project)))).toBe(originalHash);
});

test('fails when the expected locked dependency is absent', () => {
  const result = run(fixture([]));
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/No locked node-forge installation/);
});

test('rejects lock paths outside the project', () => {
  const outside = '../outside/node_modules/node-forge';
  const project = fixture([outside]);
  const result = run(project);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/Unsafe node-forge path/);
  expect(hash(fs.readFileSync(file(project, outside)))).toBe(originalHash);
});

test('rejects source symlinks outside the locked layout', () => {
  const project = fixture();
  const outside = path.join(path.dirname(project), 'outside-rsa.js');
  fs.writeFileSync(outside, original);
  fs.unlinkSync(file(project));
  fs.symlinkSync(outside, file(project));
  const result = run(project);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/Unsafe node-forge path/);
  expect(hash(fs.readFileSync(outside))).toBe(originalHash);
});
