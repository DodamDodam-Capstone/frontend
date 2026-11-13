const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Expo 57.0.33의 본문/clone 읽기가 취소·단절을 성공/미완료로 처리하는 경로만 보완한다.
// core 57.0.26의 iOS 리디렉션 진단은 전송 중인 body stream을 다시 읽지 않는다.
// 공식 수정 버전 전환 시 실제 네이티브 회귀를 통과한 뒤 제거한다.
const patches = [
  {
    "file": "android/src/main/java/expo/modules/fetch/NativeResponse.kt",
    "before": "      if (this@NativeResponse.state == ResponseState.BODY_STREAMING_STARTED) {\n        emit(\"didComplete\")\n      }\n      this@NativeResponse.state = ResponseState.BODY_COMPLETED",
    "after": "      if (this@NativeResponse.state != ResponseState.ERROR_RECEIVED) {\n        if (this@NativeResponse.state == ResponseState.BODY_STREAMING_STARTED) {\n          emit(\"didComplete\")\n        }\n        this@NativeResponse.state = ResponseState.BODY_COMPLETED\n      }",
    "originalHash": "dc0ef1165d12c1634bc0503bee9029a118c13561b38f9cea1d1d3b4d2f739e57",
    "patchedHash": "bf433c6f72d91d67b6e1cad947f844b3375732ff202cd600c54d92bdf9c5cb97"
  },
  {
    "file": "android/src/main/java/expo/modules/fetch/ExpoFetchModule.kt",
    "before": "        response.waitForStates(listOf(ResponseState.BODY_COMPLETED)) {",
    "after": "        response.waitForStates(listOf(ResponseState.BODY_COMPLETED, ResponseState.ERROR_RECEIVED)) { state ->\n          if (state == ResponseState.ERROR_RECEIVED) {\n            promise.reject(response.error?.toCodedException() ?: FetchUnknownException())\n            return@waitForStates\n          }",
    "originalHash": "3c766cf8a30f00a91f3a6116aa9e7f6a44f26d7fe2179cd7c114cbbfb56b08ea",
    "patchedHash": "e129c163221ce61bf2a19ba78c3fb47f19a1fc638b5e01c0489a032929e49402",
    "secondaryBefore": "      AsyncFunction(\"startStreaming\") { response: NativeResponse ->\n        return@AsyncFunction response.startStreaming()\n      }",
    "secondaryAfter": "      AsyncFunction(\"startStreaming\") { response: NativeResponse ->\n        response.error?.let { throw it.toCodedException() }\n        return@AsyncFunction response.startStreaming()\n      }"
  },
  {
    "file": "ios/Fetch/ExpoFetchModule.swift",
    "before": "        response.waitFor(states: [.bodyCompleted]) { _ in",
    "after": "        response.waitFor(states: [.bodyCompleted, .errorReceived]) { state in\n          if state == .errorReceived {\n            promise.reject(response.error ?? FetchUnknownException())\n            return\n          }",
    "originalHash": "4e23605435443e9a0c40a4b694bbb775fa83befc14d53664d3f54261744d0381",
    "patchedHash": "662314bc78b03cd06b7e0ea422dfd55d1fd60ca3712765d42c1c3c3fb19d3cdd",
    "secondaryBefore": "      AsyncFunction(\"startStreaming\") { (response: NativeResponse) -> Data? in\n        return response.startStreaming()\n      }",
    "secondaryAfter": "      AsyncFunction(\"startStreaming\") { (response: NativeResponse) throws -> Data? in\n        if let error = response.error {\n          throw error\n        }\n        return response.startStreaming()\n      }"
  },
  {
    "packageName": "expo-modules-core",
    "file": "ios/DevTools/CdpNetworkTypes.swift",
    "before": "    init(_ request: URLRequest) {\n      self.url = request.url?.absoluteString ?? \"\"\n      self.method = request.httpMethod ?? \"GET\"\n      self.headers = request.allHTTPHeaderFields ?? [:]\n      if let httpBody = request.httpBodyData() {",
    "after": "    init(_ request: URLRequest, includeBodyStream: Bool = true) {\n      self.url = request.url?.absoluteString ?? \"\"\n      self.method = request.httpMethod ?? \"GET\"\n      self.headers = request.allHTTPHeaderFields ?? [:]\n      // Redirect streams belong to URLSession; telemetry must not reopen or close them.\n      if let httpBody = includeBodyStream ? request.httpBodyData() : request.httpBody {",
    "originalHash": "aad9abe3946b2cd7a3febca4f11d9f36bd8b2ea4309cf17901b5b069abba63ec",
    "patchedHash": "7a56e718c5731c803c96acfeaab48dadc6103577005ea30f5bd35251f13a2c99",
    "secondaryBefore": "      self.request = Request(request)",
    "secondaryAfter": "      self.request = Request(request, includeBodyStream: redirectResponse == nil)"
  }
];

function apply() {
  const root = fs.realpathSync(process.cwd());
  const read = (relative) => {
    const file = path.join(root, relative);
    if (fs.realpathSync(file) !== file) throw new Error('Unsafe Expo fetch path');
    return fs.readFileSync(file, 'utf8');
  };
  const project = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const installed = JSON.parse(read('node_modules/expo/package.json'));
  if (project.name !== 'dodamdodam-frontend' || lock.name !== project.name
    || lock.packages?.['']?.name !== project.name || installed.name !== 'expo') {
    throw new Error('Unexpected Expo fetch project');
  }
  if (project.dependencies?.expo !== '57.0.33' || lock.packages[''].dependencies?.expo !== '57.0.33'
    || lock.packages['node_modules/expo']?.version !== '57.0.33' || installed.version !== '57.0.33') {
    throw new Error('Unsupported Expo fetch version');
  }
  const core = JSON.parse(read('node_modules/expo-modules-core/package.json'));
  if (core.name !== 'expo-modules-core' || core.version !== '57.0.26'
    || lock.packages['node_modules/expo-modules-core']?.version !== '57.0.26'
    || installed.dependencies?.['expo-modules-core'] !== '~57.0.26') {
    throw new Error('Unsupported Expo modules core version');
  }
  const sourceBuildPackages = project.expo?.autolinking?.apple?.buildFromSource;
  if (!Array.isArray(sourceBuildPackages) || !sourceBuildPackages.includes('expo-modules-core')) {
    throw new Error('Expo core patch requires source build');
  }
  const hash = (source) => createHash('sha256').update(source).digest('hex');
  const updates = [];
  for (const patch of patches) {
    const relative = path.join('node_modules', patch.packageName ?? 'expo', patch.file);
    const source = read(relative);
    const currentHash = hash(source);
    if (currentHash === patch.patchedHash) continue;
    if (currentHash !== patch.originalHash) throw new Error('Unexpected Expo fetch source');
    const bodyPatched = source.replaceAll(patch.before, patch.after);
    const patched = patch.secondaryBefore ? bodyPatched.replaceAll(patch.secondaryBefore, patch.secondaryAfter) : bodyPatched;
    if (hash(patched) !== patch.patchedHash) throw new Error('Unexpected Expo fetch patch result');
    updates.push([path.join(root, relative), patched]);
  }
  // 네 파일과 설치 버전을 모두 확인한 뒤에만 쓴다. 실패 시 미확인 소스를 덮지 않는다.
  for (const [file, source] of updates) fs.writeFileSync(file, source, 'utf8');
  console.log('Expo native request patches verified for 57.0.33 / core 57.0.26 (4 native files).');
}
if (require.main === module) apply();
module.exports = { patches };
