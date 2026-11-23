import { createContext, useContext } from 'react';

import type { ApiClient, ApiResult } from '../api/client';
import type { LoginFeedback } from '../auth/emailLogin';

type EntrySession = {
  client: ApiClient;
  receiveProtectedAuthResult: (result: ApiResult) => Promise<boolean>;
  refreshEntry: () => Promise<void>;
  submitLogin: (email: string, password: string) => Promise<LoginFeedback | undefined>;
};

export const EntrySessionContext = createContext<EntrySession | null>(null);

export function useEntrySession(): EntrySession {
  const session = useContext(EntrySessionContext);
  if (!session) throw new Error('EntrySessionContext is required for an entry destination');
  return session;
}
