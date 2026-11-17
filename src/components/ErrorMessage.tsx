import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';

import { Button } from './Button';
import { AppText } from './AppText';
import { colors, typography } from '../theme/tokens';

export type ErrorMessageProps = {
  // 서버 응답/예외 원문 대신 호출자가 고른 안전한 사용자 안내 문구를 받는다.
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export function ErrorMessage({ message, onRetry, retryLabel = '다시 시도' }: ErrorMessageProps) {
  const announced = useRef<string | undefined>(undefined);
  useEffect(() => {
    // iOS에는 live region 자동 안내가 없다. 동일 문구의 재렌더는 반복 안내하지 않는다.
    if (Platform.OS === 'ios' && message && announced.current !== message) {
      announced.current = message;
      AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
    }
  }, [message]);

  return (
    <View style={styles.container}>
      <AppText accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.message}>{message}</AppText>
      {onRetry && <Button label={retryLabel} variant="secondary" onPress={onRetry} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, borderWidth: 2, borderColor: colors.textLabel, borderRadius: 20, backgroundColor: colors.surfaceWarm },
  message: { ...typography.body, color: colors.textPrimary },
});
