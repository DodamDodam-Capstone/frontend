import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

const maxTimerDelay = 2_147_483_647;

export function useRetryWaiting(retryAt: number | undefined): boolean {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (retryAt === undefined) return;
    const deadline = retryAt;
    let timer: ReturnType<typeof setTimeout>;
    function sync() {
      clearTimeout(timer);
      const time = Date.now();
      setNow(time);
      if (deadline > time) timer = setTimeout(sync, Math.min(deadline - time, maxTimerDelay));
    }
    sync();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') sync(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [retryAt]);
  return retryAt !== undefined && retryAt > now;
}
