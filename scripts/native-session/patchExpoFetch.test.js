/** @jest-environment node */
const { afterEach, expect, test } = require('@jest/globals');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { patches } = require('./patchExpoFetch.cjs');

const root = process.cwd();
const installer = path.join(root, 'scripts/native-session/patchExpoFetch.cjs');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const originals = patches.map((patch) => {
  const installed = fs.readFileSync(path.join(root, 'node_modules', patch.packageName ?? 'expo', patch.file), 'utf8');
  const bufferedOriginal = installed.replaceAll(patch.after, patch.before);
  return patch.secondaryAfter ? bufferedOriginal.replaceAll(patch.secondaryAfter, patch.secondaryBefore) : bufferedOriginal;
});
const owned = [];
function fixture(version = '57.0.33') {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-fetch-installer-'));
  owned.push(project);
  const metadata = { name: 'dodamdodam-frontend', dependencies: { expo: version },
    expo: { autolinking: { apple: { buildFromSource: ['expo-modules-core'] } } } };
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify(metadata));
  fs.writeFileSync(path.join(project, 'package-lock.json'), JSON.stringify({ name: metadata.name, packages: {
    '': metadata, 'node_modules/expo': { version }, 'node_modules/expo-modules-core': { version: '57.0.26' },
  } }));
  const expo = path.join(project, 'node_modules/expo');
  fs.mkdirSync(expo, { recursive: true });
  fs.writeFileSync(path.join(expo, 'package.json'), JSON.stringify({ name: 'expo', version, dependencies: { 'expo-modules-core': '~57.0.26' } }));
  const core = path.join(project, 'node_modules/expo-modules-core');
  fs.mkdirSync(core, { recursive: true });
  fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({ name: 'expo-modules-core', version: '57.0.26' }));
  patches.forEach((patch, index) => {
    const file = path.join(project, 'node_modules', patch.packageName ?? 'expo', patch.file);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, originals[index]);
  });
  return project;
}
const file = (project, index) => path.join(project, 'node_modules', patches[index].packageName ?? 'expo', patches[index].file);
const hashes = (project) => patches.map((_patch, index) => hash(fs.readFileSync(file(project, index))));
const run = (project) => spawnSync(process.execPath, [installer], { cwd: project, encoding: 'utf8', timeout: 5000 });
function changeJson(project, relative, change) {
  const file = path.join(project, relative); const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  change(value); fs.writeFileSync(file, JSON.stringify(value));
}
afterEach(() => { for (const directory of owned.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

test('실제 Expo/core 원본 4개를 고정 SHA256 패치로 바꾸고 재실행 시 보존한다', () => {
  expect(originals.map(hash)).toEqual([
    'dc0ef1165d12c1634bc0503bee9029a118c13561b38f9cea1d1d3b4d2f739e57',
    '3c766cf8a30f00a91f3a6116aa9e7f6a44f26d7fe2179cd7c114cbbfb56b08ea',
    '4e23605435443e9a0c40a4b694bbb775fa83befc14d53664d3f54261744d0381',
    'aad9abe3946b2cd7a3febca4f11d9f36bd8b2ea4309cf17901b5b069abba63ec',
  ]);
  const project = fixture();
  expect(run(project).status).toBe(0);
  expect(hashes(project)).toEqual(patches.map((patch) => patch.patchedHash));
  expect(run(project).status).toBe(0);
  expect(hashes(project)).toEqual(patches.map((patch) => patch.patchedHash));
});

test('이미 적용된 파일과 원본이 섞여도 검증 후 나머지만 적용한다', () => {
  const project = fixture();
  fs.writeFileSync(file(project, 0), originals[0].replaceAll(patches[0].before, patches[0].after));
  expect(run(project).status).toBe(0);
  expect(hashes(project)).toEqual(patches.map((patch) => patch.patchedHash));
});

test.each([0, 1, 2, 3])('%i번째 소스가 알려진 원본/패치가 아니면 어느 파일도 쓰지 않는다', (index) => {
  const project = fixture(); fs.appendFileSync(file(project, index), '\n// changed');
  const before = hashes(project); const result = run(project);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Unexpected Expo fetch source');
  expect(hashes(project)).toEqual(before);
});

test.each(['project', 'root-lock', 'locked', 'installed'])('%s Expo 버전이 다르면 쓰지 않는다', (where) => {
  const project = fixture();
  if (where === 'project') changeJson(project, 'package.json', (value) => { value.dependencies.expo = '57.0.34'; });
  else if (where === 'root-lock') changeJson(project, 'package-lock.json', (value) => { value.packages[''].dependencies.expo = '57.0.34'; });
  else if (where === 'locked') changeJson(project, 'package-lock.json', (value) => { value.packages['node_modules/expo'].version = '57.0.34'; });
  else changeJson(project, 'node_modules/expo/package.json', (value) => { value.version = '57.0.34'; });
  const before = hashes(project); const result = run(project);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Unsupported Expo fetch version');
  expect(hashes(project)).toEqual(before);
});

test.each(['57.0.32', '57.0.34'])('모든 메타데이터가 %s여도 승인한 버전이 아니면 쓰지 않는다', (version) => {
  const project = fixture(version);
  const before = hashes(project); const result = run(project);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Unsupported Expo fetch version');
  expect(hashes(project)).toEqual(before);
});

test.each(['locked', 'installed', 'expo-dependency'])('modules-core의 %s 버전이 다르면 어느 파일도 쓰지 않는다', (where) => {
  const project = fixture();
  if (where === 'locked') changeJson(project, 'package-lock.json', (value) => { value.packages['node_modules/expo-modules-core'].version = '57.0.27'; });
  else if (where === 'installed') changeJson(project, 'node_modules/expo-modules-core/package.json', (value) => { value.version = '57.0.27'; });
  else changeJson(project, 'node_modules/expo/package.json', (value) => { value.dependencies['expo-modules-core'] = '~57.0.27'; });
  const before = hashes(project); const result = run(project);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Unsupported Expo modules core version');
  expect(hashes(project)).toEqual(before);
});

test.each([undefined, []])('코어 소스 빌드 설정이 %p이면 패치를 적용하지 않는다', (buildFromSource) => {
  const project = fixture();
  changeJson(project, 'package.json', (value) => { value.expo.autolinking.apple.buildFromSource = buildFromSource; });
  const before = hashes(project); const result = run(project);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Expo core patch requires source build');
  expect(hashes(project)).toEqual(before);
});

test('cwd가 다른 프로젝트이면 쓰지 않는다', () => {
  const project = fixture(); changeJson(project, 'package.json', (value) => { value.name = 'different-project'; });
  const before = hashes(project); const result = run(project);
  expect(result.status).not.toBe(0); expect(result.stderr).toContain('Unexpected Expo fetch project');
  expect(hashes(project)).toEqual(before);
});

test('고정된 lock 설치 경로가 없으면 쓰지 않는다', () => {
  const project = fixture(); changeJson(project, 'package-lock.json', (value) => { delete value.packages['node_modules/expo']; });
  const before = hashes(project); expect(run(project).status).not.toBe(0); expect(hashes(project)).toEqual(before);
});

test.each(['source', 'metadata'])('%s 심볼릭 링크는 거절하고 외부 파일도 보존한다', (kind) => {
  const project = fixture();
  const target = kind === 'source' ? file(project, 2) : path.join(project, 'node_modules/expo/package.json');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-fetch-outside-')); owned.push(outside);
  const external = path.join(outside, 'source'); fs.copyFileSync(target, external); fs.unlinkSync(target); fs.symlinkSync(external, target);
  const before = hashes(project); const externalBefore = hash(fs.readFileSync(external)); const result = run(project);
  expect(result.status).not.toBe(0); expect(result.stderr).toContain('Unsafe Expo fetch path');
  expect(hashes(project)).toEqual(before); expect(hash(fs.readFileSync(external))).toBe(externalBefore);
});

test.each([1, 2, 3])('%i번째 파일의 추가 치환이 빠진 패치는 최종 패치로 인정하지 않는다', (index) => {
  const project = fixture();
  fs.writeFileSync(file(project, index), originals[index].replaceAll(patches[index].before, patches[index].after));
  const before = hashes(project); const result = run(project);
  expect(result.status).not.toBe(0); expect(result.stderr).toContain('Unexpected Expo fetch source');
  expect(hashes(project)).toEqual(before);
});
