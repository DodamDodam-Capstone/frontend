import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BackHandler, Platform, ScrollView, StyleSheet } from 'react-native';

import { classifyRecovery } from '../api/recovery';
import { parseApiResponse } from '../api/response';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { useRetryWaiting } from '../components/useRetryWaiting';
import { useEntrySession } from '../navigation/entrySession';
import { HOME_DESTINATIONS, type HomeDestination } from '../navigation/routes';
import { colors, typography } from '../theme/tokens';
import { getHomeBoundaryDelay, getHomeTalkState, parseHomeData, type HomeData } from './homeData';
import { HomeDestinationPreview } from './HomeDestinationPreview';
import { HomeScreen } from './HomeScreen';

type HomeState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; retryAt?: number }
  | { kind: 'ready'; data: HomeData; refreshAt: number; talkUntil?: number; talkLocked: boolean; animateRegistrationEntry: boolean };

const loading: HomeState = { kind: 'loading' };
const monotonicNow = () => performance.now();
const rateLimitMessage = '요청이 많아요. 잠시 기다린 뒤 다시 시도해 주세요.';

type HomeEntryProps = {
  visit: number;
  childId: string;
  animateRegistrationEntry?: boolean;
  reduceMotion: boolean;
  logoutRetryAt?: number;
  logoutFeedback?: string;
};

export function HomeEntry({ visit, childId, animateRegistrationEntry = false, reduceMotion, logoutRetryAt, logoutFeedback }: HomeEntryProps) {
  const {
    client, receiveProtectedAuthResult, submitLogout, isHomeVisitCurrent, getHomeRetryAt, rememberHomeRetry,
  } = useEntrySession();
  const [state, setState] = useState<HomeState>(loading);
  const [destination, setDestination] = useState<HomeDestination>();
  const opened = useRef(false);
  const request = useRef<AbortController | null>(null);
  const registrationEntrancePending = useRef(animateRegistrationEntry);
  const logoutDisabled = useRetryWaiting(logoutRetryAt);
  const retryWaiting = useRetryWaiting(state.kind === 'error' ? state.retryAt : undefined, monotonicNow);

  const load = useCallback(async () => {
    if (opened.current || request.current || !isHomeVisitCurrent(visit)) return;
    const retryAt = getHomeRetryAt(visit);
    if (retryAt !== undefined && retryAt > monotonicNow()) {
      setState({ kind: 'error', message: rateLimitMessage, retryAt });
      return;
    }
    const aborter = new AbortController();
    request.current = aborter;
    const isCurrent = () => request.current === aborter && isHomeVisitCurrent(visit);
    setState(loading);
    try {
      const sentAt = monotonicNow();
      const result = await client.request({ method: 'GET', path: `/children/${childId}/home`, signal: aborter.signal });
      const receivedAt = monotonicNow();
      if (!isCurrent()) return;
      if (result.kind !== 'response') {
        setState({ kind: 'error', message: '홈을 불러올 수 없어요. 다시 시도해 주세요.' });
        return;
      }
      if (result.response.status === 401 && await receiveProtectedAuthResult(result, isCurrent)) return;
      if (!isCurrent() || !client.isCurrentContext(result.context)) return;
      const parsed = await parseApiResponse(result.response, { kind: 'json', statuses: [200] });
      if (!isCurrent() || !client.isCurrentContext(result.context)) return;
      const data = parsed.kind === 'json' ? parseHomeData(parsed.data, childId) : null;
      if (data) {
        const delay = getHomeBoundaryDelay(data);
        // 서버 시간은 초 단위다. 자정 직전의 나머지 밀리초와 왕복 지연만큼 보수적으로 잠근다.
        const talkUntil = data.availability.canEnter ? sentAt + delay - 999 : undefined;
        const talkLocked = talkUntil !== undefined && monotonicNow() >= talkUntil;
        const enterWithFade = registrationEntrancePending.current;
        registrationEntrancePending.current = false;
        setState({ kind: 'ready', data, refreshAt: receivedAt + delay, talkUntil, talkLocked, animateRegistrationEntry: enterWithFade });
        return;
      }
      const recovery = classifyRecovery(parsed, 'general');
      if (recovery.kind === 'rate_limited') {
        const nextRetry = recovery.retryAfter.kind === 'valid' ? receivedAt + recovery.retryAfter.seconds * 1000 : undefined;
        if (nextRetry !== undefined) rememberHomeRetry(visit, nextRetry);
        setState({ kind: 'error', message: rateLimitMessage, retryAt: nextRetry });
      } else if (recovery.kind === 'resource_not_found') {
        setState({ kind: 'error', message: '아이의 홈 정보를 확인할 수 없어요. 다시 시도해 주세요.' });
      } else {
        setState({ kind: 'error', message: '홈을 불러올 수 없어요. 다시 시도해 주세요.' });
      }
    } finally {
      if (request.current === aborter) request.current = null;
    }
  }, [childId, client, getHomeRetryAt, isHomeVisitCurrent, receiveProtectedAuthResult, rememberHomeRetry, visit]);

  useLayoutEffect(() => {
    let mounted = true;
    void Promise.resolve().then(() => {
      if (mounted) return load();
    });
    return () => {
      mounted = false;
      const pending = request.current;
      request.current = null;
      pending?.abort();
    };
  }, [load]);

  useEffect(() => {
    if (state.kind !== 'ready' || destination) return;
    const refresh = setTimeout(() => { void load(); }, Math.max(0, state.refreshAt - monotonicNow()));
    const lock = state.talkUntil !== undefined && !state.talkLocked
      ? setTimeout(() => {
        setState(current => current === state ? { ...state, talkLocked: true } : current);
      }, Math.max(0, state.talkUntil - monotonicNow()))
      : undefined;
    return () => {
      clearTimeout(refresh);
      clearTimeout(lock);
    };
  }, [destination, load, state]);

  const backToHome = useCallback(() => {
    if (!opened.current || !isHomeVisitCurrent(visit)) return;
    opened.current = false;
    setDestination(undefined);
    void load();
  }, [isHomeVisitCurrent, load, visit]);

  useEffect(() => {
    if (!destination || Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      backToHome();
      return true;
    });
    return () => subscription.remove();
  }, [backToHome, destination]);

  function open(next: HomeDestination) {
    if (opened.current || request.current || !isHomeVisitCurrent(visit)) return;
    opened.current = true;
    setDestination(next);
  }

  function openConversation() {
    if (state.kind !== 'ready' || state.talkUntil === undefined || monotonicNow() >= state.talkUntil) return;
    const conversationId = state.data.activeConversationId;
    open(conversationId
      ? { route: HOME_DESTINATIONS.conversation, childId, intent: 'resume', conversationId }
      : { route: HOME_DESTINATIONS.conversation, childId, intent: 'start' });
  }

  function logout() {
    void submitLogout();
  }

  const logoutActions = <>
    {logoutFeedback && <ErrorMessage message={logoutFeedback} />}
    <Button label="로그아웃" variant="secondary" disabled={logoutDisabled} onPress={logout} />
  </>;

  if (destination) {
    return <ScrollView bounces={false} style={styles.screen} contentContainerStyle={styles.container}>
      <HomeDestinationPreview destination={destination} onBack={backToHome} />
      {logoutActions}
    </ScrollView>;
  }

  const display = state.kind === 'ready' ? {
    data: state.data,
    talkState: state.talkLocked ? 'checking' as const : getHomeTalkState(state.data),
    animateRegistrationEntry: state.animateRegistrationEntry,
  } : {
    fallback: <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <AppText accessibilityRole="header" style={styles.title}>홈</AppText>
      {state.kind === 'loading' && <LoadingIndicator label="홈 정보 확인 중" />}
      {state.kind === 'error' && <>
        <ErrorMessage message={state.message} />
        <Button label="다시 시도" variant="secondary" disabled={retryWaiting} onPress={() => { void load(); }} />
      </>}
      {logoutActions}
    </ScrollView>,
  };

  return <HomeScreen {...display} reduceMotion={reduceMotion} onTalk={openConversation}
    onGuardian={() => open({ route: HOME_DESTINATIONS.guardian, childId })}
    onLogout={logout} onRefresh={() => { void load(); }} logoutDisabled={logoutDisabled} logoutFeedback={logoutFeedback} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  container: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32 },
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
});
