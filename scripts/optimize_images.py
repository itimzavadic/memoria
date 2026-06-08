#!/usr/bin/env python3
"""Сжатие изображений сайта: WebP + оптимизированный JPEG."""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

GALLERY_MAIN = 1400
GALLERY_THUMB = 280
COMPARE_MAX = 960
HERO_LOGO_MAX = 320
WEBP_QUALITY = 82
JPEG_QUALITY = 85


def resize(img: Image.Image, max_w: int) -> Image.Image:
    w, h = img.size
    if w <= max_w:
        return img
    nh = max(1, round(h * max_w / w))
    return img.resize((max_w, nh), Image.Resampling.LANCZOS)


def to_rgb(img: Image.Image) -> Image.Image:
    if img.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", img.size, (34, 34, 42))
        if img.mode == "P":
            img = img.convert("RGBA")
        if img.mode in ("RGBA", "LA"):
            bg.paste(img, mask=img.split()[-1])
        else:
            bg.paste(img)
        return bg
    if img.mode != "RGB":
        return img.convert("RGB")
    return img


def save_pair(img: Image.Image, dest_base: Path) -> tuple[int, int]:
    webp_path = dest_base.with_suffix(".webp")
    jpg_path = dest_base.with_suffix(".jpg")
    img.save(webp_path, "WEBP", quality=WEBP_QUALITY, method=6)
    img.save(jpg_path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return webp_path.stat().st_size, jpg_path.stat().st_size


def process_file(src: Path, max_w: int, out_base: Path | None = None) -> None:
    if not src.is_file():
        return
    out_base = out_base or src.with_suffix("")
    with Image.open(src) as im:
        im = to_rgb(resize(im, max_w))
        w_size, j_size = save_pair(im, out_base)
    print(f"  {src.name} -> {out_base.name}.webp ({w_size // 1024}K), .jpg ({j_size // 1024}K)")


def main() -> None:
    thumbs_dir = ROOT / "gallery" / "thumbs"
    thumbs_dir.mkdir(exist_ok=True)

    print("Gallery (main):")
    for pattern in ("*.JPG", "*.jpg", "*.PNG", "*.png"):
        for path in sorted((ROOT / "gallery").glob(pattern)):
            if path.parent.name == "thumbs":
                continue
            process_file(path, GALLERY_MAIN)
            process_file(path, GALLERY_THUMB, thumbs_dir / path.stem)

    print("Compare (content, webp sidecar only — JPG не перезаписываем):")
    compare_names = (
        "1.jpg", "1.1.jpg", "2.jpg", "2.2.jpg",
        "3.jpg", "3.3.jpg", "4.jpg", "4.4.jpg",
    )
    for name in compare_names:
        src = ROOT / "content" / name
        if not src.is_file():
            continue
        out_base = src.with_suffix("")
        with Image.open(src) as im:
            im = to_rgb(resize(im, COMPARE_MAX))
            webp_path = out_base.with_suffix(".webp")
            im.save(webp_path, "WEBP", quality=WEBP_QUALITY, method=6)
            print(f"  {name} -> {webp_path.name} ({webp_path.stat().st_size // 1024}K)")

    print("Hero logo bg:")
    hero = ROOT / "content" / "favicon gold.png"
    if hero.is_file():
        process_file(hero, HERO_LOGO_MAX, ROOT / "content" / "favicon-gold-hero")

    print("Done.")


if __name__ == "__main__":
    main()
