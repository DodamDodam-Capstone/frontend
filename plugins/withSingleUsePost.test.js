/** @jest-environment node */
const { expect, test } = require('@jest/globals');
const plugin = require('./withSingleUsePost');

const source = `package example
class MainApplication {
  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}`;

async function apply(contents = source, language = 'kt') {
  const config = plugin({ name: 'probe', slug: 'probe' });
  return config.mods.android.mainApplication({
    ...config,
    modResults: { contents, language },
    modRequest: { projectRoot: '/tmp/probe', platformProjectRoot: '/tmp/probe/android', platform: 'android', modName: 'mainApplication' },
  });
}

test('Expo의 실제 MainApplication mod가 RN 초기화 전에 POST 정책을 등록한다', async () => {
  const result = await apply();
  const contents = result.modResults.contents;
  expect(contents.indexOf('setOkHttpClientFactory')).toBeGreaterThan(contents.indexOf('super.onCreate()'));
  expect(contents.indexOf('setOkHttpClientFactory')).toBeLessThan(contents.indexOf('loadReactNative(this)'));
});

test('반복 prebuild 적용 결과가 같고 factory가 중복되지 않는다', async () => {
  const once = (await apply()).modResults.contents;
  const twice = (await apply(once)).modResults.contents;
  expect(twice).toBe(once);
  expect(twice.match(/setOkHttpClientFactory/g)).toHaveLength(1);
});

test.each([
  ['java', source],
  ['kt', 'class MainApplication {}'],
])('지원하지 않는 초기화 템플릿을 조용히 통과시키지 않는다: %s', async (language, contents) => {
  await expect(apply(contents, language)).rejects.toThrow('single-use POST');
});
