import { getLoadedFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, typography } from '../theme/tokens';

// 일반 앱에서 import하지 않는 개발용 비교 화면이다. 실제 화면/진입 흐름은 후속 작업이다.
export function DesignAssetsPreview() {
  const loaded = new Set(getLoadedFonts());

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <StatusBar style="dark" />
      <Text accessibilityRole="header" style={styles.title}>P0 폰트·색상 확인</Text>
      <View style={styles.samples}>
        {Object.entries(fonts).map(([weight, fontFamily]) => (
          <View key={weight} style={styles.sample}>
            <Text style={styles.label}>{weight} · {loaded.has(fontFamily) ? '등록 확인' : '미등록'}</Text>
            <Text style={[styles.fontSample, { fontFamily }]}>
              {'도담도담 나눈 대화 속에서 자라나는 아이의 마음\n가나다라마바사 아자차카타파하 · ABC xyz 0123456789'}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.palette}>
        {Object.entries(colors).map(([name, color]) => (
          <View key={name} style={styles.colorCard}>
            <View style={[styles.swatch, { backgroundColor: color }]} />
            <Text style={styles.label}>{name}</Text>
            <Text style={styles.label}>{color}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: colors.surface, padding: 32, gap: 20 },
  title: { ...typography.title, color: colors.textPrimary },
  samples: { gap: 16 },
  sample: { gap: 6 },
  label: { ...typography.input, color: colors.textSecondary },
  fontSample: { fontSize: 24, lineHeight: 33.6, color: colors.textPrimary },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorCard: { width: 144, gap: 4 },
  swatch: { height: 24, borderColor: colors.border, borderWidth: 1 },
});
