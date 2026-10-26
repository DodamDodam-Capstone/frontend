/** @jest-environment node */

const { beforeAll, expect, test } = require('@jest/globals');
const { Buffer } = require('node:buffer');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { dirname, join, resolve } = require('node:path');

const projectRoot = process.cwd();
const realRequire = createRequire(join(projectRoot, 'package.json'));
const cliRequire = createRequire(createRequire(realRequire.resolve('expo/package.json')).resolve('@expo/cli/package.json'));
const certificateRequire = createRequire(realRequire.resolve('@expo/code-signing-certificates/package.json'));
const forge = realRequire('node-forge');
const certificates = realRequire('@expo/code-signing-certificates');
const fixture = realRequire('./scripts/security/fixtures/forgeNestedDigestInfo.json');
const lock = realRequire('./package-lock.json');
const lockedDirectories = Object.keys(lock.packages)
  .filter(name => /(^|\/)node_modules\/node-forge$/.test(name))
  .map(name => resolve(projectRoot, name));
let nodeKeys;
let keys;

beforeAll(() => {
  nodeKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  // 개인키는 실행 중 메모리에서만 사용하며 fixture·파일·로그에 저장하지 않는다.
  keys = certificates.convertKeyPairPEMToKeyPair({
    publicKeyPEM: nodeKeys.publicKey.export({ type: 'spki', format: 'pem' }),
    privateKeyPEM: nodeKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  });
});

test.each([['Expo CLI', cliRequire], ['Expo certificates', certificateRequire]])(
  '%s rejects the public malformed DigestInfo fixture with default verification',
  (_name, consumerRequire) => {
    expect(lockedDirectories).toContain(dirname(consumerRequire.resolve('node-forge/package.json')));
    const consumer = consumerRequire('node-forge');
    const publicKey = consumer.pki.setRsaPublicKey(
      new consumer.jsbn.BigInteger(fixture.modulusHex, 16),
      new consumer.jsbn.BigInteger(fixture.publicExponent),
    );
    // 이 공개 fixture는 비정상 구조 수용 여부를 검사하며 개인키 없는 위조를 입증하지 않는다.
    expect(() => publicKey.verify(
      consumer.util.hexToBytes(fixture.digestHex),
      consumer.util.hexToBytes(fixture.signatureHex),
    )).toThrow(/DigestInfo/);
  },
);

const nullParameter = (value = '') => forge.asn1.create(
  forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, value,
);
const octet = () => forge.asn1.create(
  forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, 'synthetic',
);

function verifyAlgorithm(algorithm, parameters) {
  const md = forge.md[algorithm].create().update('synthetic DigestInfo regression');
  const digest = md.digest().getBytes();
  const algorithmIdentifier = [
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
      forge.asn1.oidToDer(forge.pki.oids[algorithm]).getBytes()),
    ...parameters,
  ];
  const info = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, algorithmIdentifier),
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, digest),
  ]);
  // NONE은 미리 만든 DigestInfo를 서명하기 위한 입력 형식이며 기본 패딩 검증은 유지한다.
  const signature = keys.privateKey.sign(forge.asn1.toDer(info).getBytes(), 'NONE');
  return keys.publicKey.verify(digest, signature);
}

test.each([
  ['extra child after NULL', () => [nullParameter(), octet()]],
  ['garbage instead of optional NULL', () => [octet()]],
  ['repeated NULL', () => [nullParameter(), nullParameter()]],
  ['nonempty NULL', () => [nullParameter('synthetic')]],
  ['constructed NULL', () => [forge.asn1.create(
    forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, true, [octet()],
  )]],
])('rejects %s in DigestAlgorithm', (_name, parameters) => {
  expect(() => verifyAlgorithm('sha256', parameters())).toThrow(/DigestInfo/);
});

test.each(['sha1', 'sha256', 'sha512'].flatMap(algorithm => [
  [algorithm, false], [algorithm, true],
]))('preserves %s verification with empty NULL present=%p', (algorithm, present) => {
  expect(verifyAlgorithm(algorithm, present ? [nullParameter()] : [])).toBe(true);
});

test('preserves the legacy MD5 empty-NULL requirement', () => {
  expect(verifyAlgorithm('md5', [nullParameter()])).toBe(true);
});

test('keeps rejecting legacy MD5 with omitted NULL', () => {
  expect(() => verifyAlgorithm('md5', [])).toThrow(/Missing algorithm identifier NULL parameters/);
});

test('rejects a Forge signature for a different digest', () => {
  const md = forge.md.sha256.create().update('synthetic original');
  const signature = keys.privateKey.sign(md);
  const other = forge.md.sha256.create().update('synthetic changed');
  expect(keys.publicKey.verify(other.digest().getBytes(), signature)).toBe(false);
});

test('accepts a normal Node SHA-256 signature', () => {
  const message = Buffer.from('synthetic Node control');
  const signature = crypto.sign('RSA-SHA256', message, nodeKeys.privateKey);
  expect(keys.publicKey.verify(crypto.createHash('sha256').update(message).digest().toString('binary'),
    signature.toString('binary'))).toBe(true);
});

test('rejects that Node signature for a changed message', () => {
  const signature = crypto.sign('RSA-SHA256', Buffer.from('synthetic original'), nodeKeys.privateKey);
  expect(keys.publicKey.verify(crypto.createHash('sha256').update('synthetic changed').digest().toString('binary'),
    signature.toString('binary'))).toBe(false);
});

function certificateFixture() {
  const now = Date.now();
  const certificate = certificates.generateSelfSignedCodeSigningCertificate({
    keyPair: keys, validityNotBefore: new Date(now - 3600000),
    validityNotAfter: new Date(now + 3600000), commonName: 'synthetic.invalid',
  });
  return certificates.convertCertificatePEMToCertificate(
    certificates.convertCertificateToCertificatePEM(certificate),
  );
}

test('preserves Expo certificate validation and Node-compatible manifest signing', () => {
  const certificate = certificateFixture();
  expect(() => certificates.validateSelfSignedCertificate(certificate, keys)).not.toThrow();
  const message = Buffer.from('synthetic manifest');
  const signature = certificates.signBufferRSASHA256AndVerify(keys.privateKey, certificate, message);
  expect(crypto.verify('RSA-SHA256', message, nodeKeys.publicKey, Buffer.from(signature, 'base64'))).toBe(true);
});

test('keeps rejecting an Expo certificate with a damaged signature', () => {
  const certificate = certificateFixture();
  certificate.signature = String.fromCharCode(certificate.signature.charCodeAt(0) ^ 1)
    + certificate.signature.slice(1);
  expect(() => certificates.validateSelfSignedCertificate(certificate, keys)).toThrow();
});
