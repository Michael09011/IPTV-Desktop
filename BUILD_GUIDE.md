# Vidlync 빌드 가이드

## 🎨 앱 아이콘 생성

앱 아이콘은 `build/icon.ico` (Windows) 및 `build/icon.icns` (macOS)에서 읽혀집니다. 기본 TV 스타일 아이콘을 자동으로 생성하려면 `python generate_icon.py`를 실행하세요 (`pip install pillow` 필요).

### 수동으로 아이콘 만들기

1. PNG 형식으로 TV 실루엣을 그립니다 (1024×1024px 이상).
2. `.ico`: [icoconvert.com](https://icoconvert.com/) 또는 ImageMagick/`convert` 사용. `.icns`: macOS `iconutil` 사용.
3. 생성된 파일을 `build/`에 배치하고 커밋하면 자동으로 빌드에 포함됩니다.

> 빌드 설정은 이미 `package.json`의 `build/icon.ico` 및 `build/icon.icns`를 가리키고 있습니다.

## 🚀 개발 모드 실행

### 의존성 설치

```bash
npm install
```

### 개발 모드로 실행

```bash
npm start
```

## 📦 플랫폼별 빌드 (배포용)

### 🪟 Windows
- Installer (NSIS) + Portable
  ```bash
  npm run dist:win
  # 출력: dist/Vidlync Setup 0.1.0.exe
  #       dist/Vidlync-Portable.exe
  ```

### 🍎 macOS (빌드 도구는 macOS에서 실행해야 함)
- 기본 DMG (x64)
  ```bash
  npm run dist:mac
  # 출력: dist/Vidlync-Mac-0.1.0.dmg
  ```
- Universal (x64 + arm64)
  ```bash
  npx electron-builder --mac --x64 --arm64
  ```

### 🌍 모든 플랫폼
- macOS에서 실행하면 두 플랫폼 모두 빌드됩니다:
  ```bash
  npm run dist:all
  ```

## 🔍 빌드된 앱 실행 및 검사

- DMG 열기 (설치 프로그램 창): `open dist/Vidlync-0.1.0.dmg`
- .app 직접 실행: `open dist/Vidlync.app`
- 앱 내부 리소스 확인: `ls -la dist/Vidlync.app/Contents/Resources/app`

## 🐛 디버깅/로그

개발 중에는 `npm start`를 실행하는 터미널의 콘솔 로그와 개발자 도구 (검사)를 확인하세요.

## 🔐 코드 서명 및 공증

현재 빌드는 코드 서명되어 있지 않습니다. 배포 (App Store 외 포함)를 위해 Apple Developer 계정의 Developer ID 인증서로 서명하고 공증하세요.

자세한 내용은 [electron-builder 문서](https://www.electron.build/code-signing)를 참조하세요.
