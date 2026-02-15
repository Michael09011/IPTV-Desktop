# 크로스 플랫폼 Windows 빌드 설정 완료

## 📦 설정된 내용

### 1. package.json 업데이트
- ✅ Windows (NSIS + Portable) 빌드 설정 추가
- ✅ Mac (DMG) 빌드 설정 유지
- ✅ 빌드 스크립트 추가:
  - `npm run dist:win` - Windows만 빌드
  - `npm run dist:mac` - Mac만 빌드
  - `npm run dist:all` - 모든 플랫폼 빌드
  - `npm run dist` - 모든 플랫폼 빌드 (기본)

### 2. Windows 빌드 구성

#### NSIS 설치 프로그램
```
IPTV-Desktop Setup 0.1.0.exe
```
- 사용자 정의 설치 경로 선택 가능
- 바탕화면 바로가기 자동 생성
- 시작 메뉴 항목 자동 생성

#### 포터블 실행 파일
```
IPTV-Desktop-Portable.exe
```
- 설치 불필요
- USB에서 직접 실행 가능

### 3. 생성된 파일

- **BUILD_WINDOWS.md** - Windows 빌드 상세 가이드
- **build-windows.bat** - Windows 빌드 자동화 스크립트 (더블클릭으로 실행)
- **build-all.sh** - Mac/Linux 크로스 플랫폼 빌드 스크립트
- **create-windows-icon.js** - 아이콘 생성 안내 스크립트

## 🚀 빌드 시작하기

### 필수 단계: 아이콘 준비

Windows 빌드를 위해 `build/icon.ico` 파일이 필요합니다.

**방법 1: 온라인 도구 (가장 간단)**
1. PNG 이미지 준비 (256x256 권장)
2. https://icoconvert.com/ 접속
3. PNG 파일 업로드 후 .ico로 변환
4. `build/icon.ico`로 저장

**방법 2: ImageMagick 사용**
```bash
# 설치: https://imagemagick.org/script/download.php
convert icon.png -define icon:auto-resize=256,128,96,64,48,32,16 build/icon.ico
```

**방법 3: Python 사용**
```bash
pip install Pillow

python -c "
from PIL import Image
img = Image.open('icon.png')
img.save('build/icon.ico')
"
```

### Windows에서 빌드

**방법 1: 배치 스크립트 사용 (추천)**
```bash
build-windows.bat
```

**방법 2: npm 명령어**
```bash
npm install                # 의존성 설치
npm run dist:win          # Windows 빌드
```

## 📂 빌드 결과

빌드 완료 후 `dist/` 디렉토리에서 확인:

```
dist/
├── IPTV-Desktop Setup 0.1.0.exe      (NSIS 설치 프로그램)
├── IPTV-Desktop-Portable.exe         (포터블 버전)
└── IPTV-Desktop 0.1.0.exe           (독립형 실행 파일)
```

## 📋 플랫폼별 빌드 명령

| 플랫폼 | 명령어 | 설명 |
|--------|--------|------|
| Windows | `npm run dist:win` | Windows NSIS + Portable |
| Mac | `npm run dist:mac` | Mac DMG |
| 모두 | `npm run dist:all` | Windows + Mac |
| 기본 | `npm run dist` | 모든 플랫폼 |

## ⚙️ Windows 빌드 설정 상세

**package.json의 win 설정:**
```json
"win": {
  "target": ["nsis", "portable"],
  "icon": "build/icon.ico"
},
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "shortcutName": "IPTV-Desktop"
}
```

**특징:**
- ✅ NSIS 설치 프로그램
- ✅ 포터블 버전
- ✅ 설치 경로 사용자 선택
- ✅ 바탕화면 바로가기 자동 생성
- ✅ 시작 메뉴 항목 자동 생성

## 🔧 문제 해결

### "icon.ico not found" 오류
→ `build/icon.ico` 파일 생성 필요 (위의 "아이콘 준비" 참고)

### 빌드 실패
1. Node.js 버전 확인: `node -v` (14.0 이상 필요)
2. 의존성 재설치:
   ```bash
   rm -r node_modules package-lock.json
   npm install
   ```
3. 빌드 재시도: `npm run dist:win`

## 📚 참고 자료

- [Electron Builder 공식 문서](https://www.electron.build/)
- [NSIS 설정 가이드](https://www.electron.build/configuration/nsis)
- [Electron 공식 가이드](https://www.electronjs.org/docs)

## ✨ 다음 단계 (선택사항)

### Windows 서명 (자동 업데이트 등 필요 시)
```json
"win": {
  "certificateFile": "path/to/certificate.pfx",
  "certificatePassword": "your-password",
  "signingHashAlgorithms": ["sha256"]
}
```

### 자동 업데이트 설정
- electron-updater 설치 필요
- GitHub Releases 활용

---

**설정 완료!** 아이콘을 준비하고 `build-windows.bat`을 실행하면 됩니다.
