import { forwardRef } from 'react';
import { Platform, Text, type TextProps, useWindowDimensions } from 'react-native';

export const AppText = forwardRef<Text, TextProps>(function AppText(props, ref) {
  const { fontScale } = useWindowDimensions();
  // RN 0.86.3 iOS는 실행 중 배율 변경 뒤 다음 commit에서 옛 텍스트 높이를 재사용한다.
  // Text만 다시 측정하고 부모 버튼·입력·모달의 상태와 host는 유지한다.
  // 호환 RN 수정 버전에서 재현 시험 후 제거: react-native#57512.
  return <Text key={Platform.OS === 'ios' ? fontScale : 'text'} {...props} ref={ref} />;
});
