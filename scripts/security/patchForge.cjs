const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// 공개 보완안의 기능 변경만 고정 원본에 적용한다. 공식 수정 버전 전환 시 제거한다.
// https://github.com/digitalbazaar/forge/commit/85446800199c4995d3cd4b0ab5a8409df4455859
const originalHash = 'fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50';
const patchedHash = 'ff1d46675dbf07c80b438381c0a41b9b16ae3d4c84d103b1e9f067ad4a9c00fe';
const before = '            obj.value.length !== 2) {';
const after = "            obj.value.length !== 2 ||\n            obj.value[0].value.length !==\n              (('parameters' in capture) ? 2 : 1) ||\n            ('parameters' in capture && capture.parameters !== '')) {";
const hash = source => createHash('sha256').update(source).digest('hex');
const root = fs.realpathSync(process.cwd());
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const entries = Object.entries(lock.packages || {})
  .filter(([name]) => /(^|\/)node_modules\/node-forge$/.test(name));
if (entries.length === 0) throw new Error('No locked node-forge installation; review the temporary security patch');

const updates = [];
for (const [name, entry] of entries) {
  if (!name.startsWith('node_modules/') || path.isAbsolute(name)
    || name.includes('\\') || name.split('/').includes('..')) {
    throw new Error('Unsafe node-forge path: ' + name);
  }
  const directory = path.resolve(root, name);
  const metadataPath = path.join(directory, 'package.json');
  const sourcePath = path.join(directory, 'lib/rsa.js');
  if (fs.realpathSync(metadataPath) !== metadataPath || fs.realpathSync(sourcePath) !== sourcePath) {
    throw new Error('Unsafe node-forge path: ' + name);
  }
  const installed = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  if (entry.version !== '1.4.0' || installed.version !== '1.4.0') {
    throw new Error('Unsupported node-forge version: ' + name);
  }
  const source = fs.readFileSync(sourcePath, 'utf8');
  const currentHash = hash(source);
  if (currentHash === patchedHash) continue;
  if (currentHash !== originalHash) throw new Error('Unexpected node-forge source: ' + name);
  const patched = source.replace(before, after);
  if (hash(patched) !== patchedHash) throw new Error('Unexpected node-forge patch result: ' + name);
  updates.push([sourcePath, patched]);
}

// 모든 설치 경로를 먼저 검증해, 알려지지 않은 사본이 있으면 쓰기 전에 중단한다.
for (const [file, source] of updates) fs.writeFileSync(file, source, 'utf8');
console.log('Forge security patch verified for ' + entries.length + ' locked installation(s).');
