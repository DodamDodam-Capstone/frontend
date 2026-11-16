import { useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { colors, typography } from '../theme/tokens';

// 일반 앱과 분리된 UI 상태 예제. 시험 입력은 메모리에서만 사용한다.
export function CommonUiPreview() {
  const [value, setValue] = useState('');
  const [presses, setPresses] = useState(0);
  const passwordRef = useRef<TextInput>(null);
  const [password, setPassword] = useState('');

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={styles.title}>공통 UI 상태 확인</Text>
        <View style={styles.columns}>
          <View style={styles.column}>
            <TextField label="시험 입력" value={value} onChangeText={setValue} placeholder="가상 값만 입력하세요"
              helperText="공백을 포함해 입력한 값을 유지합니다" returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()} submitBehavior="submit" />
            <TextField ref={passwordRef} label="시험 비밀번호" value={password} onChangeText={setPassword}
              secureTextEntry autoComplete="off" textContentType="none" />
            <TextField label="오류 입력" value="" onChangeText={() => {}} error="입력 내용을 확인해 주세요" />
            <TextField label="비활성 입력" value="변경할 수 없는 예제" onChangeText={() => {}} disabled />
          </View>
          <View style={styles.column}>
            <Button label="기본 버튼" onPress={() => setPresses((count) => count + 1)} />
            <Button label="보조 버튼" variant="secondary" onPress={() => setPresses((count) => count + 1)} />
            <Button label="비활성 버튼" disabled onPress={() => setPresses((count) => count + 1)} />
            <Button label="처리 중 버튼" loading onPress={() => setPresses((count) => count + 1)} />
            <Text style={styles.body}>실행 횟수: {presses}</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  container: { flexGrow: 1, padding: 32, gap: 24 },
  title: { ...typography.title, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: 32 },
  column: { flex: 1, minWidth: 260, gap: 16 },
});
