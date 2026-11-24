import { StyleSheet } from 'react-native';

import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { HOME_DESTINATIONS, type HomeDestination } from '../navigation/routes';
import { colors, typography } from '../theme/tokens';

export function HomeDestinationPreview({ destination, onBack }: { destination: HomeDestination; onBack: () => void }) {
  const guardian = destination.route === HOME_DESTINATIONS.guardian;
  return <>
    <AppText accessibilityRole="header" style={styles.title}>{guardian ? '보호자 모드' : '대화'}</AppText>
    <AppText>{guardian ? '보호자 모드를 준비하고 있어요.' : '대화 화면을 준비하고 있어요.'}</AppText>
    <Button label="홈으로 돌아가기" variant="secondary" onPress={onBack} />
  </>;
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
});
