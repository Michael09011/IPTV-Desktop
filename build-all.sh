#!/bin/bash

# 크로스 플랫폼 빌드 스크립트

echo ""
echo "========================================="
echo "   IPTV-Desktop 크로스 플랫폼 빌드"
echo "========================================="
echo ""

# 의존성 확인
echo "[1/3] 의존성 확인 중..."
if [ ! -d "node_modules" ]; then
    echo "npm install 실행 중..."
    npm install
else
    echo "✓ 의존성 이미 설치됨"
fi

echo ""
echo "[2/3] 아이콘 확인 중..."
if [ ! -f "build/icon.ico" ]; then
    echo "⚠ warning: build/icon.ico 파일을 찾을 수 없습니다"
    echo ""
    echo "Windows 아이콘 생성 방법:"
    echo "  1. PNG 이미지를 준비합니다 (256x256 권장)"
    echo "  2. https://icoconvert.com/ 에서 .ico로 변환"
    echo "  3. build/icon.ico 파일로 저장"
    echo ""
fi

if [ ! -f "build/icon.icns" ]; then
    echo "⚠ warning: build/icon.icns 파일을 찾을 수 없습니다"
    echo ""
    echo "Mac 아이콘 생성 방법:"
    echo "  Mac에서: python3 create-macos-icon.py"
    echo ""
fi

echo "[3/3] 모든 플랫폼 빌드 중..."
echo ""
npm run dist:all

echo ""
echo "========================================="
if [ $? -eq 0 ]; then
    echo "✓ 빌드 완료!"
    echo ""
    echo "결과 파일: dist/ 디렉토리 확인"
    echo ""
    if command -v open &> /dev/null; then
        open dist/
    elif command -v xdg-open &> /dev/null; then
        xdg-open dist/
    fi
else
    echo "✗ 빌드 실패"
    echo ""
fi
echo "========================================="
echo ""
