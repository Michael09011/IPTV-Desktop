# Vidlync 앱 v0.1.3 - 크로스 플랫폼 (Mac OS, Win OS)

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://shields.io/)
[![Platform](https://img.shields.io/badge/platform-macOS%20|%20Windows-blue.svg)](https://github.com)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-18%2B-brightgreen.svg)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/electron-26.0.0-9feaf9.svg)](https://www.electronjs.org/)
[![VS Code](https://img.shields.io/badge/VS%20Code-007ACC?style=flat-square&logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com/)
[![GitHub Copilot](https://img.shields.io/badge/GitHub%20Copilot-000000?style=flat-square&logo=github&logoColor=white)](https://github.com/features/copilot)
[![MPV Support](https://img.shields.io/badge/mpv-player-important.svg)](https://mpv.io/)
[![Release](https://img.shields.io/badge/release-download-brightgreen.svg)](https://github.com/Michael09011/Vidlync/releases/tag/Vidlync)
[![Mobile App](https://img.shields.io/badge/Mobile%20App-View%20on%20GitHub-blue)](https://github.com/Michael09011/IPTV-Mobile-APP)
[![Korean](https://img.shields.io/badge/Korean-README-blue)](README.ko.md)
[![Japanese](https://img.shields.io/badge/Japanese-README-blue)](README.ja.md)

<p align="center">
  <img width="200" height="200" alt="Vidlync App Icon" src="build/icon.png" />
</p>

Electron 기반 Vidlync 데스크톱 앱 (재생목록 로드, 채널 재생, MPV/VLC 플레이어 지원, EPG, 자동 백업, 일본 방송 지원 등).

## 🏗️ 기술 스택

### 🖥️ 프론트엔드
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Electron](https://img.shields.io/badge/Electron-191970?style=flat-square&logo=electron&logoColor=white)

- **Renderer Process**: HTML5 + CSS3 + Vanilla JavaScript
- **HLS.js**: HLS/M3U8 스트림 재생
- **Shaka Player**: DASH 및 SmoothStreaming 지원
- **Video.js**: 비디오 플레이어 프레임워크
- **MPV Adapter**: JSON-IPC 제어 mpv 플레이어 지원 (RTMP, MPEG-TS 등)
- **UI Framework**: Electron Renderer Process
- **위치**: `app/` 디렉토리

### ⚙️ 백엔드
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)
![Electron](https://img.shields.io/badge/Electron%20Main-191970?style=flat-square&logo=electron&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)

- **Main Process**: Node.js + Electron Main Process
- **API**: Preload Scripts & IPC Communication
- **mpv Integration**: 외부 mpv 프로세스 제어 (JSON-IPC 소켓)
- **위치**: `src/` 디렉토리

## 📺 플레이어 지원

### 내장 플레이어
- **HLS.js**: M3U8, HLS 스트림 (기본값)
- **Shaka Player**: DASH, SmoothStreaming
- **Video.js**: 일반 비디오 플레이어
- **Native HTML5 Video**: MP4, WebM, Ogg

### MPV 플레이어 (새로운 기능!)

- **외부 프로세스 실행**: MPV 플레이어가 별도의 외부 프로세스로 실행됩니다.
- **JSON-IPC 제어**: Electron 메인 프로세스에서 JSON-IPC 소켓을 통해 제어됩니다.
- **다중 형식 지원**: RTMP, MPEG-TS, HLS, DASH 및 다양한 스트림 형식 지원.
- **고성능 재생**: 하드웨어 가속 및 고급 비디오 필터링.
- **설정**: 외부 플레이어 경로 지정 가능하며, 자동 기본 경로 감지 지원.

## 🎨 앱 아이콘

자세한 내용은 [빌드 가이드](BUILD_GUIDE.md#-앱-아이콘-생성)를 참조하세요.

## 📥 다운로드

최신 버전을 다운로드하세요:

🔗 **[릴리스 페이지로 이동](https://github.com/Michael09011/Vidlync/releases/tag/Vidlync)**

- 🍎 **macOS**: DMG 파일
- 🪟 **Windows**: NSIS 설치 프로그램

## 🚀 빠른 시작

1. **의존성 설치**
   ```bash
   npm install
   ```
2. **개발 모드로 실행**
   ```bash
   npm start
   ```

빌드, 배포 및 상세 설정 가이드는 [빌드 가이드](BUILD_GUIDE.md)를 참조하세요.

## ⚠️ 중요한 동작 / 참고사항

- **첫 실행 시 재생목록 초기화**
  - 패키지된 (번들된) 앱은 첫 실행 시 기존 `playlists.json`을 빈 배열로 초기화합니다.
  - 초기화는 한 번만 일어나며, 사용자 데이터 폴더에 `playlists_cleared_v1` (센티널) 파일을 생성하여 재초기화를 방지합니다.
  - 개발 중에 초기화를 다시 확인하려면 앱의 `userData` 폴더에서 센티널 파일을 삭제하세요.

- **사이드바 토글**
  - 왼쪽 상단의 고정된 토글 버튼 (◀/▶). 클릭하면 사이드바 확장/축소를 전환합니다.
  - 토글은 비디오 재생을 방해하지 않으면서 레이아웃을 직접 업데이트합니다.

- **코드 서명 / 공증**
  - 현재 빌드는 코드 서명되어 있지 않습니다. 배포 (App Store 외 포함)를 위해 Apple Developer 계정의 Developer ID 인증서로 서명하고 공증하세요.
  - 자세한 내용은 [빌드 가이드](BUILD_GUIDE.md#-코드-서명-및-공증)를 참조하세요.

## 📂 프로젝트 구조

- **프론트엔드**: `app/` (HTML, CSS, Vanilla JavaScript)
- **백엔드**: `src/` (Main Process, Preload Scripts)
- **빌드 출력**: `dist/` (`.dmg`, `.exe` 등)
- **리소스**: `assets/`, `build/` (아이콘 등)

## 🔐 스트림용 인증

HTTP 헤더를 특정 URL 패턴에 추가할 수 있습니다.

```javascript
// Authorization 헤더 추가
window.electronAPI.authSet({
  pattern: 'example.com',
  useRegex: false,
  headers: { Authorization: 'Bearer TOKEN' }
});

// 구성된 인증 나열
window.electronAPI.authList().then(console.log);
```

## 💻 시스템 요구사항

- **macOS**: 10.13+
- **Windows**: Windows 7+
- **Node.js**: 18.0.0+
- **디스크 공간**: 최소 200MB

## ⭐ 즐겨찾기 기능 사용법

- **즐겨찾기에 추가**: 채널 목록의 별 (☆) 버튼을 클릭하여 즐겨찾기에 추가합니다. 추가된 항목은 채워진 별 (★)로 표시됩니다.
- **즐겨찾기 관리**: 왼쪽 사이드바의 `즐겨찾기 (N)` 버튼을 클릭하여 즐겨찾기 관리 모달을 엽니다. 이름/그룹을 편집하거나 항목을 재생/삭제할 수 있습니다.
- **검색/필터**: 채널 화면의 검색창에 여러 토큰을 입력하여 이름/그룹/TVG/URL에 모든 토큰을 포함하는 항목을 필터링합니다. `즐겨찾기만` 확인하여 즐겨찾기로 필터링합니다.
- **EPG 기능**: 각 채널의 현재 방송 정보를 표시합니다. 설정에서 활성화/비활성화할 수 있으며, 재생목록별로 EPG URL을 지정할 수 있습니다.
- **자동 새로고침**: M3U 및 EPG 데이터를 6/12/24시간마다 자동 새로고침하도록 설정합니다. 새로고침 시 토스트 알림 표시.
- **내보내기/가져오기**: 즐겨찾기 목록을 JSON으로 내보내기/가져오기 (브라우저 다운로드).
- **파일 동기화**: 시스템 파일에 저장/로드 추가. `파일에 저장` / `파일에서 로드` 버튼을 사용하여 로컬 파일에 직접 저장/로드합니다.

## 🧪 간단한 테스트

1. **앱 실행**:
   ```bash
   npm start
   ```
2. **재생목록 로드**: 왼쪽 상단의 `로드`를 클릭하여 m3u 파일 또는 URL을 로드합니다.
3. **채널 화면 진입**: 재생목록의 `채널 보기`를 클릭합니다.
4. **즐겨찾기 추가/제거**: 채널 항목의 별 버튼을 클릭하여 추가/제거합니다.
5. **즐겨찾기 파일 저장/로드**: `파일에 저장` 버튼을 사용하여 favorites.json을 저장하고, `파일에서 로드`를 사용하여 다시 로드합니다.

## 📱 Windows MPV 설치 및 사용 가이드

Windows에서 MPV 플레이어를 사용하려면 다음 단계를 따르세요.

1. MPV 설치
   - Chocolatey 사용:
     - 관리자 PowerShell에서 `choco install mpv` 실행
   - Scoop 사용:
     - `scoop install mpv`
   - 또는 https://mpv.io/에서 Windows 빌드를 다운로드하고 압축 해제
2. MPV 경로 확인
   - `mpv.exe` 위치 복사.
   - 예: `C:\Program Files\mpv\mpv.exe`
3. Vidlync에서 구성
   - 설정 버튼 클릭
   - "외부 플레이어 사용" 활성화
   - 외부 플레이어 경로로 `mpv.exe` 경로 입력
4. MPV 재생 테스트
   - 재생목록에서 채널을 선택하고 재생
   - 문제가 있으면 경로와 권한을 다시 확인하세요

추가 팁:
- `mpv.conf`를 사용하여 버퍼, 캐시, 자막 등을 조정합니다.
- Windows에서 UAC 권한 문제가 있으면 관리자 권한으로 실행하세요.

---

## 📝 라이선스

© 2026 Michael. 모든 권리 보유.

MIT License - 자세한 내용은 LICENSE 파일을 참조하세요

---

문제가 있거나 추가 개선 사항이 필요한 경우 (그룹 폴더 트리, 원격 동기화 등) 이슈를 열어주세요.
