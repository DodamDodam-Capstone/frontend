import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { createExampleTransport } from './src/api/exampleTransport';
import { readEnvironment } from './src/config/env';

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
      <Text accessibilityRole="header" style={styles.title}>
        도담도담
      </Text>
      {__DEV__ && <DevApiStatus />}
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#111',
    fontSize: 28,
    fontWeight: '600',
  },
  devStatus: {
    color: '#444',
    fontSize: 14,
    marginTop: 12,
  },
});
