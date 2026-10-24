# Vercel `king` 배포

화면·API·Socket.IO 게임 서버를 모두 Vercel에서 실행합니다. 별도 게임 서버는 필요하지 않습니다. Vercel 인스턴스가 바뀌어도 같은 방을 사용하도록 **Upstash Redis**에 게임·계정·복귀 세션을 저장합니다. Redis는 게임 저장소이며 외부 AI API가 아닙니다. AI는 포함된 PPO 모델을 CPU로 실행합니다.

## 1. 저장소 연결

Vercel `king` → **Settings → Git**에서 이 코드가 있는 GitHub 저장소를 연결합니다. `package.json`과 `vercel.json`이 있는 폴더를 Root Directory로 지정합니다. 저장소 루트에 있으면 기본값을 유지합니다.

아래 파일이 저장소에 포함되어야 합니다.

- `api/server.js`, `server.js`, `vercel.json`, `package.json`, `package-lock.json`
- `lib/`, `ai/`, `public/`, `deploy/build-vercel.js`
- **`models/strategy-v10-robust2.json`**

## 2. Redis 연결 — 필수

프로젝트의 **Storage → Create Database / Marketplace → Upstash Redis**에서 데이터베이스를 만들고 `king`에 연결합니다. UI에 따라 Marketplace에서 직접 추가할 수도 있습니다.

**Settings → Environment Variables**에 다음 두 값이 있어야 합니다. Upstash 데이터베이스의 REST API 화면에서도 확인할 수 있습니다.

| 변수 | 값 |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | Upstash의 HTTPS REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | 읽기·쓰기 가능한 REST token |

통합 연결이 `KV_REST_API_URL`, `KV_REST_API_TOKEN`으로 추가한 경우도 지원합니다. 읽기 전용 token은 사용할 수 없습니다. 키는 서버에서만 사용하며 클라이언트에는 포함되지 않습니다.

Production과 Preview의 게임 상태는 기본적으로 분리됩니다. 여러 프로젝트가 하나의 Redis를 공유한다면 프로젝트마다 `GAME_STATE_NAMESPACE`를 다르게 설정하세요. 같은 프로젝트의 재배포에는 같은 namespace를 유지합니다.

## 3. 빌드 설정

`vercel.json`에 설정되어 있습니다. 대시보드에서 기존 Next.js 등의 설정을 사용 중이면 아래로 맞춥니다.

| 항목 | 값 |
| --- | --- |
| Framework Preset | Other |
| Install Command | `npm ci --include=dev` |
| Build Command | `npm run build:vercel` |
| Output Directory | `public` |
| Node.js Version | 22.x |
| Fluid Compute | Enabled |

`npm start`는 Build Command에 넣지 않습니다. 함수 진입점은 `api/server.js`이며 포트를 직접 열지 않습니다. 빌드가 Socket.IO 브라우저 클라이언트를 정적 파일로 복사하고 모델 포함 여부를 확인합니다.

## 4. 배포

최신 코드를 GitHub의 연결된 브랜치에 올립니다. 자동 배포가 시작됩니다. 이미 반영된 커밋을 다시 배포하려면 **Deployments → ⋯ → Redeploy**를 선택하세요. 환경변수를 추가한 뒤에도 Redeploy가 필요합니다.

`Ready`가 되면 **Visit**을 누릅니다. 두 브라우저에서 같은 방에 참가하고 AI를 추가해 확인하세요.

- `/health`: `{"ok":true}`
- `/api/ai`: `available: true`
- `/api/ai-chat/status`: `mode: "reinforcement-only"`, `enabled: false`

Vercel 함수에는 실행 시간 제한이 있으므로 WebSocket이 주기적으로 재연결됩니다. 브라우저와 Godot 클라이언트는 기존 복귀 토큰으로 같은 자리에 재접속합니다. 다른 인스턴스의 변경은 최대 약 1.5초의 폴링 간격 뒤 전달됩니다. Redis 사용량에는 이 동기화 요청도 포함됩니다. 현재는 모든 방의 쓰기를 직렬화하는 소규모 게임용 구조입니다.

로컬 실행은 기존대로 `npm start`를 사용하며 Redis가 필요 없습니다. 기존 로컬 `.data`의 계정·방은 Vercel Redis로 자동 복사하지 않습니다.

## 오류 확인

- `UPSTASH_REDIS… 필요`: 위 두 환경변수를 추가하고 Redeploy.
- `공유 게임 저장소 연결 실패`: REST URL·쓰기 token·Redis 사용 한도 확인.
- AI 사용 불가: 모델 파일이 GitHub에 포함되어 있는지 확인.
- 화면만 나오고 연결 안 됨: Fluid Compute 활성화 여부와 Vercel Runtime Logs 확인.
- 다른 사람이 접속할 수 없음: 프로젝트의 Deployment Protection에서 공개 Production 접근 설정 확인.

공식 문서: https://vercel.com/docs/functions/websockets
