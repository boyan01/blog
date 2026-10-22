import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCommits,
  collectActivity,
  dayInShanghai,
} from "../scripts/sync-activity.mjs";
const item = (overrides = {}) => ({
  sha: "a".repeat(40),
  repository: { full_name: "boyan01/example", private: false, fork: false },
  commit: {
    message: "Improve selection\nDetails",
    committer: { date: "2026-10-20T17:00:00Z" },
  },
  ...overrides,
});
test("uses Shanghai dates across midnight", () =>
  assert.equal(dayInShanghai("2026-10-20T17:00:00Z"), "2026-10-21"));
test("excludes private, unknown visibility, forks and duplicate commits", () => {
  const results = normalizeCommits(
    [
      item(),
      item(),
      item({ repository: { full_name: "secret/repo", private: true } }),
      item({ repository: { full_name: "unknown/repo" } }),
      item({
        repository: { full_name: "fork/repo", private: false, fork: true },
      }),
    ],
    "2026-10-01",
    "2026-10-22",
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Improve selection");
  assert.equal(results[0].day, "2026-10-21");
});
test("filters local-date boundaries without losing late UTC commits", () => {
  assert.equal(
    normalizeCommits([item()], "2026-10-21", "2026-10-21").length,
    1,
  );
  assert.equal(
    normalizeCommits([item()], "2026-10-20", "2026-10-20").length,
    0,
  );
});
test("collects every page and rejects incomplete snapshots", async () => {
  let pages = [];
  const result = await collectActivity({
    now: new Date("2026-10-22T03:00:00Z"),
    fetcher: async (url) => {
      pages.push(url.searchParams.get("page"));
      assert.match(url.searchParams.get("q"), /is:public/);
      return {
        ok: true,
        json: async () => ({
          total_count: 101,
          incomplete_results: false,
          items: [item({ sha: pages.length.toString().repeat(40) })],
        }),
      };
    },
  });
  assert.deepEqual(pages, ["1", "2"]);
  assert.equal(result.commits.length, 2);
  await assert.rejects(
    collectActivity({
      fetcher: async () => ({
        ok: true,
        json: async () => ({
          incomplete_results: true,
          total_count: 1,
          items: [],
        }),
      }),
    }),
    /incomplete/,
  );
});
test("splits searches above the GitHub result cap", async () => {
  let calls = 0;
  const result = await collectActivity({
    now: new Date("2026-10-22T03:00:00Z"),
    fetcher: async () => ({
      ok: true,
      json: async () => ({
        total_count: ++calls === 1 ? 1001 : 0,
        incomplete_results: false,
        items: [],
      }),
    }),
  });
  assert.equal(calls, 3);
  assert.equal(result.commits.length, 0);
});

test('sorts instants correctly when timestamps use different offsets', () => {
  const later = item({ sha: 'b'.repeat(40), commit: { message: 'Later', committer: { date: '2026-10-21T13:15:58+04:00' } } });
  const earlier = item({ sha: 'c'.repeat(40), commit: { message: 'Earlier', committer: { date: '2026-10-21T15:12:31+08:00' } } });
  const result = normalizeCommits([earlier, later], '2026-10-01', '2026-10-22');
  assert.equal(result[0].title, 'Later');
  assert.equal(result[0].date, '2026-10-21T09:15:58.000Z');
});
