import { registerRootComponent } from 'expo';
import { DesignAssetsPreview } from '../../src/examples/DesignAssetsPreview';

// native-session 진단과 같은 별도 Metro 진입점. 일반 index.ts에서 연결하지 않는다.
registerRootComponent(DesignAssetsPreview);
