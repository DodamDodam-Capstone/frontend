import { expect, test } from '@jest/globals';

import { validateSignupPassword } from './signupPassword';

test.each([
  ['🙂'.repeat(14), false], ['🙂'.repeat(15), true],
  ['🙂'.repeat(128), true], ['🙂'.repeat(129), false],
  [' 한🙂' + 'a'.repeat(11) + ' ', true],
  ['e\u0301'.repeat(8), true],
  ['a'.repeat(15) + '\uD800', false], ['\uDC00' + 'a'.repeat(15), false],
])('가입 비밀번호의 코드포인트 경계와 UTF-8 유효성을 확인한다 (%#)', (password, valid) => {
  expect(validateSignupPassword(password) === undefined).toBe(valid);
});
