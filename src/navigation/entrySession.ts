import { createContext, useContext } from 'react';

import type { ApiClient, ApiResult } from '../api/client';
import type { LoginFeedback } from '../auth/emailLogin';
import type { ChildCharacter, ChildDraft } from '../childRegistration/childRegistrationData';
import type { RegistrationFeedback } from './entryController';

type EntrySession = {
  client: ApiClient;
  receiveProtectedAuthResult: (result: ApiResult, stillCurrent?: () => boolean) => Promise<boolean>;
  isHomeVisitCurrent: (visit: number) => boolean;
  getHomeRetryAt: (visit: number) => number | undefined;
  rememberHomeRetry: (visit: number, retryAt: number) => void;
  refreshEntry: () => Promise<void>;
  childCharacters: readonly ChildCharacter[];
  submitChild: (visit: number, draft: ChildDraft) => Promise<RegistrationFeedback | undefined>;
  checkChildRegistration: (visit: number) => Promise<void>;
  submitLogin: (email: string, password: string) => Promise<LoginFeedback | undefined>;
  submitLogout: () => Promise<void>;
  retryLogoutCsrf: () => Promise<void>;
};

export const EntrySessionContext = createContext<EntrySession | null>(null);

export function useEntrySession(): EntrySession {
  const session = useContext(EntrySessionContext);
  if (!session) throw new Error('EntrySessionContext is required for an entry destination');
  return session;
}
