#!/usr/bin/env node

/**
 * Windows 아이콘 생성 스크립트
 * .ico 파일이 없으면 기본 아이콘을 생성합니다
 */

const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, 'build');
const icoPath = path.join(buildDir, 'icon.ico');

// .ico 파일이 이미 존재하면 스킵
if (fs.existsSync(icoPath)) {
  console.log('✓ icon.ico가 이미 존재합니다');
  process.exit(0);
}

console.log('⚠ icon.ico 파일을 찾을 수 없습니다.');
console.log('');
console.log('아이콘 생성 방법:');
console.log('');
console.log('1. 온라인 변환 도구 사용:');
console.log('   - https://icoconvert.com/ 에서 이미지를 .ico로 변환');
console.log('');
console.log('2. ImageMagick 사용 (설치 필요):');
console.log('   convert icon.png -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico');
console.log('');
console.log('3. 임시 기본 아이콘으로 빌드 시도:');
console.log('   - build/icon.ico 파일을 수동으로 추가 후 다시 실행');
console.log('');
