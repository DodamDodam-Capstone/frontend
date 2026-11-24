import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors, typography } from '../theme/tokens';

export function LoadingIndicator({ label }: { label: string }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label}
      accessibilityState={{ busy: true }} style={styles.container}>
      <ActivityIndicator accessible={false} color={colors.textLabel} />
      <AppText accessible={false} style={styles.label}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  label: { ...typography.body, color: colors.textSecondary, flexShrink: 1 },
});
