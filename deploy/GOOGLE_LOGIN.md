# Google 로그인 설정

웹의 기존 계정 로그인/가입과 별도로 Google Identity Services 버튼이 추가됩니다. 첫 Google 인증은 신규 계정을 만들고, 다음 인증은 동일한 Google sub 계정으로 로그인합니다. 기존 비밀번호 계정을 이메일만으로 자동 연결하지 않습니다.

1. Google Cloud Console → Google Auth Platform에서 동의 화면을 설정합니다.
2. OAuth client를 **Web application**으로 생성합니다.
3. Authorized JavaScript origins에 실제 HTTPS 게임 도메인, 개발용 `http://localhost:3000`을 등록합니다. 테스트 모드이면 테스트 사용자도 등록합니다.
4. 서버 환경변수 `GOOGLE_CLIENT_ID`에 발급한 공개 클라이언트 ID를 설정하고 재시작합니다. Client secret은 이 방식에서 필요 없습니다.
5. 웹의 계정 패널에서 Google 버튼을 눌러 실제 로그인/재로그인/닉네임 변경을 검증합니다.

Godot Android 네이티브 앱에서는 Google Credential Manager 플러그인 또는 시스템 브라우저의 일회용 코드 교환 흐름이 추가로 필요합니다. 현재 웹 버튼을 Godot 안에 넣지 않았으며, 네이티브 Google 로그인은 아직 연결하지 않았습니다. Android OAuth 클라이언트 등록에는 패키지명과 서명 인증서 SHA가 필요합니다.
