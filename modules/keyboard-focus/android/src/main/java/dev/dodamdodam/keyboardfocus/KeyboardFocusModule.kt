package dev.dodamdodam.keyboardfocus

import android.view.View
import com.facebook.react.uimanager.IllegalViewOperationException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KeyboardFocusModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KeyboardFocus")

    AsyncFunction("requestFocus") { tag: Int ->
      if (tag <= 0) return@AsyncFunction "unavailable"
      val view = try {
        appContext.findView<View>(tag)
      } catch (_: IllegalViewOperationException) {
        null
      } ?: return@AsyncFunction "unavailable"

      if (!view.isAttachedToWindow || !view.isEnabled || !view.isShown ||
          !view.isFocusable || view.windowVisibility != View.VISIBLE ||
          view.alpha <= 0f || view.width <= 0 || view.height <= 0) {
        return@AsyncFunction "unavailable"
      }
      // 창 포커스만 없을 때 호출자가 Activity의 focus 이벤트를 기다릴 수 있다.
      if (!view.hasWindowFocus()) return@AsyncFunction "window-unfocused"

      val accepted = if (view.isInTouchMode && !view.isFocusableInTouchMode) {
        view.requestFocusFromTouch()
      } else {
        view.requestFocus()
      }
      // requestFocus는 자손의 성공도 반환하므로 요청한 View 자체를 확인한다.
      if (accepted && view.isFocused) "focused" else "unavailable"
    }.runOnQueue(Queues.MAIN)
  }
}
