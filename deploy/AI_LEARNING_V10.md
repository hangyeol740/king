# AI 학습 개선 v10

## 적용 내용
- 전투·기습·신원조사를 학습 행동 목록에 추가하고 전투 대기/수락/대상 상태를 관측에 추가했습니다.
- 행동 종류별 후보 수 보정, 게임별 성향, 소량 카드 제출, 제작 인벤토리 순환 방지를 유지합니다.
- 기존 v2~v9 가중치는 의미가 같은 입력/출력 위치로 이전합니다.
- 실시간 AI의 기습 강제 건너뛰기를 제거했습니다.
- 대화 관찰→계획→실행 엔진을 서버에 연결했습니다. API 미설정 또는 실패 시 강화학습 정책으로 실행합니다.
- 기본 계획 API 대기 한도는 1500ms이며 `AI_PLAN_TIMEOUT_MS`로 변경할 수 있습니다.

## 학습과 비교
배포 기본 모델: `models/strategy-v10-candidate.json` (v10, 추가 학습 240판).
기존 `models/policy.json`은 비교·되돌리기용으로 유지합니다. `AI_MODEL_PATH`가 설정되어 있으면 해당 파일이 우선입니다.

외부 API 없이 CPU PPO 셀프플레이로 3~6인 다양한 진영·직업 및 상대 전략을 학습했습니다.
평가 보고서는 `models/strategy-v10-evaluation.json`에 있습니다.

| 상대 | 기존 모델 | 새 모델 | 각각 평가 판수 |
|---|---:|---:|---:|
| 혼합 전략 | 44.4% | 61.1% | 180 |
| 무작위 | 50.6% | 48.3% | 180 |

세 평가 시드를 사용하지만 카드 배분·진영 배정에는 서버의 암호학적 난수가 쓰이므로 완전히 동일한 게임을 비교한 실험은 아닙니다. 모든 상대에서의 개선이나 통계적 유의성을 보장하지 않습니다. 자연어 협상 품질은 이 외부 API 없는 PPO 평가에 포함되지 않습니다.

```sh
node ai/train.js --transfer models/policy.json --episodes 240 --batch 12 --players 3,4,5,6 --eval-games 60 --seed 20261015 --output models/strategy-v10-candidate.json
node ai/compare.js
node --test --test-reporter=dot
```
