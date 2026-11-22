const { withMainActivity } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const previewPolicy = `  override fun onStart() {
    super.onStart()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      setRecentsScreenshotEnabled(false)
    }
  }

  override fun onPause() {
    expo.modules.entryprivacy.EntryPrivacyLifecycle.pause()
    super.onPause()
  }

  override fun onResume() {
    expo.modules.entryprivacy.EntryPrivacyLifecycle.resume(window)
    super.onResume()
  }

  @android.annotation.TargetApi(Build.VERSION_CODES.Q)
  override fun onTopResumedActivityChanged(isTop: Boolean) {
    expo.modules.entryprivacy.EntryPrivacyLifecycle.topResumedChanged(window, isTop)
    super.onTopResumedActivityChanged(isTop)
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    expo.modules.entryprivacy.EntryPrivacyLifecycle.focusChanged(hasFocus)
    super.onWindowFocusChanged(hasFocus)
  }`;

module.exports = function withAndroidEntryPrivacy(config) {
  return withMainActivity(config, (result) => {
    if (result.modResults.language !== 'kt') throw new Error('Entry privacy requires Kotlin MainActivity');
    result.modResults.contents = mergeContents({
      src: result.modResults.contents,
      newSrc: previewPolicy,
      anchor: /^class MainActivity : ReactActivity\(\) \{/,
      offset: 1,
      tag: 'android-entry-privacy',
      comment: '//',
    }).contents;
    return result;
  });
};
