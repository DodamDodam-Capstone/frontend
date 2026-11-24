import { NativeModule, requireNativeModule, requireNativeView } from 'expo';
import { Platform, type ViewProps } from 'react-native';

type PrivacyEvents = { taskReentered: (event: { generation: number }) => void };
declare class EntryPrivacyModule extends NativeModule<PrivacyEvents> {
  foregroundGeneration(): number;
}
const nativePrivacy = requireNativeModule<EntryPrivacyModule>('EntryPrivacy');
export const readForegroundGeneration = () => nativePrivacy.foregroundGeneration();
export const EntryPrivacySurface = requireNativeView<ViewProps & { generation: number }>('EntryPrivacy');

export function subscribeToTaskReentry(listener: (generation: number) => void) {
  if (Platform.OS === 'android') {
    return nativePrivacy.addListener('taskReentered', event => listener(event.generation));
  }
}
