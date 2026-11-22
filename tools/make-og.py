# -*- coding: utf-8 -*-
"""Render the Open Graph card (1200x630) for the public build."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

W, H = 1200, 630
img = Image.new("RGB", (W, H), "#0b1020")
d = ImageDraw.Draw(img, "RGBA")

# vertical base gradient
for y in range(H):
    k = y / H
    r = int(11 * (1 - k) + 5 * k)
    g = int(16 * (1 - k) + 7 * k)
    b = int(32 * (1 - k) + 14 * k)
    d.line([(0, y), (W, y)], fill=(r, g, b))

# glowing orbs
glow = Image.new("RGB", (W, H), (0, 0, 0))
gd = ImageDraw.Draw(glow)
for cx, cy, rad, col in [
    (150, 60, 460, (56, 132, 255)),
    (1080, 210, 400, (139, 92, 246)),
    (110, 560, 380, (14, 165, 233)),
    (1010, 600, 320, (236, 72, 153)),
]:
    gd.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=col)
glow = glow.filter(ImageFilter.GaussianBlur(150))
img = Image.blend(img, Image.blend(img, glow, 0.55), 0.85)
d = ImageDraw.Draw(img, "RGBA")

F = "C:/Windows/Fonts/msyhbd.ttc"
FL = "C:/Windows/Fonts/msyh.ttc"
f_title = ImageFont.truetype(F, 86)
f_sub = ImageFont.truetype(FL, 34)
f_meta = ImageFont.truetype(FL, 26)
f_brand = ImageFont.truetype(F, 38)

PAD = 84

# brand mark: a small trail curve
d.line([(PAD, 118), (PAD + 18, 96), (PAD + 36, 118), (PAD + 54, 96)],
       fill=(230, 240, 255, 230), width=7, joint="curve")
d.ellipse([PAD - 6, 112, PAD + 6, 124], fill="#ffffff")
d.text((PAD + 76, 74), "LifeTrack", font=f_brand, fill=(255, 255, 255, 240))

# headline
d.text((PAD, 210), "把散落的数据，", font=f_title, fill=(255, 255, 255, 255))
d.text((PAD, 312), "拼成你的生活画像", font=f_title, fill=(200, 215, 255, 255))

d.text((PAD, 452), "全记录汇总 · 步履轨迹 · 耳机听觉档案 · 热力刻度", font=f_sub, fill=(210, 220, 245, 210))
d.text((PAD, 512), "Apple 健康数据，全程在本机浏览器解析", font=f_meta, fill=(190, 200, 230, 170))

# bottom hairline + site
d.line([(PAD, 566), (W - PAD, 566)], fill=(255, 255, 255, 40), width=1)
d.text((PAD, 582), "lifetrack", font=f_meta, fill=(200, 210, 240, 150))

img.save("og.png", "PNG", optimize=True)
print("og.png", os.path.getsize("og.png"), "bytes")
