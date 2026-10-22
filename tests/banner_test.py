"""Check that the profile banner reflects the public activity window."""

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

    def test_loop_returns_to_the_same_image(self):
        scene = banner.Image.new("RGBA", tuple(value * banner.SCALE for value in banner.SIZE), "#081020")
        groups = banner.constellations({"commits": [{"repo": "bin/example", "day": "2026-10-22"}]})
        fonts = {"label": banner.ImageFont.truetype(banner.font_path(), 22)}
        first = banner.frame_at(scene, groups, fonts, 0)
        last = banner.frame_at(scene, groups, fonts, 1)
        # Subpixel trigonometric rounding may affect a handful of antialiased pixels.
        from PIL import ImageChops, ImageStat
        self.assertLess(max(ImageStat.Stat(ImageChops.difference(first, last)).mean), 0.01)


if __name__ == "__main__":
    unittest.main()
