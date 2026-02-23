# IPTV-Desktop
<img width="1312" height="912" alt="스크린샷 2026-02-14 오후 4 12 04" src="https://github.com/user-attachments/assets/bd0aa4fc-184a-44e4-9b17-6417d20f8a5d" />


- Electron 기반 IPTV 데스크탑 앱(플레이리스트 불러오기, 채널 재생, 백업 등).

<!-- Shields: replace <OWNER>/<REPO> with your GitHub owner/repo if you host this on GitHub -->
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://shields.io/)
[![Release](https://img.shields.io/github/v/release/<OWNER>/<REPO>.svg)](https://github.com/<OWNER>/<REPO>/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)


빠른 시작
1. 의존성 설치
   ```bash
   npm install
   ```
2. 개발 모드 실행
   ```bash
   npm start
   ```

번들(배포용) 만들기
- macOS DMG 빌드 (기본 x64):
  ```bash
  npm run dist
  # 결과: dist/IPTV-Desktop-0.1.0.dmg, dist/IPTV-Desktop.app
  ```
- Universal (x64 + arm64) 빌드:
  ```bash
  npx electron-builder --mac --x64 --arm64
  ```

앱 실행 / 검사
- DMG 열기(설치 창): `open dist/IPTV-Desktop-0.1.0.dmg`
- .app 직접 실행: `open dist/IPTV-Desktop.app`
- 앱 내부 리소스 확인: `ls -la dist/IPTV-Desktop.app/Contents/Resources/app`

중요 동작 / 주의사항
- 최초 실행 시 재생목록 초기화
  - 패키지화된 (번들) 앱이 처음 실행될 때 기존 `playlists.json`을 빈 배열로 초기화합니다.
  - 초기화는 한 번만 수행되며 사용자 데이터 폴더에 `playlists_cleared_v1`(sentinel) 파일을 생성해 다시 초기화되지 않도록 합니다.
  - 개발환경에서 초기화를 재검증하려면 사용자 계정의 앱 `userData` 폴더에서 해당 sentinel 파일을 삭제하세요.

- 사이드바 토글
  - 화면 왼쪽 상단에 고정된 토글 버튼(◀/▶)이 있습니다. 클릭하면 사이드바가 접히거나 펼쳐집니다.
  - 토글은 레이아웃을 직접 갱신하므로 비디오 재생이 중단되지 않습니다.

- 코드 서명 / 공증
  - 현재 빌드는 코드 서명이 적용되어 있지 않습니다. 배포(앱스토어 외 배포 포함)를 위해서는 Apple Developer 계정의 Developer ID 인증서로 서명하고 공증해야 합니다.
  - electron-builder 설정과 Apple 인증서 준비 방법은 electron-builder 문서(https://www.electron.build/code-signing)를 참고하세요.

디버깅/로그
- 개발 중 콘솔 로그는 `npm start`로 실행한 터미널 및 개발자 도구(Inspect)에서 확인하세요.

파일 위치(참고)
- 소스: `app/` (프론트엔드), `src/` (메인 프로세스)
- 빌드 결과: `dist/` (`.dmg`, `.app` 등)

문의 및 변경
- README에 추가할 내용이나 배포 설정(서명/공증, 자동 업데이트 등)을 원하시면 알려주세요.

## 인증이 필요한 스트림

특정 URL 패턴에 대해 HTTP 헤더를 추가할 수 있습니다.

```javascript
// Authorization 헤더 추가
window.electronAPI.authSet({
  pattern: 'example.com',
  useRegex: false,
  headers: { Authorization: 'Bearer TOKEN' }
});

// 설정된 인증 목록 조회
window.electronAPI.authList().then(console.log);
```

## 시스템 요구사항

- macOS 10.13 이상
- WIN OS
- Node.js 18+

## 저작권

© 2026 Michael. All rights reserved.

## 즐겨찾기 기능 사용법

- 즐겨찾기 추가: 채널 목록에서 별표(☆) 버튼을 클릭하면 즐겨찾기에 추가됩니다. 이미 추가된 항목은 별표가 채워진(★) 상태로 표시됩니다.
- 즐겨찾기 관리: 메인 화면 왼쪽 사이드바에서 `즐겨찾기 (N)` 버튼을 클릭하면 즐겨찾기 관리 모달이 열립니다. 모달에서 이름과 그룹을 편집하거나 항목을 재생/삭제할 수 있습니다.
- 검색/필터: 채널 화면에서 검색창에 여러 토큰을 입력하면 이름/그룹/TVG/URL에서 토큰을 모두 포함하는 항목만 표시됩니다. `즐겨찾기만` 체크박스로 즐겨찾기 항목만 필터링할 수 있습니다.
- 내보내기/가져오기: 즐겨찾기 목록을 JSON으로 내보내거나(브라우저 다운로드) 가져올 수 있습니다.
- 파일 동기화: 시스템 파일로 저장하거나 파일에서 불러오는 기능이 추가되었습니다. `파일에 저장` / `파일에서 불러오기` 버튼을 사용하면 로컬 파일에 직접 저장하거나 불러올 수 있습니다.

간단 테스트

1. 앱 실행: `npm start`
2. 플레이리스트 열기: 좌측 상단 `불러오기`에서 m3u 파일 또는 URL로 재생목록을 불러옵니다.
3. 채널 화면 진입: 재생목록의 `채널 보기` 버튼을 클릭합니다.
4. 즐겨찾기 추가/제거: 채널 항목의 별표 버튼을 클릭해 추가/제거합니다.
5. 즐겨찾기 파일 저장/불러오기: 채널 화면의 `파일에 저장` 버튼으로 favorites.json을 저장하고, `파일에서 불러오기` 버튼으로 다시 불러옵니다.

문제가 있거나 추가 개선(그룹 폴더 트리, 원격 동기화 등)을 원하시면 알려주세요.
