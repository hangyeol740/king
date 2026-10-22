# 온라인 플레이 경험 기록·학습

## 기록
- 온라인 사람의 성공한 게임 행동과 채팅만 기록합니다. AI·대체 AI·공유 오프라인은 제외합니다.
- 파일: `DATA_DIR/training/events.jsonl` (기본 `.data/training/events.jsonl`). 서버 전용이며 정적 파일이나 API로 제공하지 않습니다.
- Supabase가 설정돼 있으면 기존 `kingdom_state` 테이블에 `experience:<이벤트 UUID>` 행으로 개별 보관합니다. 기존 RLS/service-role 권한을 사용하며 메인 게임 스냅샷과 분리됩니다.
- 인증 토큰·계정 식별자·방 코드를 기록하지 않으며 게임/배우별 별도 UUID를 사용합니다. 단, 채팅 원문에 사람이 직접 쓴 이름 등은 원문에 남습니다.
- 행동은 선택 직전 관찰 벡터·합법 후보 특징·선택 인덱스·역할·직업·인원수를 저장합니다. 게임 결과를 연결합니다. 후보와 정확히 맞지 않는 선택도 기록하지만 학습에서는 제외합니다.
- 채팅은 채널/대화방 구분·그 채널에서 보이는 직전 메시지·원문·시점을 보관합니다. 다른 비밀 채널이나 타인 손패는 대화 샘플에 넣지 않습니다.
- 기록은 계속 누적됩니다. 운영자는 저장 공간과 보관 정책을 관리해야 합니다. Render 임시 디스크만 사용하면 재배포 때 사라질 수 있으므로 지속 디스크 또는 Supabase가 필요합니다.

## 실제 학습
```sh
node ai/train-online.js --input .data/training/events.jsonl --model models/strategy-v10-robust2.json --output models/online-candidate.json
node ai/compare.js models/online-candidate.json models/strategy-v10-robust2.json models/online-evaluation.json
node ai/export-dialogue.js .data/training/events.jsonl /tmp/opencode/dialogue-training.jsonl
```

첫 명령은 완료된 실제 게임의 사람이 선택한 합법 행동에 클리핑된 모방 업데이트를 1회 적용합니다. 승리 행동은 가중치 1, 다른 행동은 .25를 사용합니다. 이것은 PPO 셀프플레이를 대체하지 않는 별도 모방 후보입니다. 자동으로 서버 정책을 교체하지 않으므로 별도 비교 평가가 필요합니다.

대화 내보내기는 공개·1대1·반란군·비밀방·관전 채널의 사람 원문을 모두 언어 모델 학습용 messages JSONL로 만듭니다. 욕설·비속어·초성·오타·공백을 순화하지 않습니다. AI·대체 AI는 제외합니다. 과거 메시지에는 발신자 종류가 없으므로 AI 발언 혼입을 막기 위해 history를 학습 입력으로 쓰지 않습니다. 각 원문은 별도 예제이며 서로 다른 채널을 대화 하나로 연결하지 않습니다. 외부 모델 파인튜닝 API는 자동 호출하지 않습니다.

말투 빈도 모델 학습:
```sh
node ai/train-human-speech.js /tmp/opencode/supabase-export.csv models/human-speech-style.json /tmp/opencode/human-dialogue-training.jsonl
```
입력은 Supabase CSV, JSON 배열 또는 기록 JSONL입니다. 메시지 길이 분포·질문·초성·공백·웃음/욕설 표지 빈도를 학습합니다. 런타임의 두 AI 대화 경로에 이를 전달하고 상황에 맞는 반말·비속어 원형 사용을 허용합니다. 발언 원문이나 이름을 공유 말투 모델에 넣지 않습니다. 모델은 `models/human-speech-style.json`으로 초기화한 뒤 새 사람 채팅을 누적하며 `DATA_DIR/human-speech.json`과 Supabase main의 `humanSpeech`에 저장합니다. 이벤트 ID 해시로 복구 중 중복 학습을 방지합니다. 이는 로컬 말투 빈도 모델과 프롬프트 적응이며 기반 언어 모델 가중치 파인튜닝은 별도입니다.

상태 확인: `/api/ai-chat/status`의 `experience`에는 현재 프로세스의 이벤트·행동·채팅·저장 실패 수만 표시합니다. 원문은 노출하지 않습니다.
