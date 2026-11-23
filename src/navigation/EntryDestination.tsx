import { ScrollView, StyleSheet } from 'react-native';

import type { LoginFeedback } from '../auth/emailLogin';
import { LoginScreen } from '../auth/LoginScreen';
import { AppText } from '../components/AppText';
import { colors, typography } from '../theme/tokens';
import { useEntrySession } from './entrySession';
import { ROUTES, type RoutePath } from './routes';

const titles = {
  [ROUTES.childRegistration]: '아이 등록',
  [ROUTES.home]: '홈',
};

export function EntryDestination({ route, loginRetryAt, loginFeedback }: {
  route: RoutePath;
  loginRetryAt?: number;
  loginFeedback?: LoginFeedback;
}) {
  const { submitLogin } = useEntrySession();
  if (route === ROUTES.login) {
    return <LoginScreen submit={submitLogin} retryAt={loginRetryAt} initialFeedback={loginFeedback} />;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <AppText accessibilityRole="header" style={styles.title}>{titles[route]}</AppText>
      <AppText style={styles.description}>화면을 준비하고 있어요.</AppText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  container: { flexGrow: 1, justifyContent: 'center', gap: 16, padding: 32 },
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
  description: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
