export function validateSignupPassword(password: string): string | undefined {
  // Unicode 모드에서 정상적인 서로게이트 쌍은 단일 코드포인트로 처리한다.
  const length = Array.from(password).length;
  if (length < 15 || length > 128) return '비밀번호는 15~128자로 입력해 주세요.';
  if (/[\uD800-\uDFFF]/u.test(password)) return '비밀번호에 사용할 수 없는 문자가 있어요.';
}
