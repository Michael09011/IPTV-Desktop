#!/usr/bin/env python3
"""
Windows용 .ico 아이콘 생성 스크립트
기본 색상의 IPTV-Desktop 로고 생성
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_icon():
    """Windows용 아이콘 생성"""
    build_dir = 'build'
    icon_path = os.path.join(build_dir, 'icon.ico')
    
    # 생성할 아이콘 크기들
    sizes = [(256, 256), (128, 128), (96, 96), (64, 64), (48, 48), (32, 32), (16, 16)]
    
    # 이미지 생성
    base_img = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(base_img)
    
    # 배경 (파란색 그라디언트 효과)
    for y in range(256):
        # 파란색 그라디언트
        blue_val = int(50 + (y / 256) * 100)
        color = (30, 60, blue_val, 255)
        draw.line([(0, y), (256, y)], fill=color)
    
    # 원형 배경
    draw.ellipse([20, 20, 236, 236], fill=(70, 130, 180, 255), outline=(255, 255, 255, 255), width=4)
    
    # TV 모니터 모양 그리기
    # 화면
    draw.rectangle([50, 50, 206, 180], fill=(0, 0, 0, 255), outline=(255, 255, 255, 255), width=3)
    # 화면 내부 (파란색)
    draw.rectangle([55, 55, 201, 175], fill=(100, 150, 200, 255))
    # 스탠드
    draw.rectangle([90, 185, 166, 205], fill=(100, 100, 100, 255))
    draw.rectangle([100, 205, 156, 215], fill=(80, 80, 80, 255))
    
    # 텍스트 "IPTV" 그리기
    try:
        # 기본 폰트 사용
        font = ImageFont.load_default()
        text = "IPTV"
        # 중앙 정렬
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        x = (256 - text_width) // 2
        y = 100 - text_height // 2
        draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)
    except:
        # 폰트 사용 불가능한 경우 스킵
        pass
    
    # 아이콘 저장
    # 모든 크기의 아이콘을 하나의 .ico 파일로 저장
    icon_imgs = []
    for size in sizes:
        resized = base_img.resize(size, Image.Resampling.LANCZOS)
        icon_imgs.append(resized)
    
    # 첫 번째 이미지를 저장하고 나머지는 append_images로 추가
    icon_imgs[0].save(
        icon_path,
        format='ICO',
        sizes=sizes,
        append_images=icon_imgs[1:] if len(icon_imgs) > 1 else []
    )
    
    print(f"✓ Windows 아이콘 생성 완료: {icon_path}")
    print(f"  크기: {', '.join([f'{s[0]}x{s[1]}' for s in sizes])}")

if __name__ == '__main__':
    create_icon()
