const { withMainApplication } = require('expo/config-plugins');

const policy = `// @generated begin single-use-post
// POST 본문을 네이티브 계층에서 재전송하지 않는다. GET과 쿠키 설정은 유지한다.
com.facebook.react.modules.network.OkHttpClientProvider.setOkHttpClientFactory {
  com.facebook.react.modules.network.OkHttpClientProvider.createClientBuilder(applicationContext)
    .addInterceptor { chain ->
      val request = chain.request()
      val body = request.body
      if (request.method != "POST" || body == null || body.isOneShot()) {
        chain.proceed(request)
      } else {
        val singleUseBody = object : okhttp3.RequestBody() {
          override fun contentType(): okhttp3.MediaType? = body.contentType()
          override fun contentLength(): Long = body.contentLength()
          override fun writeTo(sink: okio.BufferedSink) = body.writeTo(sink)
          override fun isDuplex(): Boolean = body.isDuplex()
          override fun isOneShot(): Boolean = true
        }
        chain.proceed(request.newBuilder().method(request.method, singleUseBody).build())
      }
    }
    .build()
}
// @generated end single-use-post`;

module.exports = function withSingleUsePost(config) {
  return withMainApplication(config, (result) => {
    if (result.modResults.language !== 'kt') {
      throw new Error('single-use POST requires Kotlin MainApplication');
    }
    const contents = result.modResults.contents.replace(
      /\n[ \t]*\/\/ @generated begin single-use-post[\s\S]*?\/\/ @generated end single-use-post/g,
      '',
    );
    const anchors = [...contents.matchAll(/^([ \t]*)super\.onCreate\(\)[ \t]*$/gm)];
    if (anchors.length !== 1 || contents.indexOf('loadReactNative(') < anchors[0].index) {
      throw new Error('single-use POST could not locate the supported initialization order');
    }
    const [anchor, indent] = anchors[0];
    const block = policy.split('\n').map((line) => indent + line).join('\n');
    result.modResults.contents = contents.replace(anchor, `${anchor}\n${block}`);
    return result;
  });
};
