# BIN

A quiet personal website at [i.soit.tech](https://i.soit.tech): a night landscape, an interactive constellation of public commits, and a small writing archive.

## Development

The site keeps Jekyll 3.10 and the existing GitHub Pages branch deployment. No database or frontend package installation is needed. Use Ruby 3.3 or later and Node.js 22 or later.

```sh
bundle install
bundle exec jekyll serve --host 127.0.0.1
```

The published posts retain their original `/:year/:month/:day/:title/` URLs. Unpublished posts and drafts remain unpublished.

## Activity data

`assets/data/activity.json` is a checked-in snapshot of the most recent 90 Shanghai calendar days. Refresh it with:

```sh
node --test tests/activity.test.mjs
GH_TOKEN="$(gh auth token)" node scripts/sync-activity.mjs
```

`GH_TOKEN` is optional locally but recommended for API rate limits. It is used only by the collection script, never copied into the site. The collector queries GitHub public commit search, rejects private or unknown repository visibility, excludes forks, deduplicates commit SHAs, and writes the snapshot only after all search pages succeed. Dates use the commit's committer timestamp, normalized to Asia/Shanghai days. This is indexed public commit activity, not GitHub's total contribution count.

Each star represents one repository's active day. The overview shows the six most active repositories and each constellation's latest eight active days at the selected date. Repository filters expose the other repositories as well. The timeline and counts include all collected commits within the selected scope. Recent rows group by repository and day, showing the latest commit title; stars open the full daily list.

The `Refresh public activity` workflow runs daily at 09:23 Asia/Shanghai, or manually. On `master`, it updates the snapshot, commits it, and explicitly requests a Pages build because a push made with `GITHUB_TOKEN` does not itself trigger a Pages build. Keep Pages configured as **Deploy from a branch → master → /(root)**. A failed collection leaves the last committed snapshot and deployed site intact. Branch protection may require an adjusted publishing policy; GitHub may disable scheduled workflows in inactive public repositories.

## Profile banner

The same daily workflow renders `assets/profile-banner.gif` from the refreshed public snapshot before committing both files together. The 1000 × 360, 8-second looping GIF uses the storybook background, the six busiest repositories, and each repository's latest eight active days. The cover keeps only a small BIN wordmark and the site address; the star groups update from the snapshot without statistics or explanatory copy. Rendering uses Pillow and its bundled font; no browser, external rendering service, or cross-repository token is required. A failed render keeps the last committed snapshot and banner intact.

To regenerate locally:

```sh
python -m pip install -r scripts/banner-requirements.txt
python -m unittest discover -s tests -p '*_test.py'
python scripts/render-profile-banner.py
```

No system font installation is needed. The renderer validates the frame count, infinite loop, dimensions, and a 5 MB size limit before replacing the banner.

The profile repository references the raw image from `master`, wrapped in a link to `https://i.soit.tech/`. New banners appear after GitHub's image caches refresh; the README itself does not need daily commits.

## Design

The header reads **BIN**. The opening view centers the constellations above the lake with no slogan or explanatory caption. Activity totals and the timeline remain below the landscape. Motion respects the system's reduced-motion preference and has a manual toggle. Star details support keyboard navigation and Escape, and all content links work independently of the animated sky. Stars drift together with their connecting lines, pulse at staggered intervals, and highlight their constellation on pointer hover or keyboard focus. The same motion toggle stops both the scene animation and star pseudo-element animations. The page uses system fonts and serves its own storybook-style background image.

`assets/images/night-lake-storybook.png` was generated with the built-in image generation tool. Its prompt is recorded in `assets/images/night-lake-storybook.prompt.txt`.

## License

The original [Jekyll template](https://github.com/github/personal-website) is licensed under [MIT](LICENSE.txt). Written page content retains [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
