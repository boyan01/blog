(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const anchors = [
    [140, 125],
    [345, 85],
    [500, 180],
    [300, 265],
    [555, 55],
    [90, 270],
  ];
  // Simplified real constellations, eight stars each, offset from an anchor.
  // Star order is the fill order, so the first few already read as a shape.
  const constellations = [
    {
      name: "Orion",
      stars: [[-30, -40], [-10, 0], [2, -2], [14, -5], [28, -34], [-24, 40], [32, 36], [0, -56]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [1, 5], [3, 6], [0, 7], [7, 4]],
    },
    {
      name: "Cygnus",
      stars: [[-6, -50], [0, -12], [-42, -2], [40, -24], [6, 16], [12, 46], [-70, 18], [66, -40]],
      edges: [[0, 1], [1, 2], [1, 3], [1, 4], [4, 5], [2, 6], [3, 7]],
    },
    {
      name: "Scorpius",
      stars: [[60, -46], [52, -28], [48, -10], [28, -18], [12, 6], [0, 32], [-34, 46], [-58, 24]],
      edges: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7]],
    },
    {
      name: "Leo",
      stars: [[32, 38], [26, 14], [34, -10], [24, -32], [46, -46], [-20, -14], [-56, 8], [-18, 20]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [6, 7], [7, 0]],
    },
    {
      name: "Big Dipper",
      // The eighth star is Alcor, Mizar's unlinked companion.
      stars: [[-62, -22], [-58, 14], [-22, 22], [-20, -6], [10, -14], [38, -12], [66, 6], [44, -28]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]],
    },
    {
      name: "Gemini",
      stars: [[-50, -38], [-30, -50], [-22, -8], [2, -22], [10, 22], [28, 4], [56, 24], [34, 46]],
      edges: [[0, 1], [0, 2], [1, 3], [2, 3], [2, 4], [3, 5], [5, 6], [4, 7]],
    },
    {
      name: "Pegasus",
      stars: [[-60, -28], [-8, -32], [-6, 18], [-58, 20], [24, 8], [42, 26], [68, 14], [24, -46]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4], [4, 5], [5, 6], [1, 7]],
    },
  ];
  const hash = (value) => {
    let n = 2166136261;
    for (const char of value) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
    n ^= n >>> 16;
    n = Math.imul(n, 0x85ebca6b);
    return (n ^ (n >>> 13)) >>> 0;
  };
  const shortRepo = (repo) => repo.split("/")[1];
  let snapshot,
    days = [],
    repos = [],
    selectedRepo = null,
    selectedDay,
    visibleRows = 8,
    groups = [];
  const dayLabel = (day) => day.replaceAll("-", ".");
  const shortDay = (day) => day.slice(5).replace("-", ".");
  const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  let motion = !motionQuery.matches;
  function setMotion(value) {
    motion = value;
    document.documentElement.classList.toggle("motion-off", !motion);
    $("#motion-toggle").setAttribute("aria-pressed", String(motion));
  }
  $("#motion-toggle").addEventListener("click", () => setMotion(!motion));
  motionQuery.addEventListener("change", (event) => setMotion(!event.matches));
  setMotion(motion);
  for (let i = 0; i < 120; i++) {
    const dot = document.createElement("i");
    dot.className = "ambient-star" + (i % 9 === 0 ? " large" : "");
    dot.style.cssText = `left:${(hash(`x${i}`) % 1000) / 10}%;top:${(hash(`y${i}`) % 760) / 10}%;--opacity:${0.15 + (hash(`o${i}`) % 45) / 100};--duration:${3 + (i % 7)}s;--delay:-${i % 8}s`;
    $(".ambient-stars").append(dot);
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const commitCount = (n) => `${n} 次提交`;
  function grouped(commits) {
    const map = new Map();
    for (const commit of commits) {
      const key = `${commit.repo}|${commit.day}`;
      if (!map.has(key))
        map.set(key, { key, repo: commit.repo, day: commit.day, commits: [] });
      map.get(key).commits.push(commit);
    }
    return [...map.values()].sort(
      (a, b) => b.day.localeCompare(a.day) || a.repo.localeCompare(b.repo),
    );
  }
  function renderFilters() {
    const container = $(".repo-filters");
    container.replaceChildren();
    for (const name of [null, ...repos.map((repo) => repo.name)]) {
      const button = element("button", "", name ? shortRepo(name) : "全部");
      button.type = "button";
      button.setAttribute("aria-pressed", String(name === selectedRepo));
      button.addEventListener("click", () => {
        selectedRepo = name;
        visibleRows = 8;
        renderFilters();
        render();
        const index = name ? repos.findIndex((r) => r.name === name) + 1 : 0;
        container.children[index].focus({ preventScroll: true });
      });
      container.append(button);
    }
  }
  function showDetail(group) {
    $("#detail-date").textContent = dayLabel(group.day);
    $("#detail-title").textContent = shortRepo(group.repo);
    $(".detail-count").textContent = commitCount(group.commits.length);
    $(".detail-commits").replaceChildren(
      ...group.commits.map((commit) => {
        const li = element("li");
        const link = element("a", "", commit.title);
        link.href = commit.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.append(element("code", "", commit.sha.slice(0, 7)));
        li.append(link);
        return li;
      }),
    );
    $("#star-detail").showModal();
  }
  $(".dialog-close").addEventListener("click", () => $("#star-detail").close());
  $("#star-detail").addEventListener("click", (event) => {
    if (event.target !== $("#star-detail")) return;
    const rect = event.target.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      event.target.close();
  });
  function highlightRepo(name) {
    const focusedRepo = document.activeElement?.closest(".star")?.dataset.repo;
    const activeRepo = name || focusedRepo || selectedRepo;
    $("#sky").classList.toggle("has-highlight", Boolean(activeRepo));
    for (const node of $("#sky").querySelectorAll("[data-repo]")) {
      node.classList.toggle("is-active", node.dataset.repo === activeRepo);
    }
  }
  function renderSky() {
    const svg = $(".constellations");
    const layer = $(".star-layer");
    svg.replaceChildren();
    layer.replaceChildren();
    // Show eight recent active days per constellation. Positions stay fixed while rewinding.
    const shownRepos = selectedRepo
      ? repos.filter((r) => r.name === selectedRepo)
      : repos.slice(0, 6);
    shownRepos.forEach((repo, index) => {
      const anchorIndex = selectedRepo ? 1 : index;
      const [cx, cy] = anchors[anchorIndex];
      // Pick by rank, so the six shown constellations never repeat a shape.
      const { stars, edges } =
        constellations[repos.indexOf(repo) % constellations.length];
      // Slot by active-day index, so the same date keeps its position during playback.
      const history = groups.filter((g) => g.repo === repo.name).reverse();
      const points = history
        .filter((group) => group.day <= selectedDay)
        .slice(-8)
        .map((group) => {
          const slot = history.indexOf(group) % stars.length;
          return { group, slot, x: cx + stars[slot][0], y: cy + stars[slot][1] };
        });
      const lit = new Map(points.map((point) => [point.slot, point]));
      for (const [from, to] of edges) {
        const a = lit.get(from);
        const b = lit.get(to);
        if (!a || !b) continue;
        const line = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "line",
        );
        for (const [key, value] of Object.entries({
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
        }))
          line.setAttribute(key, value);
        line.dataset.repo = repo.name;
        svg.append(line);
      }
      points.forEach((point, pointIndex) => {
        const { group, x, y } = point;
        const count = group.commits.length;
        // Busy days and the newest day shine as four-point sparkles; the rest stay dots.
        const bright = pointIndex === points.length - 1;
        const sparkle = bright || count >= 5;
        // The newest star stays large enough for its companions to show.
        const size = sparkle
          ? Math.max(bright ? 13 : 0, Math.min(18, 8 + 2 * Math.sqrt(count)))
          : Math.min(6, 2.5 + Math.sqrt(count));
        const button = element(
          "button",
          "star" + (sparkle ? " sparkle" : "") + (bright ? " bright" : ""),
        );
        button.type = "button";
        button.dataset.repo = repo.name;
        button.style.cssText = `left:${(x / 640) * 100}%;top:${(y / 350) * 100}%;--size:${size}px;--tilt:${(hash(group.key) % 21) - 10}deg;--pulse-duration:${3 + (hash(group.key) % 25) / 10}s;--pulse-delay:-${(hash(group.key) % 40) / 10}s`;
        button.setAttribute(
          "aria-label",
          `${shortRepo(repo.name)}，${group.day}，${commitCount(count)}`,
        );
        const tooltip = element("span", "star-tooltip");
        tooltip.setAttribute("aria-hidden", "true");
        tooltip.append(
          element("b", "", shortDay(group.day)),
          document.createTextNode(commitCount(count)),
        );
        if (x > 520) button.classList.add("edge-right");
        if (x < 80) button.classList.add("edge-left");
        button.append(tooltip);
        button.addEventListener("pointerenter", (event) => {
          if (event.pointerType !== "touch") highlightRepo(repo.name);
        });
        button.addEventListener("pointerleave", () => highlightRepo(null));
        button.addEventListener("focus", () => highlightRepo(repo.name));
        button.addEventListener("blur", () => highlightRepo(null));
        button.addEventListener("click", () => showDetail(group));
        layer.append(button);
      });
      if (points.length) {
        const label = element("span", "cluster-label", shortRepo(repo.name));
        label.dataset.repo = repo.name;
        // Sit the label just above the cluster's highest star.
        const top = Math.min(...points.map((point) => point.y)) - 24;
        label.style.cssText = `left:${(cx / 640) * 100}%;top:${(top / 350) * 100}%`;
        layer.append(label);
      }
    });
    highlightRepo(selectedRepo);
  }
  function renderFootprints() {
    const filtered = groups.filter(
      (group) =>
        group.day <= selectedDay &&
        (!selectedRepo || group.repo === selectedRepo),
    );
    const container = $("#footprint-list");
    container.replaceChildren();
    if (!filtered.length)
      container.append(element("p", "fallback-note", "这段时间没有公开提交。"));
    filtered.slice(0, visibleRows).forEach((group, index) => {
      const newDay = !index || filtered[index - 1].day !== group.day;
      const row = element("a", "footprint-row" + (newDay ? " new-day" : ""));
      row.href = group.commits[0].url;
      row.target = "_blank";
      row.rel = "noopener noreferrer";
      row.append(element("span", "footprint-date", newDay ? shortDay(group.day) : ""));
      const body = element("div");
      body.append(element("h3", "footprint-title", group.commits[0].title));
      const meta = element("div", "footprint-meta");
      meta.append(element("span", "", shortRepo(group.repo)));
      if (group.commits.length > 1)
        meta.append(element("span", "", commitCount(group.commits.length)));
      body.append(meta);
      row.append(body);
      container.append(row);
    });
    $("#show-more").hidden = filtered.length <= visibleRows;
  }
  function render() {
    const index = days.indexOf(selectedDay);
    $("#timeline-date").textContent = shortDay(selectedDay);
    $("#time-range").setAttribute("aria-valuetext", dayLabel(selectedDay));
    $("#timeline-reset").hidden = selectedDay === snapshot.end;
    const label = $(".scrub-label");
    // Near the right edge the label hangs left of the lamp and stays on screen.
    const flip = index > days.length * 0.8;
    const center = `${((index + 0.5) / days.length) * 100}%`;
    label.style.left = flip
      ? `min(calc(${center} + 12px), calc(100% - 8px))`
      : center;
    label.classList.toggle("flip", flip);
    const bars = [...$("#activity-bars").children];
    const daily = new Map();
    for (const commit of snapshot.commits)
      if (!selectedRepo || commit.repo === selectedRepo)
        daily.set(commit.day, (daily.get(commit.day) || 0) + 1);
    const max = Math.max(1, ...daily.values());
    bars.forEach((bar) => {
      const count = daily.get(bar.dataset.day) || 0;
      bar.style.height = `${count ? 12 + Math.sqrt(count / max) * 88 : 4}%`;
      bar.classList.toggle("future", bar.dataset.day > selectedDay);
      bar.classList.toggle("active", bar.dataset.day === selectedDay);
    });
    label.style.bottom = `calc(${bars[index].style.height} + 20px)`;
    renderSky();
    renderFootprints();
  }
  $("#show-more").addEventListener("click", () => {
    const previous = visibleRows;
    visibleRows += 8;
    renderFootprints();
    $("#footprint-list").children[previous]?.focus({ preventScroll: true });
  });
  $("#timeline-reset").addEventListener("click", () => {
    $("#time-range").value = days.length - 1;
    selectedDay = snapshot.end;
    visibleRows = 8;
    render();
  });
  async function init() {
    try {
      const response = await fetch(
        new URL(
          "data/activity.json",
          document.currentScript?.src ||
            new URL("assets/site.js", document.baseURI),
        ),
        { cache: "no-cache" },
      );
      if (!response.ok) throw new Error("Snapshot unavailable");
      snapshot = await response.json();
      if (
        !Array.isArray(snapshot.commits) ||
        !snapshot.start ||
        !snapshot.end ||
        !snapshot.generatedAt
      )
        throw new Error("Invalid snapshot");
      // Only render known public GitHub commit URLs from the checked-in snapshot.
      snapshot.commits = snapshot.commits.filter(
        (commit) =>
          /^[\w.-]+\/[\w.-]+$/.test(commit.repo) &&
          /^[a-f0-9]{40}$/.test(commit.sha) &&
          commit.url ===
            `https://github.com/${commit.repo}/commit/${commit.sha}`,
      );
      selectedDay = snapshot.end;
      const byRepo = new Map();
      snapshot.commits.forEach((commit) =>
        byRepo.set(commit.repo, (byRepo.get(commit.repo) || 0) + 1),
      );
      repos = [...byRepo]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      groups = grouped(snapshot.commits);
      days = Array.from({ length: 90 }, (_, i) =>
        new Date(Date.parse(snapshot.start + "T12:00:00Z") + i * 86400000)
          .toISOString()
          .slice(0, 10),
      );
      for (const day of days) {
        const bar = element("i");
        bar.dataset.day = day;
        $("#activity-bars").append(bar);
      }
      $("#time-range").addEventListener("input", (event) => {
        selectedDay = days[Number(event.target.value)];
        visibleRows = 8;
        render();
      });
      $("#timeline").hidden = false;
      renderFilters();
      render();
    } catch (error) {
      const note = element("p", "fallback-note", "最近的提交暂时没有加载出来。");
      const link = element("a", "", "在 GitHub 上查看");
      link.href = "https://github.com/boyan01";
      note.append(document.createTextNode(" "), link);
      $("#footprint-list").replaceChildren(note);
      console.error("Unable to load the public activity snapshot:", error);
    }
  }
  init();
})();
