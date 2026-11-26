import { ScrollView, StyleSheet } from 'react-native';

import type { LoginFeedback } from '../auth/emailLogin';
import { LoginScreen } from '../auth/LoginScreen';
import { ChildRegistrationScreen } from '../childRegistration/ChildRegistrationScreen';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { HomeEntry } from '../home/HomeEntry';
import { ErrorMessage } from '../components/ErrorMessage';
import { useRetryWaiting } from '../components/useRetryWaiting';
import { colors, typography } from '../theme/tokens';
import { useEntrySession } from './entrySession';
import { ROUTES, type RoutePath } from './routes';

export function EntryDestination({
  route, visit, childId, loginRetryAt, loginFeedback, loginBlocked, loginCsrfRecovery,
  logoutRetryAt, logoutFeedback, registrationCheck, registrationRetryAt, animateRegistrationEntry, reduceMotion, openSignup,
}: {
  route: RoutePath;
  visit: number;
  childId?: string;
  loginRetryAt?: number;
  loginFeedback?: LoginFeedback;
  loginBlocked?: boolean;
  loginCsrfRecovery?: boolean;
  logoutRetryAt?: number;
  logoutFeedback?: string;
  registrationCheck?: string;
  registrationRetryAt?: number;
  animateRegistrationEntry?: boolean;
  reduceMotion: boolean;
  openSignup: () => void;
}) {
  const { submitLogin, submitLogout, retryLogoutCsrf } = useEntrySession();
  const waiting = useRetryWaiting(logoutRetryAt);
  if (route === ROUTES.login) {
    return <LoginScreen submit={submitLogin} retryAt={loginRetryAt} initialFeedback={loginFeedback}
      blocked={loginBlocked} retrySecurity={loginCsrfRecovery ? retryLogoutCsrf : undefined} openSignup={openSignup} />;
  }

  if (route === ROUTES.home && childId) {
    return <HomeEntry visit={visit} childId={childId} logoutRetryAt={logoutRetryAt} logoutFeedback={logoutFeedback}
      animateRegistrationEntry={animateRegistrationEntry} reduceMotion={reduceMotion} />;
  }

  if (route === ROUTES.childRegistration) {
    return <ChildRegistrationScreen visit={visit} checkMessage={registrationCheck} retryAt={registrationRetryAt}
      logoutDisabled={waiting} logoutFeedback={logoutFeedback} />;
  }

  return (
    <ScrollView bounces={false} style={styles.screen} contentContainerStyle={styles.container}>
      <AppText accessibilityRole="header" style={styles.title}>홈</AppText>
      <AppText style={styles.description}>화면을 준비하고 있어요.</AppText>
      {logoutFeedback && <ErrorMessage message={logoutFeedback} />}
      <Button label="로그아웃" variant="secondary" disabled={waiting} onPress={() => { void submitLogout(); }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  container: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32 },
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
  description: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
