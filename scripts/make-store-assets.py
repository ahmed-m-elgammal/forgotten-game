#!/usr/bin/env python3
"""Compose @capacitor/assets source set from the generated app icon.

Inputs : assets/icon-src.png (1024x1024, full-bleed paper art)
Outputs: assets/icon-only.png        1024  square icon (iOS + legacy Android)
         assets/icon-foreground.png  1024  adaptive foreground (art in safe zone)
         assets/icon-background.png  1024  adaptive background (blurred paper)
         assets/splash.png           2732  light splash (blurred paper + icon)
         assets/splash-dark.png      2732  dark splash
"""
from PIL import Image, ImageFilter, ImageEnhance

SRC = "assets/icon-src.png"
S = 1024
SP = 2732

src = Image.open(SRC).convert("RGBA")

# --- background: the paper texture, blurred into a seamless wash ---
bg = src.resize((SP, SP), Image.LANCZOS).filter(ImageFilter.GaussianBlur(90))
bg_1024 = bg.resize((S, S), Image.LANCZOS)
bg_1024.save("assets/icon-background.png")

# --- foreground: the art itself, inside the adaptive safe zone (~66%) ---
safe = int(S * 0.66)
art = src.resize((safe, safe), Image.LANCZOS)
fg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
fg.paste(art, ((S - safe) // 2, (S - safe) // 2), art)
fg.save("assets/icon-foreground.png")

# --- square icon: the full-bleed art as-is ---
src.resize((S, S), Image.LANCZOS).save("assets/icon-only.png")

# --- splash: blurred paper, icon centered, no text (title screen brands it) ---
icon_on_splash = int(SP * 0.30)  # ~820px
big = src.resize((icon_on_splash, icon_on_splash), Image.LANCZOS)
splash = bg.copy()
splash.paste(big, ((SP - icon_on_splash) // 2, (SP - icon_on_splash) // 2), big)
splash.convert("RGB").save("assets/splash.png")

dark = ImageEnhance.Brightness(splash).enhance(0.22)
dark.convert("RGB").save("assets/splash-dark.png")

# --- Play Store feature graphic: 1024x500, paper + icon + title ---
try:
    from PIL import ImageDraw, ImageFont
    FG_W, FG_H = 1024, 500
    # clean paper crop (left column of the icon — ruled lines only, no
    # figure, no clip, no smudge) stretched into the banner
    paper = src.crop((0, 60, 250, 310)).resize((FG_W, FG_H), Image.LANCZOS)
    paper = paper.filter(ImageFilter.GaussianBlur(3)).convert("RGB")
    d = ImageDraw.Draw(paper)
    icon_fg = src.resize((340, 340), Image.LANCZOS)
    paper.paste(icon_fg, (FG_W - 340 - 46, (FG_H - 340) // 2), icon_fg)
    font_path = "/usr/share/fonts/truetype/chinese/NotoSansSC-Bold.ttf"
    try:
        f_title = ImageFont.truetype(font_path, 58)
        f_tag = ImageFont.truetype(font_path, 21)
    except OSError:
        f_title = ImageFont.load_default()
        f_tag = f_title
    ink = (43, 38, 32)
    d.text((52, 148), "THE GAME THAT", font=f_title, fill=ink)
    d.text((52, 214), "FORGOT YOU.", font=f_title, fill=ink)
    d.text((54, 312), "the world forgets its rules — you decide what stays.",
           font=f_tag, fill=(87, 66, 35))
    # hand-drawn amber underline flourish
    d.line([(54, 288), (430, 292)], fill=(201, 138, 45), width=5)
    paper.save("assets/feature-graphic.png")
    print(f"feature-graphic: {paper.size}")
except Exception as e:  # fonts missing etc. — the graphic is optional
    print("feature-graphic skipped:", e)

for f in ("icon-only", "icon-foreground", "icon-background", "splash", "splash-dark"):
    im = Image.open(f"assets/{f}.png")
    print(f"{f}: {im.size} {im.mode}")
print("done")
