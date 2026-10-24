# 내 컴퓨터를 인터넷 게임 서버로 사용하기

게임 서버와 Cloudflare Quick Tunnel을 이 컴퓨터에서 실행합니다. 공유기 포트 포워딩 없이 외부의 다른 와이파이·컴퓨터·휴대폰에서 접속할 수 있습니다.

## 실행

프로젝트 폴더에서:

```bash
npm run online
```

기존 3000번 게임 서버가 있으면 연결만 붙이고, 없으면 게임 서버도 실행합니다. 준비가 끝나면 실제 발급된 `https://…trycloudflare.com` 주소를 출력합니다. 그 주소를 친구들에게 공유하고 온라인 방을 만든 뒤 방 코드로 참가하세요.

프로그램은 백그라운드에서 유지되므로 실행 명령을 입력한 터미널 창을 닫아도 계속 작동합니다. **컴퓨터를 끄거나 절전 상태가 되면 접속할 수 없습니다.** 인터넷 연결도 유지되어야 합니다.

## 주소 확인과 종료

```bash
npm run online:status
npm run online:stop
```

공개 연결을 중지하면 외부 주소가 작동하지 않습니다. 명령이 직접 시작한 게임 서버는 함께 종료합니다. 기존에 따로 실행 중이던 게임 서버는 종료하지 않습니다.

- 현재 주소·실행 상태: `.data/online.json`
- 연결 로그: `.data/online.log`
- 다른 로컬 포트: `PORT=3002 npm run online`
- 도구 경로 지정: `CLOUDFLARED_BIN=/도구/경로/cloudflared npm run online`

## 주소의 유지 범위

Quick Tunnel은 계정·도메인 없이 사용할 수 있는 임시 공개 주소입니다. 터널을 종료하거나 컴퓨터를 재시작한 뒤 다시 실행하면 주소가 바뀔 수 있습니다. 고정 주소·지속적인 운영에는 본인 Cloudflare 계정과 도메인을 연결한 Named Tunnel 설정이 필요합니다.

방·계정·진행 데이터는 현재 게임 서버의 저장 설정을 사용합니다. 이 연결 도구는 게임 데이터를 삭제하거나 계정·AI 설정을 변경하지 않습니다.

공식 문서: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
