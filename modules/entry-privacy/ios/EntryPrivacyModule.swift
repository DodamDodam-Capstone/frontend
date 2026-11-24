import ExpoModulesCore
import UIKit

private let entryPrivacy = EntryPrivacyLifecycle()

public final class EntryPrivacyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EntryPrivacy")

    Function("foregroundGeneration") {
      entryPrivacy.foregroundGeneration()
    }

    View(EntryPrivacySurface.self) {
      Prop("generation") { (view: EntryPrivacySurface, generation: Int?) in
        view.generation = generation
        entryPrivacy.refresh(view)
      }
    }
  }
}

private final class EntryPrivacyLifecycle: NSObject {
  private let lock = NSLock()
  private var generation = 0
  private var backgrounded = false
  @MainActor private let surfaces = NSHashTable<EntryPrivacySurface>.weakObjects()
  @MainActor private weak var deactivatingScene: UIScene?

  override init() {
    super.init()
    let center = NotificationCenter.default
    center.addObserver(self, selector: #selector(willDeactivate), name: UIScene.willDeactivateNotification, object: nil)
    center.addObserver(self, selector: #selector(didEnterBackground), name: UIScene.didEnterBackgroundNotification, object: nil)
    center.addObserver(self, selector: #selector(willEnterForeground), name: UIScene.willEnterForegroundNotification, object: nil)
    center.addObserver(self, selector: #selector(didActivate), name: UIScene.didActivateNotification, object: nil)
  }

  func foregroundGeneration() -> Int {
    lock.withLock { backgrounded ? -1 : generation }
  }

  @MainActor
  func updateAttachment(_ view: EntryPrivacySurface) {
    if view.window == nil {
      surfaces.remove(view)
    } else {
      surfaces.add(view)
    }
    refresh(view)
  }

  @MainActor
  func refresh(_ view: EntryPrivacySurface) {
    let current = foregroundGeneration()
    guard let scene = view.window?.windowScene else {
      view.setCovered(true)
      return
    }
    view.setCovered(scene.activationState != .foregroundActive || deactivatingScene === scene
      || current < 0 || view.generation != current)
  }

  @MainActor @objc
  private func willDeactivate(_ notification: Notification) {
    guard let scene = applicationScene(notification) else { return }
    deactivatingScene = scene
    refreshSurfaces(in: scene)
  }

  @MainActor @objc
  private func didEnterBackground(_ notification: Notification) {
    guard let scene = applicationScene(notification) else { return }
    // 이미 전송된 인증 조회가 뒤늦게 뷰를 만들어도 이전 세대는 가린다.
    lock.withLock {
      if !backgrounded { generation += 1 }
      backgrounded = true
    }
    refreshSurfaces(in: scene)
  }

  @MainActor @objc
  private func willEnterForeground(_ notification: Notification) {
    guard applicationScene(notification) != nil else { return }
    // AppState active를 처리하는 JS가 새 세대를 읽을 수 있게 먼저 잠금을 해제한다.
    lock.withLock { backgrounded = false }
  }

  @MainActor @objc
  private func didActivate(_ notification: Notification) {
    guard let scene = applicationScene(notification) else { return }
    lock.withLock { backgrounded = false }
    if deactivatingScene === scene { deactivatingScene = nil }
    refreshSurfaces(in: scene)
  }

  @MainActor
  private func applicationScene(_ notification: Notification) -> UIWindowScene? {
    guard let scene = notification.object as? UIWindowScene, scene.session.role == .windowApplication else { return nil }
    return scene
  }

  @MainActor
  private func refreshSurfaces(in scene: UIScene) {
    for view in surfaces.allObjects where view.window?.windowScene === scene { refresh(view) }
  }
}

private final class EntryPrivacySurface: ExpoView {
  var generation: Int?
  private let cover = UIView()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    cover.frame = bounds
    cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    cover.backgroundColor = UIColor(red: 253.0 / 255.0, green: 248.0 / 255.0, blue: 242.0 / 255.0, alpha: 1)
    cover.layer.zPosition = 1
    addSubview(cover)
    setCovered(true)
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    entryPrivacy.updateAttachment(self)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    cover.frame = bounds
  }

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    if !cover.isHidden && self.point(inside: point, with: event) { return cover }
    return super.hitTest(point, with: event)
  }

  func setCovered(_ covered: Bool) {
    UIView.performWithoutAnimation { cover.isHidden = !covered }
    accessibilityElementsHidden = covered
  }
}
