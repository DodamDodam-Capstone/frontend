import Foundation

// The production body helper only needs this constant from the URLProtocol.
// Compile this fixture together with the installed CdpNetworkTypes.swift and
// URLRequest+httpBodyData.swift; do not replace those implementations with mocks.
enum ExpoRequestInterceptorProtocol {
  static let MAX_BODY_SIZE = 1_048_576
}

// A safe stream makes accidental telemetry consumption observable without
// deliberately reproducing the CFNetwork-owned stream's native memory fault.
final class ObservedInputStream: InputStream {
  private let bytes: [UInt8]
  private var offset = 0
  private var status: Stream.Status = .notOpen
  private(set) var opens = 0
  private(set) var reads = 0
  private(set) var closes = 0

  init(_ body: String) {
    bytes = Array(body.utf8)
    super.init(data: Data())
  }

  override var streamStatus: Stream.Status { status }
  override var hasBytesAvailable: Bool { status == .open && offset < bytes.count }

  override func open() {
    opens += 1
    status = .open
  }

  override func close() {
    closes += 1
    status = .closed
  }

  override func read(_ buffer: UnsafeMutablePointer<UInt8>, maxLength len: Int) -> Int {
    reads += 1
    let count = min(len, bytes.count - offset)
    for index in 0..<count {
      buffer[index] = bytes[offset + index]
    }
    offset += count
    return count
  }
}

@main
struct InspectorRedirectRegression {
  private static var failures = 0
  private static var assertions = 0

  private static func expect(_ condition: Bool, _ message: String) {
    assertions += 1
    if !condition {
      failures += 1
      print("FAIL: \(message)")
    }
  }

  private static func makeRequest() -> URLRequest {
    var request = URLRequest(url: URL(string: "https://example.test/redirect-target")!)
    request.httpMethod = "POST"
    request.allHTTPHeaderFields = [
      "Content-Type": "application/json",
      "X-Test-Header": "preserved"
    ]
    return request
  }

  private static func makeRedirect(_ status: Int) -> HTTPURLResponse {
    HTTPURLResponse(
      url: URL(string: "https://example.test/original")!,
      statusCode: status,
      httpVersion: "HTTP/1.1",
      headerFields: [
        "Location": "https://example.test/redirect-target",
        "Content-Type": "application/json"
      ]
    )!
  }

  private static func redirectStreamIsUntouched(_ status: Int) {
    let name = "HTTP \(status) stream redirect"
    let failuresBefore = failures
    let stream = ObservedInputStream("{\"test\":\"redirect\"}")
    var request = makeRequest()
    request.httpBodyStream = stream
    let originalStream = request.httpBodyStream
    let originalHeaders = request.allHTTPHeaderFields

    expect(originalStream === stream, "\(name): fixture retains the observed stream")
    expect(request.httpBody == nil, "\(name): fixture exercises the stream body path")

    let event = CdpNetwork.RequestWillBeSentParams(
      now: 123,
      requestId: "redirect-\(status)",
      request: request,
      encodedDataLength: 42,
      redirectResponse: makeRedirect(status)
    )

    expect(stream.opens == 0, "\(name): must not open the body stream; got \(stream.opens)")
    expect(stream.reads == 0, "\(name): must not read the body stream; got \(stream.reads)")
    expect(stream.closes == 0, "\(name): must not close the body stream; got \(stream.closes)")
    expect(stream.streamStatus == .notOpen, "\(name): body stream state remains unchanged")
    expect(request.httpBodyStream === originalStream, "\(name): request retains its original stream")
    expect(request.httpBody == nil, "\(name): telemetry does not replace the transport body")
    expect(request.url?.absoluteString == "https://example.test/redirect-target", "\(name): transport URL is unchanged")
    expect(request.httpMethod == "POST", "\(name): transport method is unchanged")
    expect(request.allHTTPHeaderFields == originalHeaders, "\(name): transport headers are unchanged")
    expect(event.request.url == "https://example.test/redirect-target", "\(name): request URL metadata is retained")
    expect(event.request.method == "POST", "\(name): request method metadata is retained")
    expect(event.request.headers == originalHeaders, "\(name): request header metadata is retained")
    expect(event.request.postData == nil, "\(name): streamed redirect body is omitted from telemetry")
    expect(event.requestId == "redirect-\(status)", "\(name): request ID is retained")
    expect(event.timestamp == 123 && event.wallTime == 123, "\(name): event timing is retained")
    expect(event.redirectHasExtraInfo, "\(name): redirect metadata remains present")
    expect(event.redirectResponse?.status == status, "\(name): redirect status is retained")
    expect(event.redirectResponse?.url == "https://example.test/original", "\(name): original response URL is retained")
    expect(event.redirectResponse?.encodedDataLength == 42, "\(name): response length metadata is retained")
    expect(event.redirectResponse?.mimeType == "application/json", "\(name): response content type is retained")
    expect(event.redirectResponse?.headers?["Location"] == "https://example.test/redirect-target", "\(name): redirect Location is retained")

    if failures == failuresBefore { print("PASS: \(name)") }
  }

  private static func redirectDataIsCaptured(_ status: Int) {
    let name = "HTTP \(status) in-memory body redirect"
    let failuresBefore = failures
    let body = "{\"test\":\"data\"}"
    var request = makeRequest()
    request.httpBody = Data(body.utf8)

    let event = CdpNetwork.RequestWillBeSentParams(
      now: 123,
      requestId: "data-\(status)",
      request: request,
      encodedDataLength: 42,
      redirectResponse: makeRedirect(status)
    )

    expect(event.request.postData == body, "\(name): safe in-memory body is still captured")
    expect(request.httpBody == Data(body.utf8), "\(name): original body is unchanged")
    expect(event.redirectResponse?.status == status, "\(name): redirect response is retained")
    if failures == failuresBefore { print("PASS: \(name)") }
  }

  private static func initialStreamIsCaptured() {
    let name = "initial request body stream positive control"
    let failuresBefore = failures
    let body = "{\"test\":\"initial\"}"
    let stream = ObservedInputStream(body)
    var request = makeRequest()
    request.httpBodyStream = stream

    let event = CdpNetwork.RequestWillBeSentParams(
      now: 123,
      requestId: "initial",
      request: request,
      encodedDataLength: 0,
      redirectResponse: nil
    )

    expect(event.request.postData == body, "\(name): initial body telemetry is retained")
    expect(stream.opens == 1 && stream.reads > 0 && stream.closes == 1,
      "\(name): real production helper consumes the observed stream")
    expect(event.redirectResponse == nil && !event.redirectHasExtraInfo,
      "\(name): initial event has no redirect metadata")
    if failures == failuresBefore { print("PASS: \(name)") }
  }

  static func main() {
    for status in [307, 308] {
      redirectStreamIsUntouched(status)
      redirectDataIsCaptured(status)
    }
    initialStreamIsCaptured()
    print("\(assertions) assertions; \(failures) failures")
    exit(failures == 0 ? 0 : 1)
  }
}
