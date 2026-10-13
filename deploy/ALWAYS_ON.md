# 컴퓨터를 꺼도 돌아가는 배포

## 권장 구조

- Node.js/Socket.IO 게임 서버: 상시 실행되는 유료 Railway 서비스 또는 VPS.
- Supabase: 계정·점수·게임 데이터 영구 저장.
- OpenAI: 선택형 대화 API. 게임 서버의 상태를 읽으며 API 사용량은 별도 과금됩니다.

Supabase 자체는 현재 장기 실행 Node.js/Socket.IO 서버를 그대로 호스팅하는 대체 서비스가 아닙니다. Supabase Edge Functions만으로 이 앱을 옮기지 마세요. 무료 플랜의 휴면·제한 조건은 제공업체 현재 정책을 확인하세요. 중단 없는 운영은 상시 실행 요금제와 모니터링이 필요합니다.

## Supabase 설정

1. 프로젝트 생성 → SQL Editor → `deploy/supabase.sql` 실행.
2. 게임 서버 환경변수에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 설정.
3. `service_role` 또는 서버용 secret 키는 브라우저·GitHub에 공개하지 않습니다.
4. 설정 시 Supabase에서 상태를 읽고 변경을 저장합니다. 처음 DB가 비어 있으면 현재 로컬 파일을 최초 데이터로 사용합니다. 단일 게임 서버 인스턴스 기준입니다.

## Railway 또는 VPS 설정

Node20+, 설치 `npm ci`, 시작 `npm start`. 플랫폼 PORT 환경변수를 사용합니다. WebSocket을 지원하는 상시 실행 서비스를 선택하세요. Railway GitHub 연결 또는 VPS에서 저장소 복제 후 실행합니다. Supabase 키와 OpenAI 키는 서비스 환경변수로 입력합니다.

## OpenAI 설정

`OPENAI_API_KEY`, 선택적으로 `OPENAI_CHAT_MODEL`(기본 `gpt-4.1-mini`). 키가 없으면 기존 규칙 기반 응답을 사용합니다. 키가 있으면 접근 가능한 채널의 최근 메시지와 본인용 게임 상태를 API에 전달합니다. 10초 간격·봇당 동시1회·12초 타임아웃, 한 입력에 AI1명 응답입니다.

API는 짧은 답변과 협력 의도를 반환합니다. 그 의도는 2분/같은 날 안에서 강화학습 정책의 **합법 행동 후보 확률**에 작은 보정으로 반영됩니다. API가 직접 게임 상태나 점수·카드를 수정하지 않습니다. 이는 대화 의도 연결이며, API 대화로 PPO 가중치가 자동 재학습되는 기능은 아닙니다. 실제 대화 학습에는 별도 경험 수집·평가가 필요합니다.

OpenAI 실제 호출은 키를 서버에 설정한 뒤 확인해야 합니다. 키 없이 모델 응답 능력·비밀 유지 품질을 검증했다고 주장하지 않습니다.
