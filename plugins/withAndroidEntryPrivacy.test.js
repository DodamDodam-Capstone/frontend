/** @jest-environment node */
const { expect, test } = require('@jest/globals');
const plugin = require('./withAndroidEntryPrivacy');

const activity = `class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }
}`;

async function apply(contents) {
  const config = plugin({ name: 'probe', slug: 'probe' });
  const result = await config.mods.android.mainActivity({
    ...config,
    modResults: { contents, language: 'kt' },
    modRequest: { projectRoot: '/tmp/probe', platformProjectRoot: '/tmp/probe/android', platform: 'android', modName: 'mainActivity' },
  });
  return result.modResults.contents;
}

test('Android 최근 앱 캡처 제한을 한 번 설치하고 포커스 복귀 시 비보호 화면 여부를 확인한다', async () => {
  const once = await apply(activity);
  expect(once).toContain('setRecentsScreenshotEnabled(false)');
  expect(once).toMatch(/EntryPrivacyLifecycle\.focusChanged\(hasFocus\)\s+super\.onWindowFocusChanged\(hasFocus\)/);
  expect(once).toMatch(/EntryPrivacyLifecycle\.pause\(\)\s+super\.onPause\(\)/);
  expect(once).toMatch(/EntryPrivacyLifecycle\.resume\(window\)\s+super\.onResume\(\)/);
  expect(once).toMatch(/EntryPrivacyLifecycle\.topResumedChanged\(window, isTop\)\s+super\.onTopResumedActivityChanged\(isTop\)/);
  expect(await apply(once)).toBe(once);
});

test('앱 진입점이 달라지면 미리보기 보호를 조용히 건너뛰지 않는다', async () => {
  await expect(apply('class OtherActivity {}')).rejects.toThrow();
});
