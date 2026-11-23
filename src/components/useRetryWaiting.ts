import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

const maxTimerDelay = 2_147_483_647;

export function useRetryWaiting(retryAt: number | undefined, clock: () => number = Date.now): boolean {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    if (retryAt === undefined) return;
    const deadline = retryAt;
    let timer: ReturnType<typeof setTimeout>;
    function sync() {
      clearTimeout(timer);
      const time = clock();
      setNow(time);
      if (deadline > time) timer = setTimeout(sync, Math.min(deadline - time, maxTimerDelay));
    }
    sync();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') sync(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [clock, retryAt]);
  return retryAt !== undefined && retryAt > now;
}
