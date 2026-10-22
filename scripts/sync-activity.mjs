import { writeFile, rename, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const dayInShanghai = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));

export function normalizeCommits(items, start, end) {
  const unique = new Map();
  for (const item of items) {
    if (item.repository?.private !== false || item.repository.fork) continue;
    const date = item.commit?.committer?.date;
    if (!date || !Number.isFinite(Date.parse(date))) continue;
    const day = dayInShanghai(date);
    if (day < start || day > end) continue;
    const repo = item.repository.full_name;
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[a-f0-9]{40}$/.test(item.sha))
      continue;
    if (unique.has(item.sha)) continue;
    unique.set(item.sha, {
      sha: item.sha,
      repo,
      date: new Date(date).toISOString(),
      day,
      title: item.commit.message.split("\n")[0].slice(0, 300),
      url: `https://github.com/${repo}/commit/${item.sha}`,
    });
  }
  return [...unique.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.sha.localeCompare(b.sha),
  );
}

export async function collectActivity({
  now = new Date(),
  fetcher = fetch,
  token = process.env.GH_TOKEN,
} = {}) {
  const end = dayInShanghai(now);
  const start = dayInShanghai(
    new Date(new Date(`${end}T00:00:00+08:00`).getTime() - 89 * 86400000),
  );
  const from = new Date(`${start}T00:00:00+08:00`).toISOString();
  const until = new Date(
    new Date(`${end}T00:00:00+08:00`).getTime() + 86400000 - 1000,
  ).toISOString();
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "bin-constellation",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const items = [];
  // Split dense windows before GitHub's 1,000-result search cap can truncate them.
  async function collectWindow(lower, upper) {
    const query = `author:boyan01 is:public committer-date:${lower}..${upper}`;
    async function page(number) {
      const url = new URL("https://api.github.com/search/commits");
      url.search = new URLSearchParams({
        q: query,
        per_page: "100",
        page: String(number),
        sort: "committer-date",
        order: "desc",
      });
      const response = await fetcher(url, {
        headers,
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok)
        throw new Error(`GitHub search failed: HTTP ${response.status}`);
      const result = await response.json();
      if (
        result.incomplete_results ||
        !Array.isArray(result.items) ||
        !Number.isInteger(result.total_count)
      ) {
        throw new Error(
          "GitHub returned incomplete search results; keeping the previous snapshot.",
        );
      }
      return result;
    }
    const first = await page(1);
    if (first.total_count > 1000) {
      const lo = Date.parse(lower),
        hi = Date.parse(upper);
      if (hi - lo < 2000)
        throw new Error("Too many commits in a one-second window.");
      const middle = Math.floor((lo + hi) / 2000) * 1000;
      await collectWindow(lower, new Date(middle).toISOString());
      await collectWindow(new Date(middle + 1000).toISOString(), upper);
      return;
    }
    items.push(...first.items);
    for (let i = 2; i <= Math.ceil(first.total_count / 100); i++)
      items.push(...(await page(i)).items);
  }
  await collectWindow(from, until);
  return {
    username: "boyan01",
    generatedAt: now.toISOString(),
    start,
    end,
    source: "GitHub public commit search",
    commits: normalizeCommits(items, start, end),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const snapshot = await collectActivity();
  const destination = new URL("../assets/data/activity.json", import.meta.url);
  await mkdir(new URL(".", destination), { recursive: true });
  const temporary = new URL(
    "../assets/data/activity.json.tmp",
    import.meta.url,
  );
  await writeFile(temporary, JSON.stringify(snapshot, null, 2) + "\n");
  await rename(temporary, destination);
  console.log(
    `Saved ${snapshot.commits.length} unique public commits (${snapshot.start} to ${snapshot.end}).`,
  );
}
