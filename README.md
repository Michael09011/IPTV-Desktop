# IPTV-Desktop

간단한 설명
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
# IPTV Desktop

Electron 기반 IPTV 데스크톱 플레이어입니다. 로컬 또는 URL로부터 JSON/M3U/M3U8 플레이리스트를 로드하여 채널 목록을 표시하고, 선택한 스트림을 재생합니다.

## 주요 기능

- **다중 플레이리스트 지원**: URL 또는 로컬 파일에서 플레이리스트 추가 가능
- **채널 검색 및 그룹별 분류**: 채널 이름, 그룹으로 빠르게 검색 가능
- **HLS 재생**: HLS.js를 이용한 안정적인 HLS 스트림 재생
- **자동 재시도**: 재생 실패 시 무한 재시도 (사용자가 다른 채널 선택할 때까지 현재 채널 유지)
- **EPG(Electronic Program Guide) 지원**: 채널별 현재 방송 정보 표시
- **즐겨찾기**: 자주 보는 채널 별표로 표시
- **플레이리스트 편집**: 플레이리스트 이름, URL 수정 및 드래그-드롭으로 순서 변경
- **자동 백업**: 플레이리스트 자동 백업 스케줄 설정 가능
- **인증 지원**: 인증이 필요한 스트림에 커스텀 HTTP 헤더 설정 가능
- **다크 테마 UI**: 현대적이고 깔끔한 다크 테마 인터페이스

## 빠른 시작

### 개발 모드

```bash
# 종속성 설치
npm install

# 앱 실행
npm start
```

### 빌드 (macOS)

```bash
npm run dist
```

생성된 DMG 파일은 `dist/IPTV-Desktop-0.1.0.dmg`에서 찾을 수 있습니다.

## 플레이리스트 추가

1. 주소 불러오기: URL을 입력하여 원격 플레이리스트 로드
2. 로컬 파일: 저장된 플레이리스트에서 선택하여 채널 표시

## EPG 설정

EPG URL을 설정하여 채널별 현재 프로그램 정보를 표시합니다.

```javascript
// 개발자 도구에서 실행
localStorage.setItem('epgUrl', 'https://example.com/epg.xml');
```

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
- Node.js 18+

## 저작권

© 2026 Michael. All rights reserved.
