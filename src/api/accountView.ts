const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const kstSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/;
const emailAtom = /[a-z\d!#$%&'*+/=?^_`{|}~-]+/.source;
const quotedEmailAtom = /"(?:[a-z\d!#$%&'*.(),<>[\]:;@+/=?^_`{|}~-]|\\["\\])+"/.source;
const emailWord = `(?:${emailAtom}|${quotedEmailAtom})`;
const emailLocalPart = new RegExp(`^${emailWord}(?:\\.${emailWord})*$`, 'i');
const emailLabelAtom = /[a-z\d!#$%&'*+/=?^_`{|}~]+/.source;
const emailDomainLabel = new RegExp(`^${emailLabelAtom}(?:-+${emailLabelAtom})*$`, 'i');

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && value.length === 36 && uuid.test(value);
}

function isIpv6EmailLiteral(address: string): boolean {
  const halves = address.split('::');
  if (halves.length > 2) return false;
  const groups = halves.flatMap((half) => half === '' ? [] : half.split(':'));
  const tail = groups.at(-1);
  let size = groups.length;
  if (tail?.includes('.')) {
    const octet = /^(?:25[0-5]|2[0-4]\d|1?\d{1,2})$/;
    const octets = tail.split('.');
    if (!address.endsWith(tail) || octets.length !== 4 || !octets.every((part) => octet.test(part))) return false;
    groups.pop();
    size += 1; // IPv4 꼬리는 16비트 그룹 두 개를 사용한다.
  }
  return groups.every((part) => /^[\da-f]{1,4}$/i.test(part)) && (halves.length === 2 ? size < 8 : size === 8);
}

export function isAccountEmail(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 254 || /[^!-~]/.test(value)) return false;
  // Hibernate @Email과 동일하게 로컬 부분의 따옴표 안에는 @가 올 수 있다.
  const separator = value.lastIndexOf('@');
  if (separator < 1 || separator > 64 || !emailLocalPart.test(value.slice(0, separator))) return false;
  const domain = value.slice(separator + 1);
  if (/^\[(?:\d{1,3}\.){3}\d{1,3}\]$/.test(domain)) return true;
  if (/^\[ipv6:fe80:(?::[\da-f]{0,4}){0,4}%[a-z\d]+\]$/i.test(domain)) return true;
  const ipv6 = /^\[ipv6:([\da-f:.]+)\]$/i.exec(domain);
  if (ipv6) return isIpv6EmailLiteral(ipv6[1]);
  return domain.split('.').every((label) => label.length <= 63 && emailDomainLabel.test(label));
}

export function isKstDateTime(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 25 || !kstSeconds.test(value)) return false;
  // UTC는 비교 표기일 뿐이다. 달력에 없는 날이나 24시를 JS가 정규화하면 거절한다.
  const localTime = `${value.slice(0, -6)}.000Z`;
  const time = Date.parse(localTime);
  return Number.isFinite(time) && new Date(time).toISOString() === localTime;
}

export function isAccountView(value: unknown): value is { accountId: string; childId: string | null } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const { accountId, email: address, childId, hasPin, guardianUnlockedUntil } = value as Record<string, unknown>;
  return Object.keys(value).length === 5 && isUuid(accountId) && isAccountEmail(address) && typeof hasPin === 'boolean'
    && (guardianUnlockedUntil === null || isKstDateTime(guardianUnlockedUntil)) && (childId === null || isUuid(childId));
}
