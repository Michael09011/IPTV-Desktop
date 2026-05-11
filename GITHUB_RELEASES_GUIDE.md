# GitHub Releases에 빌드 결과물 업로드하기

## 📦 크기 제한 문제 해결

### ✅ 이미 적용된 해결책

1. **`.gitignore` 설정 완료**
   - `dist/` 폴더 제외
   - `node_modules/` 제외
   - `*.exe` 파일 제외
   - 소스 코드만 약 2-3 MB로 GitHub에 업로드 가능

2. **깃허브에 성공적으로 푸시됨**
   - 크로스 플랫폼 빌드 설정 파일 업로드
   - 빌드 가이드 문서 업로드

### 📤 GitHub Releases에 빌드 결과물 배포

큰 파일(exe, dmg)은 **GitHub Releases**에서 배포하는 것이 권장됩니다.

#### 방법 1: GitHub 웹 인터페이스 사용 (가장 간단)

1. **GitHub 저장소로 이동**
   ```
   https://github.com/YOUR_USERNAME/Vidlync
   ```

2. **Releases 탭 클릭**
   - 오른쪽 사이드바에서 "Releases" 클릭

3. **"Create a new release" 클릭**

4. **릴리스 정보 입력**
   - Tag: `v0.1.0`
   - Title: `Vidlync v0.1.0 - Windows/Mac 지원`
   - Description:
     ```
     # Vidlync v0.1.0

     ## 새로운 기능
     - ✅ Windows 크로스 플랫폼 빌드
     - ✅ Mac (DMG) 빌드
     - ✅ 포터블 exe 지원 (설치 불필요)

     ## 다운로드
     - Windows: Vidlync-Portable.exe
     - Mac: Vidlync-0.1.0.dmg (필요시)

     ## 설치 방법
     다운로드 후 직접 실행하면 됩니다.
     ```

5. **파일 업로드**
   - "Attach binaries by dropping them here or selecting them"
   - 다음 파일 선택:
     - `dist/Vidlync-Portable.exe`
     - (Mac 빌드 있으면) `dist/Vidlync-0.1.0.dmg`

6. **"Publish release" 클릭**

#### 방법 2: 명령어 사용 (GitHub CLI)

```bash
# GitHub CLI 설치 (https://cli.github.com/)
# 이미 설치된 경우:

# 로그인
gh auth login

# 릴리스 생성
gh release create v0.1.0 \
  --title "Vidlync v0.1.0" \
  --notes "Windows 크로스 플랫폼 빌드 지원" \
  dist/Vidlync-Portable.exe
```

#### 방법 3: 자동 배포 설정 (GitHub Actions)

추후 빌드할 때마다 자동으로 Releases에 업로드되도록 설정 가능합니다.

## 📊 저장소 크기 현황

### 이전 (빌드 결과물 포함)
- `dist/`: ~65 MB ❌ 제외됨
- `node_modules/`: ~600 MB ❌ 제외됨

### 현재 (최적화됨)
- 소스 코드: ~2-3 MB ✅
- 설정 파일: ~1 MB ✅
- 총합: ~5 MB 이하 ✅

## 🔍 확인 방법

GitHub에서 저장소 크기 확인:
1. 저장소 → Settings → About
2. "Size" 항목에서 전체 크기 확인

또는 터미널에서:
```bash
git count-objects -vH
```

## ⚠️ 이미 큰 파일이 커밋된 경우

만약 이전에 dist 폴더가 커밋되었다면:

```bash
# git history에서 제거 (원격 저장소는 별도 처리 필요)
git filter-branch --tree-filter 'rm -rf dist' HEAD

# 또는 git-filter-repo 사용 (권장)
git install-filter-repo  # 설치 필요
git filter-repo --invert-paths --path dist --path node_modules
```

## 📚 참고 자료

- [GitHub Releases 공식 문서](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [GitHub Actions로 자동 배포](https://docs.github.com/en/actions)
- [git-lfs (Large File Storage)](https://git-lfs.github.com/)

---

**정리 완료!** 이제 GitHub에 최적화된 소스 코드 저장소와 Releases로 배포되는 빌드 결과물 구조가 완성되었습니다.
