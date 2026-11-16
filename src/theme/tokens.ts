import type { TextStyle } from 'react-native';

// P0 온보딩1·로그인의 실제 사용값. 출처 노드는 FE_TEST_CI_PLAN.md에 기록한다.
export const colors = {
  textPrimary: '#1F1103',
  textSecondary: '#534536',
  textLabel: '#523920',
  textPlaceholder: '#A18971',
  textBubble: '#241204',
  textSocial: '#3E3A32',
  textSignUp: '#3C1E1E',
  primary: '#75CC3F',
  surface: '#FDF8F2',
  surfaceWhite: '#FFFFFF',
  surfaceWarm: '#FFFDFA',
  border: '#E3DACA',
} as const;

// 원본 TTF의 PostScript명 = 파일명. 별도 fontWeight를 얹어 합성하지 않는다.
export const fonts = {
  regular: 'NanumSquareRoundR',
  bold: 'NanumSquareRoundB',
  extraBold: 'NanumSquareRoundEB',
} as const;

export const typography = {
  title: { fontFamily: fonts.extraBold, fontSize: 32, lineHeight: 44.8, letterSpacing: -0.32 },
  body: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 28, letterSpacing: -0.2 },
  tagline: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 39.2, letterSpacing: -0.28 },
  input: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 23.8, letterSpacing: -0.17 },
  label: { fontFamily: fonts.extraBold, fontSize: 15, lineHeight: 21 },
} satisfies Record<string, TextStyle>;
