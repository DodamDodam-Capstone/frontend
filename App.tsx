import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { createExampleTransport } from './src/api/exampleTransport';
import { readEnvironment } from './src/config/env';
import { Logo } from './src/components/Logo';
import { colors, typography } from './src/theme/tokens';

function DevApiStatus() {
  const [example] = useState(() => {
    const environment = readEnvironment();
    return { environment, transport: createExampleTransport(environment) };
  });
  const [mockStatus, setMockStatus] = useState('API 모드 확인 중');

  useEffect(() => {
    if (!example.transport.ok || example.environment.apiMode !== 'mock') return;

    let active = true;
    example.transport.value({ method: 'GET', path: '/auth/me' }).then(
      (response) => { if (active) setMockStatus(`mock GET /auth/me: ${response.status}`); },
      () => { if (active) setMockStatus('mock 응답 확인 실패'); },
    );
    return () => { active = false; };
  }, [example]);

  const status = !example.transport.ok
    ? `API 설정 필요: ${example.transport.errors.map((error) => error.variable).join(', ')}`
    : example.environment.apiMode === 'real'
      ? 'real API 모드 선택: 서버 요청 없음'
      : mockStatus;
  return <Text style={styles.devStatus}>{status}</Text>;
}

export default function App() {
  return (
    <View style={styles.container}>
      <Logo accessibilityRole="header" />
      <Text style={styles.tagline}>도담도담 나눈 대화 속에서 자라나는 아이의 마음</Text>
      {__DEV__ && <DevApiStatus />}
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  tagline: {
    ...typography.tagline,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 24,
  },
  devStatus: {
    ...typography.input,
    color: colors.textSecondary,
    marginTop: 12,
  },
});
