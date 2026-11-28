# SCRUM-134 도담이 기본 모션

2026-11-28 KST에 홈·듣기·대기·말하기·종료 에셋을 확정했다. 도담이 원본 PNG를 참조해 Kling에서 동작을 생성하고, 로컬에서 배경 제거와 위치 보정을 거쳐 투명 에셋으로 변환했다. 말하기에는 두 손을 내린 기본 자세의 호흡과 눈 깜빡임을 사용한다. 말하기 손동작은 후속 제작 때 검토한다. [SCRUM-134](https://dodamdodam.atlassian.net/browse/SCRUM-134)

## 상태별 에셋

| 상태 | 파일 | 재생 규칙 |
| --- | --- | --- |
| 홈 | [인사·Idle 반복](../assets/images/home/dodami-greeting-idle-loop.webp) | 인사 5,042ms → Idle 5,042ms 두 번을 묶어 15,126ms 단위로 반복한다. 940×940 투명 Animated WebP다. |
| 듣기 | [진입](../assets/images/conversation-motion/dodami-listening-enter.webp) · [유지](../assets/images/conversation-motion/dodami-listening-hold.webp) · [이탈](../assets/images/conversation-motion/dodami-listening-exit.webp) | 손을 귀 옆으로 올리는 958ms 동작을 한 번 재생한다. 아이가 말하는 동안 손을 귀 옆에 둔 자세를 유지한다. 음성 입력이 끝나면 1,167ms에 걸쳐 기본 자세로 돌아온다. |
| 대기 | [진입](../assets/images/conversation-motion/dodami-thinking-enter.webp) · [유지](../assets/images/conversation-motion/dodami-thinking-hold.webp) · [이탈](../assets/images/conversation-motion/dodami-thinking-exit.webp) | 1,042ms 동안 생각하는 자세를 취하고 답변 음성을 기다리는 동안 자세를 유지한다. 대기가 끝나면 1,042ms에 걸쳐 기본 자세로 돌아온다. |
| 말하기 | [호흡·눈 깜빡임](../assets/images/conversation-motion/speaking/dodami-speaking-portrait.webp) | 음성 재생 중 4,200ms 몸 모션을 반복하고 음량에 맞춰 아래의 입 모양을 합성한다. |
| 종료 | [작별 인사](../assets/images/conversation-motion/dodami-farewell.webp) | 대화 종료 요청 시 3,250ms 손 인사를 한 번 재생한 후 홈으로 이동한다. 듣기와 대기 중에는 해당 자세에서 이탈한 뒤, 말하기 중에는 음성을 멈춘 뒤 작별 인사를 시작한다. |

대화 상태의 몸 에셋과 공통 기본 자세는 720×720이다. 듣기·대기의 유지 에셋은 단일 프레임 WebP이며 상태가 바뀔 때까지 표시한다. 유한 클립 길이는 화면에 표시된 시점부터 센다. 진입 클립 중에 다음 상태 요청이 오면 진입이 끝난 뒤 이탈한다. [유한 클립 재생 시간](../assets/images/conversation-motion/durations-ms.json)

홈 모션 로딩이 실패하거나 동작 줄이기가 켜져 있거나 출석 안내가 열려 있으면 정적 홈 캐릭터를 표시한다. 대화 모션 로딩이 실패하면 공통 기본 자세와 재시도 안내를 표시한다. 말하기 몸 에셋 로딩이 실패하면 공통 기본 자세 위에 입 모양을 표시하며 음성을 이어간다. 종료 요청을 받은 뒤 모션이 실패하면 홈으로 복귀한다. [정적 홈 캐릭터](../assets/images/home/character.png) · [대화 공통 기본 자세](../assets/images/conversation-motion/dodami-neutral.png)

## 말하기 입 모양

| 단계 | 에셋 | 사용 시점 |
| --- | --- | --- |
| 0 | [f88](../assets/images/conversation-motion/speaking/dodami-mouth-f88.png) | 기본 미소와 무음 |
| 1 | [f87](../assets/images/conversation-motion/speaking/dodami-mouth-f87.png) | 작은 소리와 발화 중 짧은 쉼 |
| 2 | [f86](../assets/images/conversation-motion/speaking/dodami-mouth-f86.png) | 중간 크기의 소리 |
| 3 | [f85](../assets/images/conversation-motion/speaking/dodami-mouth-f85.png) | 강세. 원본 입 이미지의 중앙 틈 10px 기준 |

입 모양은 112×60 RGBA PNG다. 1024×1024 기준 캔버스의 왼쪽 456px, 위 378px에 배치하며, 위치와 크기는 몸 표시 크기에 비례해 조절한다.

- 재생 중인 음성의 첫 PCM 채널로 RMS를 계산한다. 음량 평활화 시정수는 상승 35ms, 하강 80ms다.
- 입이 닫혀 있을 때 RMS 0.023 이상이면 발화를 시작한다. 열린 상태에서는 RMS 0.016 이상을 발화 연속으로 본다.
- 발화 중 입을 1–3단계로 유지한다. 2단계 진입·유지 기준은 0.085·0.065이며, 3단계 기준은 0.16·0.13이다. 42ms 간격으로 목표에 가까운 인접 프레임을 한 장씩 표시한다.
- 무음이 150ms를 넘거나 샘플 중단이 250ms를 넘으면 0단계로 돌아온다. 중단 뒤 첫 샘플은 무음 초기 상태에서 평가한다. 음성 종료·일시정지·버퍼링·오류 때는 입을 즉시 기본 미소로 돌린다.

## 검증과 연결

가로 iPad 시안에서 홈 인사와 Idle 반복을 확인했다. 테스트 버튼으로 듣기와 대기를 전환하고 로컬 인사 음성으로 말하기 박자와 최대 10px 입 모양을 검토했다. 종료 동작과 홈 복귀를 확인했으며, 이 문서의 에셋은 승인한 iPad 시안과 바이트 단위로 대조했다.

공통 재생 모듈과 플랫폼별 재생 검증은 SCRUM-135에서 진행한다. 약 21MB인 홈 모션의 첫 표시와 반복 성능은 모듈 검증에 포함한다. 실제 홈·대화 상태와 답변 음성 연결은 SCRUM-142에서 진행한다. [SCRUM-135](https://dodamdodam.atlassian.net/browse/SCRUM-135) · [SCRUM-142](https://dodamdodam.atlassian.net/browse/SCRUM-142)
