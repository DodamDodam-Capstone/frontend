package expo.modules.entryprivacy

import android.content.Context
import android.os.Build
import android.view.View
import android.view.ViewTreeObserver
import android.view.Window
import android.view.WindowManager
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView
import java.lang.ref.WeakReference

// JS가 수명 주기 이벤트를 받기 전에 MainActivity가 화면 표시 권한을 갱신한다.
object EntryPrivacyLifecycle {
  private var generation = 0
  @Volatile var foregroundGeneration = -1
    private set
  private var active = false
  private var focused = false
  private var paused = false
  private var leftTopWithoutPause = false
  @Volatile internal var observingModule = WeakReference<EntryPrivacyModule>(null)
  private var host = WeakReference<Window>(null)
  private var pendingRelease: Any? = null
  private var securedByUs = WeakReference<Window>(null)
  private val attached = mutableSetOf<EntryPrivacyView>()

  fun pause() {
    foregroundGeneration = -1
    pendingRelease = null
    active = false
    leftTopWithoutPause = false
    paused = true
    attached.forEach { it.updateVisibility() }
  }

  fun resume(window: Window) {
    pendingRelease = null
    host = WeakReference(window)
    focused = window.decorView.hasWindowFocus()
    if (paused) generation++
    paused = false
    leftTopWithoutPause = false
    active = true
    foregroundGeneration = generation
    updateLegacyCapture()
    attached.forEach { it.updateVisibility() }
  }

  internal fun attach(view: EntryPrivacyView) {
    pendingRelease = null
    attached.add(view)
    updateLegacyCapture()
    view.updateVisibility()
  }

  internal fun detach(view: EntryPrivacyView) {
    attached.remove(view)
    releaseIfUnprotected()
  }

  private fun updateLegacyCapture() {
    if (Build.VERSION.SDK_INT >= 33) return
    val window = host.get() ?: return
    val secure = WindowManager.LayoutParams.FLAG_SECURE
    if (attached.isNotEmpty() && window.attributes.flags and secure == 0) {
      // 목적지 View가 그려지기 전에 일반 캡처와 최근 앱 미리보기를 함께 차단한다.
      window.addFlags(secure)
      securedByUs = WeakReference(window)
    } else {
      releaseIfUnprotected()
    }
  }

  fun topResumedChanged(window: Window, isTop: Boolean) {
    if (!active || host.get() !== window) return
    if (!isTop) {
      foregroundGeneration = -1
      leftTopWithoutPause = true
      attached.forEach { it.updateVisibility() }
    } else if (leftTopWithoutPause) {
      // 최근 앱 카드를 탭하면 onPause/onResume 없이 상단 Activity만 돌아올 수 있다.
      leftTopWithoutPause = false
      generation++
      foregroundGeneration = generation
      attached.forEach { it.updateVisibility() }
      observingModule.get()?.sendEvent("taskReentered", mapOf("generation" to generation))
    }
  }

  fun focusChanged(hasFocus: Boolean) {
    // 최근 앱의 live tile은 Activity가 RESUMED인 채로 포커스만 잃을 수 있다.
    focused = hasFocus
    attached.forEach { it.updateVisibility() }
    if (hasFocus) releaseIfUnprotected()
  }

  private fun releaseIfUnprotected() {
    val window = securedByUs.get() ?: return
    fun safeToRelease() = host.get() === window && active && focused && attached.isEmpty()
    if (!safeToRelease() || pendingRelease != null) return
    val request = Any()
    pendingRelease = request
    val decor = window.decorView
    val release = Runnable {
      if (pendingRelease !== request) return@Runnable
      pendingRelease = null
      if (securedByUs.get() === window && safeToRelease()) {
        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        securedByUs.clear()
      }
    }
    if (Build.VERSION.SDK_INT >= 29 && decor.isHardwareAccelerated) {
      decor.viewTreeObserver.registerFrameCommitCallback(release)
    } else {
      // API 24–28에서는 비보호 화면의 draw가 끝난 다음 프레임까지 기다린다.
      decor.viewTreeObserver.addOnDrawListener(object : ViewTreeObserver.OnDrawListener {
        override fun onDraw() {
          decor.post {
            if (decor.viewTreeObserver.isAlive) decor.viewTreeObserver.removeOnDrawListener(this)
            decor.postOnAnimation(release)
          }
        }
      })
    }
    decor.invalidate()
  }

  internal fun canDisplay(verifiedGeneration: Int?) = active && focused && !leftTopWithoutPause && generation == verifiedGeneration
}

class EntryPrivacyView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var verifiedGeneration: Int? = null
    set(value) {
      field = value
      updateVisibility()
    }

  init {
    visibility = View.INVISIBLE
  }

  internal fun updateVisibility() {
    visibility = if (EntryPrivacyLifecycle.canDisplay(verifiedGeneration)) View.VISIBLE else View.INVISIBLE
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    EntryPrivacyLifecycle.attach(this)
  }

  override fun onDetachedFromWindow() {
    EntryPrivacyLifecycle.detach(this)
    super.onDetachedFromWindow()
  }
}

class EntryPrivacyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EntryPrivacy")

    Events("taskReentered")
    OnCreate { EntryPrivacyLifecycle.observingModule = WeakReference(this@EntryPrivacyModule) }
    OnDestroy {
      val observer = EntryPrivacyLifecycle.observingModule
      if (observer.get() === this@EntryPrivacyModule) observer.clear()
    }

    Function("foregroundGeneration") { EntryPrivacyLifecycle.foregroundGeneration }

    View(EntryPrivacyView::class) {
      Prop("generation") { view: EntryPrivacyView, generation: Int? ->
        view.verifiedGeneration = generation
      }
      GroupView<EntryPrivacyView> {}
    }
  }
}
