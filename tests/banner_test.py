"""Check that the profile banners reflect the public activity window."""

import importlib.util
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location(
    "banner", Path(__file__).resolve().parents[1] / "scripts/render-profile-banner.py"
)
banner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(banner)


class BannerTests(unittest.TestCase):
    def test_latest_active_days_keep_daily_counts_and_busiest_repositories(self):
        commits = [
            {"repo": "bin/busy", "day": f"2026-10-{day:02}"}
            for day in range(1, 11)
        ]
        commits.extend([{"repo": "bin/busy", "day": "2026-10-10"}] * 3)
        commits.extend({"repo": f"bin/other{index}", "day": "2026-10-10"} for index in range(7))
        groups = banner.constellations({"commits": commits})
        self.assertEqual(len(groups), 6)
        self.assertEqual(groups[0]["repo"], "bin/busy")
        self.assertEqual([point["day"] for point in groups[0]["points"]], [f"2026-10-{day:02}" for day in range(3, 11)])
        self.assertEqual(groups[0]["points"][-1]["count"], 4)
        self.assertEqual(banner.constellations({"commits": []}), [])

    def test_each_repository_traces_its_own_constellation_between_lit_stars(self):
        commits = [{"repo": f"bin/repo{index}", "day": f"2026-10-{day:02}"} for index in range(6) for day in range(1, 10 - index)]
        groups = banner.constellations({"commits": commits})
        shapes = [tuple((point["x"] - group["anchor"][0], point["y"] - group["anchor"][1]) for point in group["points"]) for group in groups]
        self.assertEqual(len(set(shapes)), 6)
        for group in groups:
            lit = {point["slot"] for point in group["points"]}
            self.assertTrue(group["edges"])
            self.assertTrue(all(a in lit and b in lit for a, b in group["edges"]))
        # A repository with fewer than eight active days shows part of its constellation.
        self.assertLess(len(groups[-1]["edges"]), len(banner.CONSTELLATIONS[5]["edges"]))

    def test_skyline_has_one_building_per_day_in_the_window(self):
        snapshot = {
            "start": "2026-10-01",
            "end": "2026-10-05",
            "commits": [{"repo": "bin/a", "day": "2026-10-02"}] * 4 + [{"repo": "bin/b", "day": "2026-10-04"}],
        }
        counts = banner.daily_counts(snapshot)
        self.assertEqual(counts, [0, 4, 0, 1, 0])
        buildings = banner.skyline(counts)
        self.assertEqual(len(buildings), 5)
        tops = [top for _, top, _ in buildings]
        self.assertLess(tops[1], tops[3])
        self.assertEqual(tops[0], tops[2])

    def test_renders_both_themes_at_double_resolution(self):
        snapshot = {
            "start": "2026-10-20",
            "end": "2026-10-22",
            "commits": [{"repo": "bin/example", "day": "2026-10-22"}],
        }
        fonts = {name: banner.ImageFont.load_default(size=22) for name in ("brand", "link", "label")}
        for theme in banner.THEMES.values():
            image = banner.render_banner(snapshot, theme, fonts)
            self.assertEqual(image.size, (2000, 720))
            # The ground strip under the skyline uses the theme's ground color.
            self.assertEqual(image.getpixel((10, 719)), banner.rgba(theme["ground"])[:3])

if __name__ == "__main__":
    unittest.main()
