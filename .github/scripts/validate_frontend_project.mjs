import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = ['.nvmrc', 'package.json', 'package-lock.json', 'app.json', 'VERSION'];
const otherLockfiles = [
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
];

for (const file of requiredFiles) {
  if (!existsSync(file) || !readFileSync(file, 'utf8').trim()) {
    throw new Error(`Required project file is missing or empty: ${file}`);
  }
}

for (const file of otherLockfiles) {
  if (existsSync(file)) {
    throw new Error(`Only package-lock.json is supported; remove ${file}`);
  }
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const lockfile = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const expoConfig = JSON.parse(readFileSync('app.json', 'utf8'));
const releaseVersion = readFileSync('VERSION', 'utf8').trim();
const nodeVersion = readFileSync('.nvmrc', 'utf8').trim();
const npmVersion = manifest.engines?.npm;

if (manifest.engines?.node !== nodeVersion || process.versions.node !== nodeVersion) {
  throw new Error(`Node must match .nvmrc and package.json engines: ${nodeVersion}`);
}

if (!/^\d+\.\d+\.\d+$/.test(npmVersion ?? '') || manifest.packageManager !== `npm@${npmVersion}`) {
  throw new Error('packageManager must exactly match the npm version in engines');
}

if (lockfile.name !== manifest.name || lockfile.version !== manifest.version) {
  throw new Error('package-lock.json root package must match package.json');
}

if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(releaseVersion)) {
  throw new Error('VERSION must contain a stable X.Y.Z version without leading zeros');
}
if (manifest.version !== releaseVersion || lockfile.packages?.['']?.version !== releaseVersion
    || expoConfig.expo?.version !== releaseVersion) {
  throw new Error('VERSION must match package.json, the lockfile root package, and expo.version');
}

for (const script of ['lint', 'typecheck', 'test', 'test:env']) {
  if (typeof manifest.scripts?.[script] !== 'string' || !manifest.scripts[script].trim()) {
    throw new Error(`Required npm script is missing or empty: ${script}`);
  }
}

console.log(`Project manifest valid: Node ${nodeVersion}, npm ${npmVersion}, release ${releaseVersion}, lint/typecheck/test/test:env present`);
