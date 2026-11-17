import { useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { TextField } from '../components/TextField';
import { colors, typography } from '../theme/tokens';

// 일반 앱과 분리된 UI 상태 예제. 시험 입력은 메모리에서만 사용한다.
export function CommonUiPreview() {
  const [value, setValue] = useState('');
  const [presses, setPresses] = useState(0);
  const passwordRef = useRef<TextInput>(null);
  const [password, setPassword] = useState('');
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogKind, setDialogKind] = useState<'input' | 'button'>('input');
  const [buttonDialogOpens, setButtonDialogOpens] = useState(0);
  const returnButtonRef = useRef<View>(null);
  const [dialogValue, setDialogValue] = useState('');
  const dialogInputRef = useRef<TextInput>(null);
  const returnInputRef = useRef<TextInput>(null);
  const [exampleState, setExampleState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [retries, setRetries] = useState(0);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled"
        accessibilityElementsHidden={dialogVisible} importantForAccessibility={dialogVisible ? 'no-hide-descendants' : 'auto'}>
        <Text accessibilityRole="header" style={styles.title}>공통 UI 상태 확인</Text>
        <View style={styles.columns}>
          <View style={styles.column}>
            <TextField ref={returnInputRef} label="시험 입력" value={value} onChangeText={setValue} placeholder="가상 값만 입력하세요" disabled={exampleState === 'loading'}
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
            <Button label="모달 열기" variant="secondary" onPress={() => { setDialogKind('input'); setDialogVisible(true); }} />
            <Button ref={returnButtonRef} label="버튼 복귀 모달 열기" variant="secondary" onPress={() => {
              setDialogKind('button'); setButtonDialogOpens((count) => count + 1); setDialogVisible(true);
            }} />
            <Text style={styles.note}>버튼 모달 열린 횟수: {buttonDialogOpens}</Text>
          </View>
        </View>
        <View style={styles.example}>
          <Text accessibilityRole="header" style={styles.body}>입력·로딩·오류 연결 예제</Text>
          <Text style={styles.note}>서버 요청 없이 버튼으로 상태를 바꿉니다. 시험 입력은 이 화면을 닫으면 사라집니다.</Text>
          {exampleState === 'idle' && <Button label="예제 시작" onPress={() => setExampleState('loading')} />}
          {exampleState === 'loading' && <>
            <LoadingIndicator label="입력 내용을 확인하고 있어요" />
            <Button label="오류 상태 보기" variant="secondary" onPress={() => setExampleState('error')} />
          </>}
          {exampleState === 'error' && <ErrorMessage
            message="입력 내용을 처리하지 못했어요. 입력한 내용은 그대로 남아 있어요. 내용을 확인하고 다시 시도해 주세요. 같은 문제가 계속되면 잠시 후 다시 이용해 주세요."
            onRetry={() => { setRetries((count) => count + 1); setExampleState('loading'); }} />}
          <Text style={styles.note}>재시도 실행 횟수: {retries}</Text>
          {exampleState !== 'idle' && <Button label="예제 초기화" variant="secondary" onPress={() => setExampleState('idle')} />}
        </View>
      </ScrollView>
      <Dialog visible={dialogVisible} title={dialogKind === 'input' ? '공통 모달 확인' : '버튼 포커스 확인'} onRequestClose={() => setDialogVisible(false)}
        initialFocusRef={dialogKind === 'input' ? dialogInputRef : undefined}
        returnFocusRef={dialogKind === 'input' ? returnInputRef : returnButtonRef}
        actions={<Button label="확인하고 닫기" onPress={() => setDialogVisible(false)} />}>
        {dialogKind === 'input' ? <>
          <Text style={styles.body}>입력과 닫기 동작을 확인하세요. 닫으면 바깥의 시험 입력으로 돌아갑니다.</Text>
          <TextField ref={dialogInputRef} label="모달 시험 입력" value={dialogValue} onChangeText={setDialogValue} />
        </> : <Text style={styles.body}>닫은 뒤 모달을 열었던 버튼에서 키보드로 다시 실행할 수 있는지 확인하세요.</Text>}
      </Dialog>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  container: { flexGrow: 1, padding: 32, gap: 24 },
  title: { ...typography.title, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  note: { ...typography.input, color: colors.textSecondary },
  example: { gap: 16, maxWidth: 596, width: '100%' },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: 32 },
  column: { flex: 1, minWidth: 260, gap: 16 },
});
