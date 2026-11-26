import { useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { SignedInLoginScreen } from '../auth/LoginScreen';
import { useEntranceMotion } from '../components/useEntranceMotion';
import { useReduceMotion } from '../components/useReduceMotion';
import { useRetryWaiting } from '../components/useRetryWaiting';
import { useEntrySession } from '../navigation/entrySession';
import { ChildRegistrationForm } from './ChildRegistrationForm';
import { TEST_CHILD_CHARACTERS, validateChildDraft, type ChildCharacter, type ChildDraft, type ChildFieldErrors } from './childRegistrationData';

function initialDraft(characters: readonly ChildCharacter[]): ChildDraft {
  return {
    name: '', nickname: '', birthDate: '', gender: '', interests: [],
    characterId: characters.find(character => character.id === TEST_CHILD_CHARACTERS[0].id)?.id ?? '',
  };
}

export function ChildRegistrationScreen({ visit, checkMessage, retryAt, logoutDisabled, logoutFeedback }: {
  visit: number;
  checkMessage?: string;
  retryAt?: number;
  logoutDisabled: boolean;
  logoutFeedback?: string;
}) {
  const { childCharacters, submitChild, checkChildRegistration, submitLogout } = useEntrySession();
  const [draft, setDraft] = useState(() => initialDraft(childCharacters));
  const [errors, setErrors] = useState<ChildFieldErrors>({});
  const [confirmation, setConfirmation] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [feedback, setFeedback] = useState<string>();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const retryWaiting = useRetryWaiting(retryAt);
  const reduceMotion = useReduceMotion();
  const navigationStyle = useEntranceMotion(showLogin, {
    reduceMotion, duration: 180, fromX: showLogin ? -8 : 8, playOnMount: false,
  });

  function change(values: Partial<ChildDraft>) {
    setDraft(current => ({ ...current, ...values }));
    setErrors(current => {
      const next = { ...current };
      for (const key of Object.keys(values) as (keyof ChildDraft)[]) delete next[key];
      return next;
    });
    setFeedback(undefined);
  }

  function review() {
    const validated = validateChildDraft(draft, childCharacters);
    if (!validated.ok) {
      setErrors(validated.errors);
      return;
    }
    setDraft(validated.value);
    setErrors({});
    setConfirmation(true);
  }

  async function submit() {
    if (running.current || (retryAt ?? 0) > Date.now()) return;
    running.current = true;
    setBusy(true);
    setFeedback(undefined);
    try {
      if (checkMessage) {
        await checkChildRegistration(visit);
      } else if (confirmation) {
        const result = await submitChild(visit, draft);
        if (!result) return;
        setFeedback(result.message);
        if (result.errors && Object.keys(result.errors).length > 0) {
          setErrors(result.errors);
          setConfirmation(false);
        }
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function back() {
    if (running.current) return;
    setConfirmation(false);
    setFeedback(undefined);
    if (confirmation && !checkMessage) return;
    setDraft(initialDraft(childCharacters));
    setErrors({});
    setShowLogin(true);
  }

  return (
    <Animated.View style={[styles.screen, navigationStyle]}>
      {showLogin
        ? <SignedInLoginScreen continueRegistration={() => setShowLogin(false)} logoutDisabled={logoutDisabled}
          logoutFeedback={logoutFeedback} onLogout={() => { void submitLogout(); }} />
        : <ChildRegistrationForm draft={draft} errors={errors} confirmation={confirmation} busy={busy}
          feedback={checkMessage ?? feedback} retryWaiting={retryWaiting} checkOnly={!!checkMessage}
          charactersAvailable={childCharacters.length > 0} characters={childCharacters}
          onChange={change} onNext={review} onBack={back} onSubmit={() => { void submit(); }} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
