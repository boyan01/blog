"""Render the day and night profile banners from the site's public activity snapshot."""

import argparse
from collections import Counter, defaultdict
from datetime import date, timedelta
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / "assets/fonts/bricolage-grotesque.woff2"
SIZE = (1000, 360)
SCALE = 2
SKYLINE_HEIGHT = 74
# The site's two skies, from zenith to horizon, with their ground and lamp colors.
THEMES = {
    "light": {
        "sky": [(0, "#2f6dc0"), (0.55, "#5b92d6"), (1, "#a7c7ec")],
        "haze": (255, 248, 230, 90),
        "ground": "#f5f7fb",
        "lamp": "#ffad33",
        "specks": 0.5,
    },
    "dark": {
        "sky": [(0, "#050a1a"), (0.55, "#0d1736"), (1, "#283c6c")],
        "haze": (255, 186, 120, 34),
        "ground": "#0a0f20",
        "lamp": "#ffcf70",
        "specks": 1,
    },
}
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
        result.append({"repo": repo, "anchor": (cx, cy), "points": points})
    return result


def daily_counts(snapshot):
    """Commit counts for every day in the snapshot window, oldest first."""
    counts = Counter(commit["day"] for commit in snapshot["commits"])
    start, end = date.fromisoformat(snapshot["start"]), date.fromisoformat(snapshot["end"])
    return [counts[(start + timedelta(days=i)).isoformat()] for i in range((end - start).days + 1)]


def skyline(counts):
    """One building per day, scaled like the site's skyline: (left, top, right) in banner units."""
    width = SIZE[0] / len(counts)
    peak = max([1, *counts])
    buildings = []
    for index, count in enumerate(counts):
        height = math.sqrt(count / peak) * (SKYLINE_HEIGHT - 9) + 6 if count else 0
        buildings.append((index * width, SIZE[1] - 3 - height, (index + 1) * width - 1.2))
    return buildings


def seed(value):
    return int.from_bytes(hashlib.sha256(value.encode()).digest()[:4], "big")


def ambient_stars(count=70):
    """Faint background stars, kept apart so neighbors never merge into one blot."""
    stars = []
    for index in range(count * 2):
        x, y = seed(f"x{index}") % 1000, 10 + seed(f"y{index}") % 250
        if all(math.hypot(x - a, y - b) > 12 for a, b in stars):
            stars.append((x, y))
        if len(stars) == count:
            break
    return stars


def position(cx, cy, x, y):
    """Spread anchors across the wide banner while keeping each constellation's shape."""
    return 90 + cx * 1.35 + (x - cx) * 0.62, 30 + cy * 0.62 + (y - cy) * 0.62


def rgba(color, alpha=255):
    return tuple(bytes.fromhex(color.removeprefix("#"))) + (int(alpha),)


def font(size, weight):
    face = ImageFont.truetype(FONT, size * SCALE)
    face.set_variation_by_axes([min(96, max(14, size)), weight])
    return face


def scaled(*values):
    return [value * SCALE for value in values]


def sky(theme):
    size = tuple(scaled(*SIZE))
    column = Image.new("RGB", (1, size[1]))
    stops = theme["sky"]
    for y in range(size[1]):
        ratio = y / (size[1] - 1)
        for (start, a), (stop, b) in zip(stops, stops[1:]):
            if start <= ratio <= stop:
                t = (ratio - start) / (stop - start)
                column.putpixel((0, y), tuple(round(p + (q - p) * t) for p, q in zip(rgba(a)[:3], rgba(b)[:3])))
                break
    scene = column.resize(size).convert("RGBA")
    haze = Image.new("RGBA", size)
    ImageDraw.Draw(haze).ellipse(scaled(-100, 260, 1100, 540), fill=theme["haze"])
    return Image.alpha_composite(scene, haze.filter(ImageFilter.GaussianBlur(60 * SCALE)))


def render_banner(snapshot, theme, fonts):
    scene = sky(theme)
    layer = Image.new("RGBA", scene.size)
    glow = Image.new("RGBA", scene.size)
    draw, halo = ImageDraw.Draw(layer), ImageDraw.Draw(glow)

    for index, (x, y) in enumerate(ambient_stars()):
        r = 1.2 if index % 9 == 0 else 0.8
        alpha = (60 + seed(f"o{index}") % 90) * theme["specks"]
        draw.ellipse(scaled(x - r, y - r, x + r, y + r), fill=(255, 255, 255, int(alpha)))
    for group in constellations(snapshot):
        points = group["points"]
        cx, cy = group["anchor"]
        placed = [position(cx, cy, point["x"], point["y"]) for point in points]
        for a, b in zip(placed, placed[1:]):
            draw.line(scaled(*a, *b), fill=(255, 255, 255, 92), width=SCALE)
        if placed:
            label = position(cx, cy, cx, cy)[0], min(y for _, y in placed) - 12
            draw.text(scaled(*label), group["repo"].split("/")[1], font=fonts["label"], fill=(255, 255, 255, 190), anchor="ms")
        for index, (point, (x, y)) in enumerate(zip(points, placed)):
            radius = 1.2 + min(2, math.sqrt(point["count"]) * 0.4)
            halo.ellipse(scaled(x - 6, y - 6, x + 6, y + 6), fill=(255, 255, 255, 110))
            draw.ellipse(scaled(x - radius, y - radius, x + radius, y + radius), fill="#fff")
            if index == len(points) - 1:
                # The newest day of each constellation gets a glint.
                for step in range(4):
                    near, far, alpha = 2 + step * 2.5, 4.5 + step * 2.5, int(210 * (1 - step / 4))
                    for sx, sy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        draw.line(scaled(x + sx * near, y + sy * near, x + sx * far, y + sy * far), fill=(255, 255, 255, alpha), width=SCALE)

    # The skyline is the ground's color, and today's building is lit with a lamp post.
    buildings = skyline(daily_counts(snapshot))
    for left, top, right in buildings:
        draw.rectangle(scaled(left, top, right, SIZE[1]), fill=theme["ground"])
    draw.rectangle(scaled(0, SIZE[1] - 3, *SIZE), fill=theme["ground"])
    left, top, right = buildings[-1]
    middle = (left + right) / 2
    halo.ellipse(scaled(middle - 14, top - 22, middle + 14, SIZE[1] + 6), fill=rgba(theme["lamp"], 120))
    draw.rectangle(scaled(left, top, right, SIZE[1] - 3), fill=theme["lamp"])
    draw.rectangle(scaled(middle - 1, top - 12, middle + 1, top), fill=theme["lamp"])

    draw.text(scaled(40, 26), "BIN", font=fonts["brand"], fill="#fff")
    draw.text(scaled(960, 31), "i.soit.tech", font=fonts["link"], fill=(255, 255, 255, 200), anchor="ra")
    result = Image.alpha_composite(scene, glow.filter(ImageFilter.GaussianBlur(4 * SCALE)))
    return Image.alpha_composite(result, layer).convert("RGB")


def render(snapshot_path, output_dir):
    snapshot = json.loads(snapshot_path.read_text())
    fonts = {"brand": font(22, 800), "link": font(14, 500), "label": font(12, 500)}
    output_dir.mkdir(parents=True, exist_ok=True)
    for name, theme in THEMES.items():
        output = output_dir / f"profile-banner-{name}.png"
        temporary = output.with_suffix(".tmp.png")
        render_banner(snapshot, theme, fonts).save(temporary, optimize=True)
        with Image.open(temporary) as image:
            if image.size != tuple(scaled(*SIZE)):
                raise ValueError(f"Generated {output.name} has the wrong size.")
        if temporary.stat().st_size > 5_000_000:
            temporary.unlink()
            raise ValueError(f"{output.name} exceeds the 5 MB delivery budget.")
        temporary.replace(output)
        print(f"Rendered {output.name}: {output.stat().st_size:,} bytes.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, default=ROOT / "assets/data/activity.json")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "assets")
    args = parser.parse_args()
    render(args.snapshot, args.output_dir)
