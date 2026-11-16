import { registerRootComponent } from 'expo';
import { CommonUiPreview } from '../../src/examples/CommonUiPreview';

// 일반 index.ts에서 import하지 않는 네이티브 UI 확인용 Metro 진입점.
registerRootComponent(CommonUiPreview);
