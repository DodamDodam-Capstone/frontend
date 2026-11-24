Pod::Spec.new do |spec|
  spec.name = 'EntryPrivacy'
  spec.version = '0.1.0'
  spec.summary = '도담도담 앱 복귀 화면 보호'
  spec.homepage = 'https://github.com/DodamDodam-Capstone/frontend'
  spec.license = 'UNLICENSED'
  spec.author = 'DodamDodam'
  spec.source = { :git => spec.homepage }
  spec.platform = :ios, '16.4'
  spec.swift_version = '5.9'
  spec.static_framework = true
  spec.dependency 'ExpoModulesCore'
  spec.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  spec.source_files = '*.swift'
end
