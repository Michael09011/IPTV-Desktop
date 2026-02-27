#!/usr/bin/env python3
"""
Windows용 .ico 아이콘 생성 스크립트
기본 색상의 IPTV-Desktop 로고 생성
"""

from PIL import Image, ImageDraw
import os
import math

def create_icon():
    """macOS 스타일 아이콘 생성: 테두리 바깥은 투명, 둥근 사각형 컨테이너"""
    build_dir = 'build'
    icon_path = os.path.join(build_dir, 'icon.ico')
    
    # Windows용 아이콘 크기들
    sizes = [(256, 256), (128, 128), (96, 96), (64, 64), (48, 48), (32, 32), (16, 16)]
    
    # *** macOS 스타일: 테두리 바깥은 투명 ***
    base_img = Image.new('RGBA', (256, 256), (0, 0, 0, 0))  # 완전 투명
    draw = ImageDraw.Draw(base_img)
    
    # 둥근 사각형 컨테이너 (어두운 검정색 배경)
    container_color = (25, 25, 25, 220)  # 약간 투명한 검은색
    draw.rounded_rectangle([20, 20, 236, 236], radius=40, fill=container_color, outline=None)
    
    # 내부 디스플레이 영역 (어두운 회색으로 스크린 효과)
    draw.rounded_rectangle([35, 35, 221, 221], radius=35, fill=(40, 40, 40, 255))
    
    # TV 모니터 프레임 (흰색 테두리)
    draw.rounded_rectangle([50, 60, 206, 180], radius=15, fill=None, outline=(220, 220, 220, 255), width=3)
    
    # 스크린 내부 (약간 밝은 어두운 회색)
    draw.rounded_rectangle([55, 65, 201, 175], radius=12, fill=(60, 60, 60, 255))
    
    # 재생 버튼 (▶ 심볼) - 중앙에 흰색 삼각형
    triangle_x, triangle_y = 128, 115
    radius = 30
    
    # 3개 꼭짓점: 오른쪽 -> 왼쪽 아래 -> 왼쪽 위
    p1 = (triangle_x + radius, triangle_y)  # 오른쪽
    p2 = (triangle_x - radius/2, triangle_y + radius * math.sqrt(3)/2)  # 아래 왼쪽
    p3 = (triangle_x - radius/2, triangle_y - radius * math.sqrt(3)/2)  # 위 왼쪽
    
    draw.polygon([p1, p2, p3], fill=(255, 255, 255, 255))
    
    # 스탠드 (아래쪽 검은 막대)
    draw.rectangle([95, 180, 161, 195], fill=(60, 60, 60, 255))
    draw.rectangle([105, 195, 151, 205], fill=(40, 40, 40, 255))
    
    # 아이콘 저장
    # 모든 크기의 아이콘을 하나의 .ico 파일로 저장
    icon_imgs = []
    for size in sizes:
        resized = base_img.resize(size, Image.Resampling.LANCZOS)
        icon_imgs.append(resized)
    
    # Windows ICO 생성
    icon_imgs[0].save(
        icon_path,
        format='ICO',
        sizes=sizes,
        append_images=icon_imgs[1:] if len(icon_imgs) > 1 else []
    )
    print(f"✓ Windows 아이콘 생성 완료: {icon_path}")
    print(f"  크기: {', '.join([f'{s[0]}x{s[1]}' for s in sizes])}")

    # PNG 원본 저장
    png_path = os.path.join(build_dir, 'icon.png')
    base_img.save(png_path)
    print(f"✓ PNG 원본 생성: {png_path}")

    # macOS 아이콘: iconset 폴더 및 icns
    try:
        iconset_dir = os.path.join(build_dir, 'icon.iconset')
        os.makedirs(iconset_dir, exist_ok=True)
        # 필요한 크기 목록 (including @2x)
        mac_sizes = [16, 32, 64, 128, 256, 512, 1024]
        for s in mac_sizes:
            img = base_img.resize((s, s), Image.Resampling.LANCZOS)
            img.save(os.path.join(iconset_dir, f"icon_{s}x{s}.png"))
            img.save(os.path.join(iconset_dir, f"icon_{s}x{s}@2x.png"))
        print(f"✓ icon.iconset 폴더 생성: {iconset_dir}")
        # attempt to run iconutil if available
        try:
            import subprocess
            icns_path = os.path.join(build_dir, 'icon.icns')
            subprocess.run(['iconutil', '-c', 'icns', iconset_dir, '-o', icns_path], check=True)
            print(f"✓ macOS 아이콘(ICNS) 생성 via iconutil: {icns_path}")
        except Exception:
            # fallback to Pillow icns
            icns_path = os.path.join(build_dir, 'icon.icns')
            icns_img = base_img.resize((1024, 1024), Image.Resampling.LANCZOS)
            icns_img.save(icns_path, format='ICNS')
            print(f"✓ macOS 아이콘(ICNS) 생성 (Pillow fallback): {icns_path}")
            print("⚠ iconutil이 없거나 실패했습니다. 맥에서 iconutil을 사용하여 다시 변환하십시오.")
    except Exception as e:
        print(f"⚠ macOS 아이콘 세트 생성 실패: {e}")
        print("   iconset 폴더를 수동 생성하고 iconutil을 사용하세요.")


if __name__ == '__main__':
    create_icon()
