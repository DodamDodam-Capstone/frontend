import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { AppState, ScrollView, StyleSheet, View } from 'react-native';

import { createApiClient } from './src/api/client';
import { SignupVerificationScreen } from './src/auth/SignupVerificationScreen';
import { Button } from './src/components/Button';
import { EntrySplash } from './src/components/EntrySplash';
import { ErrorMessage } from './src/components/ErrorMessage';
import { LoadingIndicator } from './src/components/LoadingIndicator';
import { createEntryController, type EntrySnapshot } from './src/navigation/entryController';
import { EntryDestination } from './src/navigation/EntryDestination';
import { EntryPrivacySurface, readForegroundGeneration, subscribeToTaskReentry } from './src/navigation/entryPrivacy';
import { EntrySessionContext } from './src/navigation/entrySession';
import { OnboardingFlow } from './src/onboarding/OnboardingFlow';
import { colors } from './src/theme/tokens';

const onboardingKey = '@dodamdodam/onboarding-complete-v1';
const maxTimerDelay = 2_147_483_647;
type Onboarding = 'checking' | 'needed' | 'saving' | 'complete';
type EntryController = ReturnType<typeof createEntryController>;
type EntryErrorState = Extract<EntrySnapshot, { kind: 'error' }>;

function EntryFrame({ children }: { children: ReactNode }) {
  return (
    <ScrollView bounces={false} style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.content}>{children}</View>
    </ScrollView>
  );
}

function EntryError({ state, onRetry }: { state: EntryErrorState; onRetry: () => void }) {
  const { retryAt } = state;
  const [waiting, setWaiting] = useState(() => retryAt !== undefined && retryAt > Date.now());

  useEffect(() => {
    if (retryAt === undefined) return;
    const deadline = retryAt;
    let timer: ReturnType<typeof setTimeout>;
    function syncDelay() {
      clearTimeout(timer);
      const remaining = deadline - Date.now();
      setWaiting(remaining > 0);
      if (remaining > 0) timer = setTimeout(syncDelay, Math.min(remaining, maxTimerDelay));
    }
    syncDelay();
    const subscription = AppState.addEventListener('change', status => { if (status === 'active') syncDelay(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [retryAt]);

  return <>
    <ErrorMessage message={waiting ? '요청이 많아요. 잠시 기다린 뒤 다시 시도해 주세요.' : '로그인 상태를 확인할 수 없어요. 다시 시도해 주세요.'} />
    <Button label="다시 시도" variant="secondary" disabled={waiting} onPress={onRetry} />
  </>;
}

function EntryContent({ controller }: { controller: EntryController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  if (state.kind === 'route') {
    const signup = state.signup;
    const hideHome = state.logoutPending && state.childId !== undefined;
    return <EntryPrivacySurface key={state.visit} generation={state.generation} style={styles.screen}>
      <View style={state.logoutPending ? styles.hidden : styles.screen}
        accessibilityElementsHidden={state.logoutPending}
        importantForAccessibility={state.logoutPending ? 'no-hide-descendants' : 'auto'}>
        {signup
          ? <SignupVerificationScreen flow={signup} onBack={() => controller.closeSignup(signup)} />
          : !hideHome && <EntryDestination route={state.route} visit={state.visit} childId={state.childId}
            openSignup={controller.openSignup} loginRetryAt={state.loginRetryAt} loginFeedback={state.loginFeedback}
            loginBlocked={state.loginBlocked} loginCsrfRecovery={state.loginCsrfRecovery}
            logoutRetryAt={state.logoutRetryAt} logoutFeedback={state.logoutFeedback} />}
      </View>
      {state.logoutPending && <EntryFrame><LoadingIndicator label="로그아웃 중" /></EntryFrame>}
    </EntryPrivacySurface>;
  }

  return (
    <EntryFrame>
      {state.kind === 'loading' && <LoadingIndicator label="로그인 상태 확인 중" />}
      {state.kind === 'error' && <EntryError key={state.retryAt} state={state} onRetry={() => { void controller.retry(); }} />}
    </EntryFrame>
  );
}

export default function App() {
  const [startup] = useState(() => {
    const result = createApiClient();
    if (!result.ok) return null;
    const client = result.value;
    const controller = createEntryController(client, readForegroundGeneration);
    return {
      controller,
      session: {
        client,
        receiveProtectedAuthResult: controller.receiveProtectedAuthResult,
        isHomeVisitCurrent: controller.isHomeVisitCurrent,
        getHomeRetryAt: controller.getHomeRetryAt,
        rememberHomeRetry: controller.rememberHomeRetry,
        refreshEntry: controller.refresh,
        submitLogin: controller.submitLogin,
        submitLogout: controller.submitLogout,
        retryLogoutCsrf: controller.retryLogoutCsrf,
      },
    };
  });
  const [splashVisible, setSplashVisible] = useState(true);
  const [onboarding, setOnboarding] = useState<Onboarding>('checking');
  const saving = useRef(false);

  useEffect(() => {
    if (!startup) return;
    const { controller } = startup;
    const subscription = AppState.addEventListener('change', status => {
      if (status === 'background') controller.suspend();
      if (status === 'active') void controller.resume();
    });
    const taskSubscription = subscribeToTaskReentry(controller.reenterTask);
    void controller.start();
    if (AppState.currentState === 'background') controller.suspend();
    return () => {
      subscription.remove();
      taskSubscription?.remove();
      controller.stop();
    };
  }, [startup]);

  useEffect(() => {
    let active = true;
    async function readCompletion() {
      let complete = false;
      try {
        complete = await AsyncStorage.getItem(onboardingKey) === 'true';
      } catch {
        // 완료 여부를 읽을 수 없으면 이미 끝냈다고 가정하지 않는다.
      }
      if (active) setOnboarding(complete ? 'complete' : 'needed');
    }
    void readCompletion();
    return () => { active = false; };
  }, []);

  async function completeOnboarding() {
    if (saving.current) return;
    saving.current = true;
    setOnboarding('saving');
    try {
      await AsyncStorage.setItem(onboardingKey, 'true');
    } catch {
      // 쓰기 실패가 이번 실행의 진입을 막지 않는다.
    }
    setOnboarding('complete');
  }

  let screen: ReactNode;
  if (splashVisible) {
    screen = <EntrySplash onComplete={() => setSplashVisible(false)} />;
  } else if (onboarding === 'checking' || onboarding === 'saving') {
    screen = <EntryFrame><LoadingIndicator label="앱 시작 준비 중" /></EntryFrame>;
  } else if (onboarding === 'needed') {
    screen = <OnboardingFlow onComplete={() => { void completeOnboarding(); }} />;
  } else if (startup) {
    screen = <EntryContent controller={startup.controller} />;
  } else {
    screen = <EntryFrame><ErrorMessage message="앱 설정을 확인할 수 없어요." /></EntryFrame>;
  }

  return (
    <EntrySessionContext.Provider value={startup?.session ?? null}>
      {screen}
      {!splashVisible && <StatusBar style="dark" />}
    </EntrySessionContext.Provider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  hidden: { display: 'none' },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  content: { width: '100%', maxWidth: 560, gap: 16 },
});
