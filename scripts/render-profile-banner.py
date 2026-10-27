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
# The site's simplified real constellations (assets/site.js): eight stars offset from an anchor, and their lines.
CONSTELLATIONS = [
    {  # Orion
        "stars": [(-30, -40), (-10, 0), (2, -2), (14, -5), (28, -34), (-24, 40), (32, 36), (0, -56)],
        "edges": [(0, 1), (1, 2), (2, 3), (3, 4), (1, 5), (3, 6), (0, 7), (7, 4)],
    },
    {  # Cygnus
        "stars": [(-6, -50), (0, -12), (-42, -2), (40, -24), (6, 16), (12, 46), (-70, 18), (66, -40)],
        "edges": [(0, 1), (1, 2), (1, 3), (1, 4), (4, 5), (2, 6), (3, 7)],
    },
    {  # Scorpius
        "stars": [(60, -46), (52, -28), (48, -10), (28, -18), (12, 6), (0, 32), (-34, 46), (-58, 24)],
        "edges": [(0, 1), (1, 2), (1, 3), (3, 4), (4, 5), (5, 6), (6, 7)],
    },
    {  # Leo
        "stars": [(32, 38), (26, 14), (34, -10), (24, -32), (46, -46), (-20, -14), (-56, 8), (-18, 20)],
        "edges": [(0, 1), (1, 2), (2, 3), (3, 4), (2, 5), (5, 6), (6, 7), (7, 0)],
    },
    {  # Big Dipper, with Mizar's unlinked companion Alcor
        "stars": [(-62, -22), (-58, 14), (-22, 22), (-20, -6), (10, -14), (38, -12), (66, 6), (44, -28)],
        "edges": [(0, 1), (1, 2), (2, 3), (3, 0), (3, 4), (4, 5), (5, 6)],
    },
    {  # Gemini
        "stars": [(-50, -38), (-30, -50), (-22, -8), (2, -22), (10, 22), (28, 4), (56, 24), (34, 46)],
        "edges": [(0, 1), (0, 2), (1, 3), (2, 3), (2, 4), (3, 5), (5, 6), (4, 7)],
    },
    {  # Pegasus
        "stars": [(-60, -28), (-8, -32), (-6, 18), (-58, 20), (24, 8), (42, 26), (68, 14), (24, -46)],
        "edges": [(0, 1), (1, 2), (2, 3), (3, 0), (2, 4), (4, 5), (5, 6), (1, 7)],
    },
]
# The site's four-point sparkle, 24 units tall and centered on the origin: its top-right
# edge as a cubic Bézier from the top tip to the shorter right tip.
SPARKLE_EDGE = [(0, -12), (0.6, -4.4), (2.4, -1.2), (9, 0)]


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
        constellation = CONSTELLATIONS[index % len(CONSTELLATIONS)]
        points = []
        for position, day in enumerate(history):
            if position < len(history) - 8:
                continue
            slot = position % len(constellation["stars"])
            ox, oy = constellation["stars"][slot]
            points.append({"x": cx + ox, "y": cy + oy, "slot": slot, "day": day, "count": days[repo][day]})
        lit = {point["slot"] for point in points}
        edges = [edge for edge in constellation["edges"] if set(edge) <= lit]
        result.append({"repo": repo, "anchor": (cx, cy), "points": points, "edges": edges})
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


def sparkle(x, y, height, tilt=0):
    """The site's four-point sparkle as a polygon centered on (x, y), rotated by tilt degrees."""
    edge = []
    for step in range(13):
        t = step / 12
        weights = ((1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t**2, t**3)
        edge.append([sum(w * point[axis] for w, point in zip(weights, SPARKLE_EDGE)) for axis in (0, 1)])
    # Mirror the top-right edge into the other three, walking the outline clockwise.
    outline = (
        edge
        + [(ex, -ey) for ex, ey in reversed(edge)]
        + [(-ex, -ey) for ex, ey in edge]
        + [(-ex, ey) for ex, ey in reversed(edge)]
    )
    angle = math.radians(tilt)
    cos, sin, scale = math.cos(angle), math.sin(angle), height / 24
    return [(x + (ex * cos - ey * sin) * scale, y + (ex * sin + ey * cos) * scale) for ex, ey in outline]


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
    # Sparkles are drawn at twice the resolution and scaled down, so their thin arms stay smooth.
    sparkles = Image.new("RGBA", (scene.width * 2, scene.height * 2))
    shine = ImageDraw.Draw(sparkles)

    for index, (x, y) in enumerate(ambient_stars()):
        r = 1.2 if index % 9 == 0 else 0.8
        alpha = (60 + seed(f"o{index}") % 90) * theme["specks"]
        draw.ellipse(scaled(x - r, y - r, x + r, y + r), fill=(255, 255, 255, int(alpha)))
    for group in constellations(snapshot):
        points = group["points"]
        cx, cy = group["anchor"]
        placed = {point["slot"]: position(cx, cy, point["x"], point["y"]) for point in points}
        for a, b in group["edges"]:
            draw.line(scaled(*placed[a], *placed[b]), fill=(255, 255, 255, 92), width=SCALE)
        if placed:
            label = position(cx, cy, cx, cy)[0], min(y for _, y in placed.values()) - 12
            draw.text(scaled(*label), group["repo"].split("/")[1], font=fonts["label"], fill=(255, 255, 255, 190), anchor="ms")
        for index, point in enumerate(points):
            x, y = placed[point["slot"]]
            halo.ellipse(scaled(x - 6, y - 6, x + 6, y + 6), fill=(255, 255, 255, 110))
            # As on the site, busy days and the newest day shine as four-point sparkles; the rest stay dots.
            bright = index == len(points) - 1
            if not bright and point["count"] < 5:
                radius = 1.2 + min(2, math.sqrt(point["count"]) * 0.4)
                draw.ellipse(scaled(x - radius, y - radius, x + radius, y + radius), fill="#fff")
                continue
            height = min(13, 6 + 1.5 * math.sqrt(point["count"]))
            tilt = seed(group["repo"] + point["day"]) % 21 - 10
            shapes = [(x, y, height)]
            if bright:
                # The newest day keeps its two small companions, like ✨.
                height = max(10, height)
                shapes = [(x, y, height), (x + 0.69 * height, y - 0.64 * height, 0.55 * height), (x + 0.64 * height, y + 0.6 * height, 0.36 * height)]
            for sx, sy, size in shapes:
                shine.polygon([(px * SCALE * 2, py * SCALE * 2) for px, py in sparkle(sx, sy, size, tilt)], fill="#fff")

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
    result = Image.alpha_composite(result, layer)
    return Image.alpha_composite(result, sparkles.resize(scene.size, Image.LANCZOS)).convert("RGB")


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
