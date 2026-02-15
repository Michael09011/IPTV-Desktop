# Windows 빌드 가이드

## 준비 사항

### 1. 필수 파일 확인
Windows 빌드를 위해서는 `build/icon.ico` 파일이 필요합니다.

#### 아이콘 생성 방법

**방법 1: PNG에서 변환 (추천)**
- 256x256 PNG 이미지를 준비합니다
- 온라인 변환 도구 사용: https://icoconvert.com/
- 변환된 `.ico` 파일을 `build/icon.ico`에 저장합니다

**방법 2: ImageMagick 사용**
```bash
# ImageMagick 설치 (Windows)
# https://imagemagick.org/script/download.php

# 변환 명령
convert app.png -define icon:auto-resize=256,128,96,64,48,32,16 build/icon.ico
```

**방법 3: Python + Pillow**
```bash
pip install Pillow

python -c "
from PIL import Image
img = Image.open('icon.png')
img.save('build/icon.ico', sizes=[(256, 256), (128, 128), (96, 96), (64, 64), (48, 48), (32, 32), (16, 16)])
"
```

### 2. 의존성 설치
```bash
npm install
```

## 빌드 명령

### Windows만 빌드
```bash
npm run dist:win
```

### Mac만 빌드
```bash
npm run dist:mac
```

### 모든 플랫폼 빌드
```bash
npm run dist:all
```

### 전체 빌드 (기본 모드)
```bash
npm run dist
```

## 빌드 결과

빌드 완료 후 `dist/` 디렉토리에서 다음 파일들을 확인할 수 있습니다:

### Windows
- `IPTV-Desktop Setup 0.1.0.exe` - NSIS 설치 프로그램
- `IPTV-Desktop-Portable.exe` - 포터블 실행 파일
- `IPTV-Desktop 0.1.0.exe` - 독립형 실행 파일

## 설정 설명

### NSIS 설치 프로그램
- 한 번의 클릭으로 설치하지 않음 (사용자 정의 설치 가능)
- 설치 경로 변경 가능
- 바탕화면 바로가기 생성
- 시작 메뉴 항목 생성

### 포터블 버전
- 설치 불필요
- USB 등에서 직접 실행 가능

## 문제 해결

### "icon.ico not found" 오류
- `build/icon.ico` 파일이 없는 경우 발생
- 위의 "아이콘 생성 방법"을 참고하여 아이콘 생성

### 빌드 실패
1. Node.js 최신 LTS 버전 확인
2. `npm install` 다시 실행
3. `node_modules` 삭제 후 재설치:
   ```bash
   rm -r node_modules package-lock.json
   npm install
   ```

## 추가 정보

- [Electron Builder 문서](https://www.electron.build/)
- [NSIS 설정](https://www.electron.build/configuration/nsis)
