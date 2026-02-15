@echo off
REM Windows 빌드 스크립트

echo.
echo =========================================
echo   IPTV-Desktop Windows 빌드
echo =========================================
echo.

REM 의존성 확인
echo [1/3] 의존성 확인 중...
if not exist node_modules (
    echo npm install 실행 중...
    call npm install
) else (
    echo ✓ 의존성 이미 설치됨
)

echo.
echo [2/3] 아이콘 확인 중...
if not exist build\icon.ico (
    echo ⚠ warning: build\icon.ico 파일을 찾을 수 없습니다
    echo.
    echo 아이콘 생성 방법:
    echo   1. PNG 이미지를 준비합니다 (256x256 권장)
    echo   2. https://icoconvert.com/ 에서 .ico로 변환
    echo   3. build\icon.ico 파일로 저장
    echo.
    echo BUILD_WINDOWS.md 파일을 참고하세요.
    echo.
)

echo [3/3] Windows 빌드 중...
echo.
call npm run dist:win

echo.
echo =========================================
if %ERRORLEVEL% EQU 0 (
    echo ✓ 빌드 완료!
    echo.
    echo 결과 파일: dist\ 디렉토리 확인
    echo.
    start dist\
) else (
    echo ✗ 빌드 실패
    echo.
)
echo =========================================
echo.
pause
