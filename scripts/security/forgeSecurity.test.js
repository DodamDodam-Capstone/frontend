/** @jest-environment node */

const { expect, test } = require('@jest/globals');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { join } = require('node:path');

const realRequire = createRequire(join(process.cwd(), 'package.json'));
const forge = realRequire('node-forge');

test('rejects malformed PEM without blocking the process', () => {
  // 공개 재현 입력은 별도 프로세스에서 제한한다. 세밀한 성능 수치를 요구하지 않는다.
  // https://github.com/digitalbazaar/forge/security/advisories/GHSA-7wch-p9px-956x
  const result = spawnSync(process.execPath, ['-e', `
    const forge = require(process.argv[1]);
    try {
      forge.pki.certificateFromPem(' -----BEGIN I-----G-----END B'.repeat(1000) + '\\x00');
      process.exit(2);
    } catch (error) {
      process.exit(/Invalid PEM formatted message/.test(error.message) ? 0 : 3);
    }
  `, realRequire.resolve('node-forge')], { encoding: 'utf8', timeout: 3000 });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
});

test('accepts permitted certificate names and rejects names outside the CA constraint', () => {
  // 테스트 키는 메모리에서만 생성·사용하며 파일·로그에 남기지 않는다.
  const nodeKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKey = forge.pki.privateKeyFromPem(
    nodeKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  );
  const publicKey = forge.pki.publicKeyFromPem(
    nodeKeys.publicKey.export({ type: 'spki', format: 'pem' }),
  );
  let serial = 0;
  function certificate(subject, issuer, ca, extensions = []) {
    const cert = forge.pki.createCertificate();
    cert.publicKey = publicKey;
    cert.serialNumber = (++serial).toString(16).padStart(2, '0');
    cert.validity.notBefore = new Date(Date.now() - 3600000);
    cert.validity.notAfter = new Date(Date.now() + 3600000);
    cert.setSubject([{ name: 'commonName', value: subject }]);
    cert.setIssuer([{ name: 'commonName', value: issuer }]);
    cert.setExtensions([
      ...(ca ? [
        { name: 'basicConstraints', cA: true },
        { name: 'keyUsage', keyCertSign: true },
      ] : []),
      ...extensions,
    ]);
    cert.sign(privateKey, forge.md.sha256.create());
    return forge.pki.certificateFromPem(forge.pki.certificateToPem(cert));
  }

  // 비임계 nameConstraints를 무시하던 결함의 허용·거부 대조군이다.
  // https://github.com/digitalbazaar/forge/security/advisories/GHSA-3cc4-3294-vgjf
  const a = forge.asn1;
  const constraint = {
    id: '2.5.29.30', critical: false,
    value: a.create(a.Class.UNIVERSAL, a.Type.SEQUENCE, true, [
      a.create(a.Class.CONTEXT_SPECIFIC, 0, true, [
        a.create(a.Class.UNIVERSAL, a.Type.SEQUENCE, true, [
          a.create(a.Class.CONTEXT_SPECIFIC, 2, false, '.example.com'),
        ]),
      ]),
    ]),
  };
  const root = certificate('Synthetic Root', 'Synthetic Root', true);
  const ca = certificate('Synthetic CA', 'Synthetic Root', true, [constraint]);
  const verify = name => forge.pki.verifyCertificateChain(
    forge.pki.createCaStore([root]),
    [certificate(name, 'Synthetic CA', false, [
      { name: 'subjectAltName', altNames: [{ type: 2, value: name }] },
    ]), ca],
  );
  expect(verify('allowed.example.com')).toBe(true);
  let error;
  try {
    verify('outside.invalid');
  } catch (cause) {
    error = cause;
  }
  expect(error).toMatchObject({ error: forge.pki.certificateError.bad_certificate });
});
