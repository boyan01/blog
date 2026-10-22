(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const palette = [
    "#bfdacf",
    "#b5cce6",
    "#cdbfa5",
    "#91bdc4",
    "#bcb9d9",
    "#b7c5b1",
  ];
  const anchors = [
    [140, 125],
    [345, 85],
    [500, 180],
    [300, 265],
    [555, 55],
    [90, 270],
  ];
  const offsets = [
    [0, 0],
    [-45, -28],
    [28, -46],
    [63, 3],
    [26, 42],
    [-33, 53],
    [-73, 13],
    [67, 60],
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
    repos = [],
    selectedRepo = null,
    selectedDay,
    visibleRows = 6,
    groups = [];
  const dayLabel = (day) => day.replaceAll("-", ".");
  const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  let motion = !motionQuery.matches;
  function setMotion(value) {
    motion = value;
    document.documentElement.classList.toggle("motion-off", !motion);
    $("#motion-toggle").setAttribute("aria-pressed", String(motion));
    $(".motion-label").textContent = motion ? "星光流动中" : "静静看星光";
  }
  $("#motion-toggle").addEventListener("click", () => setMotion(!motion));
  motionQuery.addEventListener("change", (event) => setMotion(!event.matches));
  setMotion(motion);
  for (let i = 0; i < 65; i++) {
    const dot = document.createElement("i");
    dot.className = "ambient-star";
    dot.style.cssText = `left:${hash(`x${i}`) % 100}%;top:${hash(`y${i}`) % 62}%;--opacity:${0.13 + (hash(`o${i}`) % 30) / 100};--duration:${3 + (i % 7)}s;--delay:-${i % 8}s`;
    $(".ambient-stars").append(dot);
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function color(repo) {
    return (
      palette[repos.findIndex((r) => r.name === repo) % palette.length] ||
      palette[0]
    );
  }
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
      const button = element("button", "", name ? shortRepo(name) : "全部星群");
      button.type = "button";
      button.title = name || "全部公开仓库";
      button.style.setProperty("--star-color", name ? color(name) : palette[0]);
      button.setAttribute("aria-pressed", String(name === selectedRepo));
      button.addEventListener("click", () => {
        selectedRepo = name;
        visibleRows = 6;
        renderFilters();
        render();
        const index = name ? repos.findIndex((r) => r.name === name) + 1 : 0;
        container.children[index].focus({ preventScroll: true });
      });
      container.append(button);
    }
  }
  function showDetail(group) {
    const dialog = $("#star-detail");
    $("#detail-date").textContent = dayLabel(group.day) + " · A DAY IN CODE";
    $("#detail-title").textContent = shortRepo(group.repo);
    $(".detail-count").textContent =
      `${group.repo} · ${group.commits.length} 条公开提交`;
    $(".detail-commits").replaceChildren(
      ...group.commits.map((commit) => {
        const li = element("li");
        const link = element("a", "", commit.title + " ↗");
        link.href = commit.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.append(element("code", "", commit.sha.slice(0, 7)));
        li.append(link);
        return li;
      }),
    );
    dialog.showModal();
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
      const days = groups
        .filter((group) => group.repo === repo.name && group.day <= selectedDay)
        .slice(0, 8)
        .reverse();
      const points = days.map((group) => {
        // Slot by active-day index, so the same date keeps its position during playback.
        const history = groups
          .filter((g) => g.repo === repo.name)
          .slice()
          .reverse();
        const slot =
          history.findIndex((g) => g.key === group.key) % offsets.length;
        return { group, x: cx + offsets[slot][0], y: cy + offsets[slot][1] };
      });
      points.forEach((point, pointIndex) => {
        if (pointIndex) {
          const previous = points[pointIndex - 1];
          const line = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "line",
          );
          for (const [key, value] of Object.entries({
            x1: previous.x,
            y1: previous.y,
            x2: point.x,
            y2: point.y,
          }))
            line.setAttribute(key, value);
          line.style.setProperty("--star-color", color(repo.name));
          line.dataset.repo = repo.name;
          svg.append(line);
        }
        const { group, x, y } = point;
        const button = element(
          "button",
          "star" + (pointIndex === points.length - 1 ? " bright" : ""),
        );
        button.type = "button";
        button.dataset.repo = repo.name;
        button.style.cssText = `left:${(x / 640) * 100}%;top:${(y / 350) * 100}%;--star-color:${color(repo.name)};--size:${Math.min(7, 3 + Math.sqrt(group.commits.length))}px;--pulse-duration:${3 + (hash(group.key) % 25) / 10}s;--pulse-delay:-${(hash(group.key) % 40) / 10}s`;
        button.setAttribute(
          "aria-label",
          `${shortRepo(repo.name)}，${group.day}，${group.commits.length} 条提交`,
        );
        const halo = element("span", "star-halo");
        halo.setAttribute("aria-hidden", "true");
        const tooltip = element(
          "span",
          "star-tooltip",
          `${group.day.slice(5).replace("-", ".")} · ${group.commits.length} 条提交`,
        );
        tooltip.setAttribute("aria-hidden", "true");
        if (x > 520) button.classList.add("edge-right");
        if (x < 80) button.classList.add("edge-left");
        button.append(halo, tooltip);
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
        label.style.cssText = `left:${(cx / 640) * 100}%;top:${((cy - 70) / 350) * 100}%;--star-color:${color(repo.name)}`;
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
      container.append(
        element(
          "p",
          "fallback-note",
          "这段时间还没有公开足迹。把时间往后拖一点，看看后来发生了什么。",
        ),
      );
    for (const group of filtered.slice(0, visibleRows)) {
      const row = element("a", "footprint-row");
      row.href = group.commits[0].url;
      row.target = "_blank";
      row.rel = "noopener noreferrer";
      row.append(
        element("span", "footprint-date", group.day.slice(5).replace("-", ".")),
      );
      const body = element("div");
      body.append(element("h3", "footprint-title", group.commits[0].title));
      const meta = element("div", "footprint-meta");
      const repo = element("span");
      const dot = element("i", "repo-dot");
      dot.style.setProperty("--star-color", color(group.repo));
      repo.append(dot, document.createTextNode(shortRepo(group.repo)));
      meta.append(
        repo,
        element("span", "", `${group.commits.length} 条公开提交`),
      );
      body.append(meta);
      row.append(body, element("span", "row-arrow", "↗"));
      container.append(row);
    }
    $("#show-more").hidden = filtered.length <= visibleRows;
  }
  function render() {
    const commits = snapshot.commits.filter(
      (commit) =>
        commit.day <= selectedDay &&
        (!selectedRepo || commit.repo === selectedRepo),
    );
    const count = new Set(commits.map((commit) => commit.day)).size;
    $("#activity-summary").textContent =
      `${count} 个活跃日 · ${commits.length} 条公开提交`;
    $("#timeline-date").textContent = dayLabel(selectedDay);
    $("#time-range").setAttribute("aria-valuetext", dayLabel(selectedDay));
    const bars = [...$("#activity-bars").children];
    const daily = new Map();
    for (const commit of snapshot.commits)
      if (!selectedRepo || commit.repo === selectedRepo)
        daily.set(commit.day, (daily.get(commit.day) || 0) + 1);
    const max = Math.max(1, ...daily.values());
    bars.forEach((bar) => {
      const count = daily.get(bar.dataset.day) || 0;
      bar.style.height = `${count ? 15 + Math.sqrt(count / max) * 85 : 5}%`;
      bar.classList.toggle("future", bar.dataset.day > selectedDay);
      bar.classList.toggle("active", bar.dataset.day === selectedDay);
    });
    renderSky();
    renderFootprints();
  }
  $("#show-more").addEventListener("click", () => {
    const previous = visibleRows;
    visibleRows += 6;
    renderFootprints();
    $("#footprint-list").children[previous]?.focus({ preventScroll: true });
  });
  $("#timeline-reset").addEventListener("click", () => {
    $("#time-range").value = 89;
    selectedDay = snapshot.end;
    visibleRows = 6;
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
      const days = Array.from({ length: 90 }, (_, i) =>
        new Date(Date.parse(snapshot.start + "T12:00:00Z") + i * 86400000)
          .toISOString()
          .slice(0, 10),
      );
      for (const day of days) {
        const bar = element("i");
        bar.dataset.day = day;
        $("#activity-bars").append(bar);
      }
      $(".timeline-labels").replaceChildren(
        ...[days[0], days[30], days[60], days[89]].map((day) =>
          element("span", "", day.slice(5).replace("-", ".")),
        ),
      );
      $("#time-range").addEventListener("input", (event) => {
        selectedDay = days[Number(event.target.value)];
        visibleRows = 6;
        render();
      });
      const updated = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(snapshot.generatedAt));
      const stale =
        Date.now() - Date.parse(snapshot.generatedAt) > 48 * 3600000;
      $("#snapshot-status").textContent =
        `${stale ? "历史快照" : "数据更新"} ${updated} · 北京时间\n每个星群展示最近 8 个活跃日`;
      $("#timeline").hidden = false;
      renderFilters();
      render();
    } catch (error) {
      $("#snapshot-status").textContent = "星图暂时没有连上，旧文依然在这里。";
      $("#footprint-list").replaceChildren();
      const link = element("a", "explore-link", "去 GitHub 看公开足迹 ↗");
      link.href = "https://github.com/boyan01";
      $("#footprint-list").append(link);
      console.error("Unable to load the public activity snapshot:", error);
    }
  }
  init();
})();
