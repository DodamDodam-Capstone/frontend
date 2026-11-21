const designWidth = 1280;
const designHeight = 800;

// P0에서 두 캐릭터가 러그를 딛는 지점의 가운데.
const rugX = 350 / designWidth;
const rugY = 645 / designHeight;

export function getOnboardingLayout(width: number, height: number) {
  const widthScale = width / designWidth;
  const heightScale = height / designHeight;
  const scale = Math.min(widthScale, heightScale);
  const roomScale = Math.max(widthScale, heightScale);
  const extraWidth = width - designWidth * scale;
  const extraHeight = height - designHeight * scale;

  return {
    scale,
    left: extraWidth / 2,
    top: extraHeight / 2,
    roomScale,
    roomLeft: (width - designWidth * roomScale) * rugX,
    roomTop: (height - designHeight * roomScale) * rugY,
    // 방만 화면을 가득 채운다. 양쪽 인물은 같은 배율로 그리면서 발을 러그 위에 고정한다.
    sceneLeft: extraWidth * rugX,
    sceneTop: extraHeight * rugY,
  };
}
