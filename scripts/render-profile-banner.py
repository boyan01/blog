"""Render a looping profile GIF from the site's public activity snapshot."""

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SIZE = (1000, 560)
SCALE = 2
FRAMES = 80
DURATION_MS = 100
PALETTE = ["#bfdacf", "#b5cce6", "#cdbfa5", "#91bdc4", "#bcb9d9", "#b7c5b1"]
ANCHORS = [(140, 125), (345, 85), (500, 180), (300, 265), (555, 55), (90, 270)]
OFFSETS = [(0, 0), (-45, -28), (28, -46), (63, 3), (26, 42), (-33, 53), (-73, 13), (67, 60)]


def constellations(snapshot):
    """Match the site's six busiest repos and eight latest active days per repo."""
    counts = Counter(commit["repo"] for commit in snapshot["commits"])
    days = defaultdict(Counter)
    for commit in snapshot["commits"]:
        days[commit["repo"]][commit["day"]] += 1
    result = []
    for index, repo in enumerate(sorted(counts, key=lambda name: (-counts[name], name))[:6]):
        history = sorted(days[repo])
        cx, cy = ANCHORS[index]
        points = []
        for slot, day in enumerate(history):
            if slot < len(history) - 8:
                continue
            ox, oy = OFFSETS[slot % len(OFFSETS)]
            points.append({"x": cx + ox, "y": cy + oy, "day": day, "count": days[repo][day]})
        result.append({"repo": repo, "color": PALETTE[index], "anchor": (cx, cy), "points": points})
    return result


def seed(value):
    return int.from_bytes(hashlib.sha256(value.encode()).digest()[:4], "big")


def rgba(color, alpha=255):
    return tuple(bytes.fromhex(color.removeprefix("#"))) + (int(alpha),)


def draw_text(draw, xy, text, font, color, anchor=None):
    draw.text(tuple(v * SCALE for v in xy), text, font=font, fill=color, anchor=anchor)


def background(fonts):
    size = tuple(v * SCALE for v in SIZE)
    source = Image.open(ROOT / "assets/images/night-lake-storybook.png").convert("RGB")
    scene = ImageOps.fit(source, size, method=Image.Resampling.LANCZOS, centering=(0.5, 1))
    vertical = Image.new("RGBA", (1, size[1]))
    for y in range(size[1]):
        ratio = y / size[1]
        alpha = 28 * max(0, 1 - ratio / 0.62) + 190 * max(0, (ratio - 0.62) / 0.38)
        vertical.putpixel((0, y), (8, 15, 26, int(alpha)))
    scene = Image.alpha_composite(scene.convert("RGBA"), vertical.resize(size))
    draw = ImageDraw.Draw(scene)
    draw_text(draw, (56, 32), "BIN", fonts["brand"], "#e3e9e8")
    draw_text(draw, (945, 516), "i.soit.tech", fonts["link"], "#d2dcd9", anchor="ra")
    return scene


def dashed_line(draw, start, end, fill, offset):
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dy)
    if not length:
        return
    position = -offset
    while position < length:
        a, b = max(0, position), min(length, position + 3)
        if b > a:
            coords = [(start[0] + dx * t / length, start[1] + dy * t / length) for t in (a, b)]
            draw.line([(x * SCALE, y * SCALE) for x, y in coords], fill=fill, width=SCALE)
        position += 8


def frame_at(scene, groups, fonts, phase):
    theta = phase * math.tau
    drift_x, drift_y = 2 * math.sin(theta), 2 * math.cos(theta)
    layer = Image.new("RGBA", scene.size)
    glow = Image.new("RGBA", scene.size)
    draw, halo = ImageDraw.Draw(layer), ImageDraw.Draw(glow)

    for index in range(40):
        x, y = seed(f"x{index}") % 1000, 22 + seed(f"y{index}") % 280
        alpha = 38 + 25 * (1 + math.sin(theta + index))
        draw.ellipse((x * SCALE, y * SCALE, (x + 1) * SCALE, (y + 1) * SCALE), fill=(166, 187, 209, int(alpha)))
    for group in groups:
        points = group["points"]
        color = group["color"]
        cx, cy = group["anchor"]

        def position(x, y):
            return (
                50 + cx * 1.42 + (x - cx) * 0.78 + drift_x,
                50 + cy * 0.60 + (y - cy) * 0.70 + drift_y,
            )

        for a, b in zip(points, points[1:]):
            dashed_line(draw, position(a["x"], a["y"]), position(b["x"], b["y"]), rgba(color, 88), phase * 8)
        label_pos = position(cx, cy - 68)
        draw_text(draw, label_pos, group["repo"].split("/")[1], fonts["label"], rgba(color, 135), anchor="mt")
        for index, point in enumerate(points):
            key = seed(group["repo"] + point["day"])
            pulse = 0.73 + 0.27 * math.sin(theta * (1 + key % 2) + key % 100)
            x, y = position(point["x"], point["y"])
            radius = (1.5 + min(1.8, math.sqrt(point["count"]) * 0.35)) * pulse
            halo.ellipse(((x - 7) * SCALE, (y - 7) * SCALE, (x + 7) * SCALE, (y + 7) * SCALE), fill=rgba(color, 85 * pulse))
            draw.ellipse(((x - radius) * SCALE, (y - radius) * SCALE, (x + radius) * SCALE, (y + radius) * SCALE), fill=rgba(color, 255 * pulse))
            if index == len(points) - 1:
                radius = 6 * pulse
                cross = [(x, y-radius), (x+radius*0.22, y-radius*0.22), (x+radius, y), (x+radius*0.22, y+radius*0.22), (x, y+radius), (x-radius*0.22, y+radius*0.22), (x-radius, y), (x-radius*0.22, y-radius*0.22)]
                draw.polygon([(px * SCALE, py * SCALE) for px, py in cross], fill=rgba(color, 240 * pulse))
    result = Image.alpha_composite(scene, glow.filter(ImageFilter.GaussianBlur(5 * SCALE)))
    result = Image.alpha_composite(result, layer)
    return result.convert("RGB").resize(SIZE, Image.Resampling.LANCZOS)


def render(snapshot_path, output):
    snapshot = json.loads(snapshot_path.read_text())
    fonts = {name: ImageFont.load_default(size=size * SCALE) for name, size in {
        "brand": 22, "link": 12, "label": 11,
    }.items()}
    groups = constellations(snapshot)
    scene = background(fonts)
    frames = [frame_at(scene, groups, fonts, index / FRAMES) for index in range(FRAMES)]
    # Reserve warm tones so the small lit window survives GIF color reduction.
    warm_colors = ["#f4d58d", "#e5bd73", "#d5a663", "#b98d51", "#997143", "#805c38", "#674a2e", "#523c29", "#413124", "#322820", "#27211d", "#fff5dc"]
    palette = frames[0].quantize(colors=244)
    palette.putpalette(palette.getpalette()[:244 * 3] + [channel for color in warm_colors for channel in rgba(color)[:3]])
    frames = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp.gif")
    frames[0].save(temporary, save_all=True, append_images=frames[1:], duration=DURATION_MS, loop=0, optimize=True, disposal=1)
    if temporary.stat().st_size > 5_000_000:
        temporary.unlink()
        raise ValueError("Profile banner exceeds the 5 MB delivery budget.")
    with Image.open(temporary) as image:
        if image.n_frames != FRAMES or image.size != SIZE or image.info.get("loop") != 0:
            raise ValueError("Generated GIF did not pass animation validation.")
    temporary.replace(output)
    print(f"Rendered {output.name}: {FRAMES} frames, {FRAMES * DURATION_MS / 1000:g}s, {output.stat().st_size:,} bytes.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, default=ROOT / "assets/data/activity.json")
    parser.add_argument("--output", type=Path, default=ROOT / "assets/profile-banner.gif")
    args = parser.parse_args()
    render(args.snapshot, args.output)
