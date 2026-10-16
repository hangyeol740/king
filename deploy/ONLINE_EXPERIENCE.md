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

대화 내보내기는 공개 대화만 언어 모델 학습용 messages JSONL로 만듭니다. 비밀방·1대1 대화는 기록되지만 공용 모델 학습 파일에 자동 포함하지 않습니다. 게임 ID 기준으로 학습/검증 데이터를 분리하고, 개인정보·품질 검토 후 사용하는 것이 필요합니다. 외부 모델 파인튜닝 API를 자동 호출하거나 요금을 발생시키지 않습니다.

런타임 AI에는 실제 사람 메시지의 길이·질문 비율·구어체 비율 통계만 말투 참고로 전달합니다. 원문을 다른 비밀 채널에 복사하지 않습니다. 새 데이터가 쌓이면 해당 통계는 바로 갱신됩니다. 언어 모델 가중치가 자동으로 바뀌는 것은 아닙니다.

상태 확인: `/api/ai-chat/status`의 `experience`에는 현재 프로세스의 이벤트·행동·채팅·저장 실패 수만 표시합니다. 원문은 노출하지 않습니다.
