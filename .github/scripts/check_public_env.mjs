// Run the installed Expo Babel preset on the real reader, then execute it without
// runtime env values. This catches dynamic references that Jest alone can miss.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const babel = require('@babel/core');

const root = path.resolve(import.meta.dirname, '../..');
const filename = path.join(root, 'src/config/env.ts');
const sourceRequire = createRequire(filename);
const preset = require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] });
const keys = ['EXPO_PUBLIC_APP_ENV', 'EXPO_PUBLIC_API_BASE_URL', 'EXPO_PUBLIC_OAUTH_REDIRECT_URI'];
const saved = keys.map((key) => process.env[key]);

try {
  for (const platform of ['android', 'ios']) {
    for (const appEnv of [undefined, 'development', 'test', 'production']) {
      const values = appEnv ? [appEnv, `https://${appEnv}.example.invalid/api/v1`, 'dev.dodamdodamcapstone.dodamdodam://oauth/callback'] : [];
      keys.forEach((key, i) => {
        if (values[i] === undefined) delete process.env[key];
        else process.env[key] = values[i];
      });
      const { code } = babel.transformFileSync(filename, {
        babelrc: false,
        configFile: false,
        presets: [preset],
        plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
        caller: { name: 'metro', bundler: 'metro', platform, isDev: false, isServer: false },
      });
      const module = { exports: {} };
      vm.runInNewContext(code, { module, exports: module.exports, require: sourceRequire, URL, process: { env: {} } }, { timeout: 5000 });
      const actual = JSON.parse(JSON.stringify(module.exports.readEnvironment()));
      assert.deepEqual(actual, appEnv ? { appEnv, apiBaseUrl: values[1], oauthRedirectUri: values[2] } : {});
      assert.equal(module.exports.resolveApiConfig().ok, !!appEnv);
      assert.equal(module.exports.resolveOAuthConfig().ok, !!appEnv);
      console.log(`${platform}: ${appEnv ?? 'unset'} public config injection passed`);
    }
  }
} finally {
  keys.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key];
    else process.env[key] = saved[i];
  });
}
