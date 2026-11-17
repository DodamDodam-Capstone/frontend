import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export type KeyboardFocusResult = 'focused' | 'window-unfocused' | 'unavailable';

export type KeyboardFocusModule = {
  requestFocus(tag: number): Promise<KeyboardFocusResult>;
};

export function getKeyboardFocusModule(): KeyboardFocusModule | null {
  if (Platform.OS !== 'android') return null;
  return requireOptionalNativeModule<KeyboardFocusModule>('KeyboardFocus');
}
