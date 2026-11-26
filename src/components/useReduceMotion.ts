import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let acceptInitial = true;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', enabled => {
      acceptInitial = false;
      setReduceMotion(enabled);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (acceptInitial) setReduceMotion(enabled);
    }).catch(() => {});
    return () => { acceptInitial = false; subscription.remove(); };
  }, []);

  return reduceMotion;
}
