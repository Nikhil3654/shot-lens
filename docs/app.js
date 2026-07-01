const state = {
  view: "versus",
  profiles: [],
  zones: [],
  similar: [],
  metrics: [],
  shotIndex: [],
  gameProfiles: [],
  projections: [],
  projectionMetrics: [],
  breakoutMetrics: [],
  calibrationMetrics: [],
  calibrationCurve: [],
};

const fmt = (value, digits = 2) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "N/A";
};

const pct = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : "N/A";
};

async function loadJson(path, fallback = []) {
  const response = await fetch(path);
  if (!response.ok) return fallback;
  return response.json();
}

async function init() {
  [
    state.profiles,
    state.zones,
    state.similar,
    state.metrics,
    state.shotIndex,
    state.gameProfiles,
    state.projections,
    state.projectionMetrics,
    state.breakoutMetrics,
    state.calibrationMetrics,
    state.calibrationCurve,
  ] = await Promise.all([
    loadJson("data/player_profiles.json"),
    loadJson("data/zone_profiles.json"),
    loadJson("data/similar_players.json"),
    loadJson("data/model_metrics.json"),
    loadJson("data/shot_index.json"),
    loadJson("data/player_game_profiles.json"),
    loadJson("data/player_projections.json"),
    loadJson("data/player_projection_metrics.json"),
    loadJson("data/breakout_metrics.json"),
    loadJson("data/calibration_metrics.json"),
    loadJson("data/calibration_curve.json"),
  ]);

  document.querySelectorAll("nav button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("nav button").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      state.view = button.dataset.view;
      render();
    });
  });

  render();
}

function setControls(html) {
  document.getElementById("controls").innerHTML = html;
}

function setSummary(items) {
  document.getElementById("summary").innerHTML = items
    .map((item) => `<div class="metric"><div class="label">${item.label}</div><div class="value">${item.value}</div></div>`)
    .join("");
}

function setContent(html) {
  document.getElementById("content").innerHTML = html;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function avg(rows, col) {
  const nums = rows.map((d) => Number(d[col])).filter(Number.isFinite);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : NaN;
}

function playerOptions(selected) {
  return unique(state.profiles.map((d) => d.PLAYER_NAME))
    .map((name) => `<option value="${name}" ${name === selected ? "selected" : ""}>${name}</option>`)
    .join("");
}

function seasonOptions(player, selected) {
  return unique(state.profiles.filter((d) => d.PLAYER_NAME === player).map((d) => d.SEASON))
    .map((season) => `<option value="${season}" ${season === selected ? "selected" : ""}>${season}</option>`)
    .join("");
}

function allSeasonOptions(selected) {
  return unique(state.profiles.map((d) => d.SEASON))
    .map((season) => `<option value="${season}" ${season === selected ? "selected" : ""}>${season}</option>`)
    .join("");
}

function table(rows, cols) {
  return `<table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${cols.map((c) => `<td>${typeof row[c] === "number" ? fmt(row[c]) : row[c] ?? ""}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function zscoreRows(rows, features) {
  const means = {};
  const stds = {};

  features.forEach((feature) => {
    const values = rows.map((row) => Number(row[feature])).filter(Number.isFinite);
    const mean = values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(values.length, 1);
    means[feature] = mean;
    stds[feature] = Math.sqrt(variance) || 1;
  });

  return rows.map((row) => features.map((feature) => {
    const value = Number(row[feature]);
    return Number.isFinite(value) ? (value - means[feature]) / stds[feature] : 0;
  }));
}

function courtShapes() {
  return [
    { type: "circle", xref: "x", yref: "y", x0: -7.5, y0: -7.5, x1: 7.5, y1: 7.5, line: { color: "#111827", width: 2 } },
    { type: "rect", xref: "x", yref: "y", x0: -30, y0: -7.5, x1: 30, y1: -6, line: { color: "#111827", width: 2 }, fillcolor: "#111827" },
    { type: "rect", xref: "x", yref: "y", x0: -80, y0: -47.5, x1: 80, y1: 143, line: { color: "#334155", width: 2 } },
    { type: "rect", xref: "x", yref: "y", x0: -60, y0: -47.5, x1: 60, y1: 143, line: { color: "#334155", width: 2 } },
    { type: "circle", xref: "x", yref: "y", x0: -60, y0: 83, x1: 60, y1: 203, line: { color: "#334155", width: 2 } },
    { type: "circle", xref: "x", yref: "y", x0: -40, y0: -40, x1: 40, y1: 40, line: { color: "#334155", width: 2 } },
    { type: "path", xref: "x", yref: "y", path: "M -220 -47.5 L -220 92.5", line: { color: "#334155", width: 2 } },
    { type: "path", xref: "x", yref: "y", path: "M 220 -47.5 L 220 92.5", line: { color: "#334155", width: 2 } },
    { type: "path", xref: "x", yref: "y", path: "M -220 92.5 Q 0 300 220 92.5", line: { color: "#334155", width: 2 } },
  ];
}

function renderVersusView() {
  const players = unique(state.profiles.map((d) => d.PLAYER_NAME));
  const playerA = document.getElementById("playerASelect")?.value || players[0];
  const playerB = document.getElementById("playerBSelect")?.value || players[1];
  const seasonsA = unique(state.profiles.filter((d) => d.PLAYER_NAME === playerA).map((d) => d.SEASON));
  const seasonsB = unique(state.profiles.filter((d) => d.PLAYER_NAME === playerB).map((d) => d.SEASON));
  const seasonA = document.getElementById("seasonASelect")?.value || seasonsA[seasonsA.length - 1];
  const seasonB = document.getElementById("seasonBSelect")?.value || seasonsB[seasonsB.length - 1];

  setControls(`<div class="control"><label>Player A</label><select id="playerASelect">${playerOptions(playerA)}</select></div><div class="control"><label>Season A</label><select id="seasonASelect">${seasonOptions(playerA, seasonA)}</select></div><div class="control"><label>Player B</label><select id="playerBSelect">${playerOptions(playerB)}</select></div><div class="control"><label>Season B</label><select id="seasonBSelect">${seasonOptions(playerB, seasonB)}</select></div>`);
  ["playerASelect", "seasonASelect", "playerBSelect", "seasonBSelect"].forEach((id) => document.getElementById(id).onchange = renderVersusView);

  const a = state.profiles.find((d) => d.PLAYER_NAME === playerA && d.SEASON === seasonA);
  const b = state.profiles.find((d) => d.PLAYER_NAME === playerB && d.SEASON === seasonB);
  if (!a || !b) return;

  const metrics = ["actual_points_per_shot", "league_expected_pps", "player_expected_pps", "shot_making_per_100", "player_adjusted_edge_per_100", "TS_PCT", "USG_PCT", "NET_RATING", "PIE"];

  setSummary([
    { label: `${playerA} Shot Making`, value: fmt(a.shot_making_per_100) },
    { label: `${playerB} Shot Making`, value: fmt(b.shot_making_per_100) },
    { label: `${playerA} Shot Quality`, value: fmt(a.league_expected_pps) },
    { label: `${playerB} Shot Quality`, value: fmt(b.league_expected_pps) },
  ]);

  setContent(`<div class="panel"><div id="versusBars"></div></div><div class="panel">${table(metrics.map((m) => ({ metric: m, [playerA]: a[m], [playerB]: b[m], difference: Number(a[m]) - Number(b[m]) })), ["metric", playerA, playerB, "difference"])}</div>`);

  Plotly.newPlot("versusBars", [
    { x: metrics, y: metrics.map((m) => a[m]), type: "bar", name: `${playerA} ${seasonA}` },
    { x: metrics, y: metrics.map((m) => b[m]), type: "bar", name: `${playerB} ${seasonB}` },
  ], { title: "Player Comparison", barmode: "group", height: 520, margin: { l: 40, r: 20, t: 40, b: 130 } }, { responsive: true });
}

function renderLeagueView() {
  const seasons = unique(state.profiles.map((d) => d.SEASON));
  const season = document.getElementById("seasonSelect")?.value || seasons[seasons.length - 1];
  const metric = document.getElementById("metricSelect")?.value || "shot_making_per_100";
  const minShots = Number(document.getElementById("minShots")?.value || 300);
  const metrics = ["actual_points_per_shot", "league_expected_pps", "player_expected_pps", "shot_making_per_100", "player_adjusted_edge_per_100", "TS_PCT", "USG_PCT", "NET_RATING", "PIE"];

  setControls(`<div class="control"><label>Season</label><select id="seasonSelect">${allSeasonOptions(season)}</select></div><div class="control"><label>Metric</label><select id="metricSelect">${metrics.map((m) => `<option value="${m}" ${m === metric ? "selected" : ""}>${m}</option>`).join("")}</select></div><div class="control"><label>Minimum shots</label><input id="minShots" type="number" value="${minShots}" min="0" step="50" /></div>`);
  ["seasonSelect", "metricSelect", "minShots"].forEach((id) => document.getElementById(id).onchange = renderLeagueView);

  const rows = state.profiles.filter((d) => d.SEASON === season && Number(d.shots) >= minShots).sort((a, b) => Number(b[metric]) - Number(a[metric]));
  const top = rows.slice(0, 30);

  setSummary([
    { label: "Players", value: rows.length },
    { label: "Avg Actual PPS", value: fmt(avg(rows, "actual_points_per_shot")) },
    { label: "Avg Expected PPS", value: fmt(avg(rows, "league_expected_pps")) },
    { label: "Avg Shot Making / 100", value: fmt(avg(rows, "shot_making_per_100")) },
  ]);

  setContent(`<div class="panel"><div id="leagueBar"></div></div><div class="panel"><div id="leagueScatter"></div></div><div class="panel">${table(rows, ["PLAYER_NAME", "SEASON", "shots", "actual_points_per_shot", "league_expected_pps", "player_expected_pps", "shot_making_per_100", "player_adjusted_edge_per_100", "TS_PCT", "USG_PCT", "NET_RATING"])}</div>`);

  Plotly.newPlot("leagueBar", [{ x: top.map((d) => d[metric]), y: top.map((d) => d.PLAYER_NAME), type: "bar", orientation: "h", marker: { color: "#2563eb" } }], { title: `Top Players by ${metric}`, height: 760, yaxis: { autorange: "reversed" } }, { responsive: true });

  Plotly.newPlot("leagueScatter", [{ x: rows.map((d) => d.league_expected_pps), y: rows.map((d) => d.shot_making_per_100), text: rows.map((d) => d.PLAYER_NAME), mode: "markers", type: "scatter", marker: { size: rows.map((d) => Math.max(6, Math.sqrt(Number(d.shots)) / 2)), color: rows.map((d) => d.player_adjusted_edge_per_100), colorscale: "Viridis", showscale: true }, hovertemplate: "%{text}<br>Shot Quality: %{x:.2f}<br>Shot Making: %{y:.2f}<extra></extra>" }], { title: "Shot Quality vs Shot Making", height: 540, xaxis: { title: "League Expected PPS" }, yaxis: { title: "Shot Making / 100" } }, { responsive: true });
}

function renderCompareView() {
  const players = unique(state.profiles.map((d) => d.PLAYER_NAME));
  const player = document.getElementById("playerSelect")?.value || players[0];
  const metric = document.getElementById("metricSelect")?.value || "shot_making_per_100";
  const metrics = ["actual_points_per_shot", "league_expected_pps", "player_expected_pps", "shot_making_per_100", "player_adjusted_edge_per_100", "TS_PCT", "USG_PCT", "NET_RATING", "PIE"];

  setControls(`<div class="control"><label>Player</label><select id="playerSelect">${playerOptions(player)}</select></div><div class="control"><label>Metric</label><select id="metricSelect">${metrics.map((m) => `<option value="${m}" ${m === metric ? "selected" : ""}>${m}</option>`).join("")}</select></div>`);
  document.getElementById("playerSelect").onchange = renderCompareView;
  document.getElementById("metricSelect").onchange = renderCompareView;

  const rows = state.profiles.filter((d) => d.PLAYER_NAME === player).sort((a, b) => a.SEASON.localeCompare(b.SEASON));
  setSummary([]);
  setContent(`<div class="panel"><div id="compareChart"></div></div><div class="panel">${table(rows, ["SEASON", "shots", "actual_points_per_shot", "league_expected_pps", "player_expected_pps", "shot_making_per_100", "TS_PCT", "USG_PCT", "NET_RATING"])}</div>`);
  Plotly.newPlot("compareChart", [{ x: rows.map((d) => d.SEASON), y: rows.map((d) => d[metric]), type: "scatter", mode: "lines+markers", name: metric }], { title: `${player} - ${metric}`, height: 420 }, { responsive: true });
}

function renderTrendsView() {
  const players = unique(state.gameProfiles.map((d) => d.PLAYER_NAME));
  const player = document.getElementById("trendPlayerSelect")?.value || players[0];
  const seasons = unique(state.gameProfiles.filter((d) => d.PLAYER_NAME === player).map((d) => d.SEASON));
  const season = document.getElementById("trendSeasonSelect")?.value || seasons[seasons.length - 1];

  setControls(`<div class="control"><label>Player</label><select id="trendPlayerSelect">${playerOptions(player)}</select></div><div class="control"><label>Season</label><select id="trendSeasonSelect">${seasonOptions(player, season)}</select></div>`);
  document.getElementById("trendPlayerSelect").onchange = renderTrendsView;
  document.getElementById("trendSeasonSelect").onchange = renderTrendsView;

  const rows = state.gameProfiles.filter((d) => d.PLAYER_NAME === player && d.SEASON === season).sort((a, b) => String(a.GAME_DATE).localeCompare(String(b.GAME_DATE)));

  setSummary([
    { label: "Games", value: rows.length },
    { label: "Avg Actual PPS", value: fmt(avg(rows, "actual_points_per_shot")) },
    { label: "Avg Expected PPS", value: fmt(avg(rows, "league_expected_pps")) },
    { label: "Avg Shot Making / 100", value: fmt(avg(rows, "shot_making_per_100")) },
  ]);

  setContent(`<div class="panel"><div id="trendPpsChart"></div></div><div class="panel"><div id="trendShotMakingChart"></div></div><div class="panel">${table(rows, ["GAME_DATE", "shots", "actual_points_per_shot", "league_expected_pps", "player_expected_pps", "shot_making_per_100", "rolling_5_shot_making_per_100"])}</div>`);

  Plotly.newPlot("trendPpsChart", [
    { x: rows.map((d) => d.GAME_DATE), y: rows.map((d) => d.actual_points_per_shot), type: "scatter", mode: "lines+markers", name: "Actual PPS" },
    { x: rows.map((d) => d.GAME_DATE), y: rows.map((d) => d.league_expected_pps), type: "scatter", mode: "lines+markers", name: "League Expected PPS" },
    { x: rows.map((d) => d.GAME_DATE), y: rows.map((d) => d.player_expected_pps), type: "scatter", mode: "lines+markers", name: "Player Expected PPS" },
  ], { title: `${player} ${season} - Points Per Shot Trend`, height: 430 }, { responsive: true });

  Plotly.newPlot("trendShotMakingChart", [
    { x: rows.map((d) => d.GAME_DATE), y: rows.map((d) => d.shot_making_per_100), type: "bar", name: "Game Shot Making / 100", marker: { color: "#94a3b8" } },
    { x: rows.map((d) => d.GAME_DATE), y: rows.map((d) => d.rolling_5_shot_making_per_100), type: "scatter", mode: "lines", name: "Rolling 5-game", line: { color: "#2563eb", width: 3 } },
  ], { title: `${player} ${season} - Shot Making Trend`, height: 430 }, { responsive: true });
}

function renderProjectionView() {
  if (!state.projections.length) {
    setControls("");
    setSummary([]);
    setContent("<div class='panel'><h3>Projection data missing</h3><p class='note'>Run the player projection notebook and export player_projections.json.</p></div>");
    return;
  }

  const players = unique(state.projections.map((d) => d.PLAYER_NAME));
  const player = document.getElementById("projectionPlayerSelect")?.value || players[0];
  const row = state.projections.find((d) => d.PLAYER_NAME === player);

  setControls(`<div class="control"><label>Player</label><select id="projectionPlayerSelect">${players.map((p) => `<option value="${p}" ${p === player ? "selected" : ""}>${p}</option>`).join("")}</select></div>`);
  document.getElementById("projectionPlayerSelect").onchange = renderProjectionView;

  const metrics = [
    ["Current Actual PPS", row.actual_points_per_shot],
    ["Projected Actual PPS", row.projected_next_actual_points_per_shot],
    ["Current Shot Making / 100", row.shot_making_per_100],
    ["Projected Shot Making / 100", row.projected_next_shot_making_per_100],
    ["Current Player Edge / 100", row.player_adjusted_edge_per_100],
    ["Projected Player Edge / 100", row.projected_next_player_adjusted_edge_per_100],
  ];

  setSummary([
    { label: "Base Season", value: row.SEASON },
    { label: "Breakout Probability", value: pct(row.breakout_probability) },
    { label: "Projected TS%", value: pct(row.projected_next_TS_PCT) },
    { label: "Projected Usage%", value: pct(row.projected_next_USG_PCT) },
  ]);

  setContent(`<div class="two-col"><div class="panel"><div id="projectionBars"></div></div><div class="panel"><h3>Projection Snapshot</h3><p><span class="badge">${player}</span></p>${table([row], ["PLAYER_NAME", "SEASON", "shots", "actual_points_per_shot", "projected_next_actual_points_per_shot", "shot_making_per_100", "projected_next_shot_making_per_100", "breakout_probability"])}</div></div><div class="panel"><h3>Projection Model Metrics</h3>${table(state.projectionMetrics, Object.keys(state.projectionMetrics[0] || {}))}</div>`);

  Plotly.newPlot("projectionBars", [
    { x: metrics.map((d) => d[0]), y: metrics.map((d) => d[1]), type: "bar", marker: { color: "#2563eb" } },
  ], { title: "Current vs Projected Scoring Indicators", height: 520, margin: { l: 40, r: 20, t: 40, b: 150 } }, { responsive: true });
}

function renderSimilarityView() {
  const players = unique(state.profiles.map((d) => d.PLAYER_NAME));
  const player = document.getElementById("simPlayerSelect")?.value || players[0];
  const seasons = unique(state.profiles.filter((d) => d.PLAYER_NAME === player).map((d) => d.SEASON));
  const season = document.getElementById("simSeasonSelect")?.value || seasons[seasons.length - 1];
  const mode = document.getElementById("simModeSelect")?.value || "overall";

  const featureSets = {
    overall: ["actual_points_per_shot", "league_expected_pps", "player_expected_pps", "shot_making_per_100", "player_adjusted_edge_per_100", "TS_PCT", "USG_PCT", "NET_RATING", "PIE"],
    shot_diet: ["rim_rate", "paint_non_ra_rate", "midrange_rate", "corner_3_rate", "above_break_3_rate", "three_point_rate", "avg_shot_distance"],
    shot_making: ["actual_points_per_shot", "league_expected_pps", "player_expected_pps", "shot_making_per_100", "player_adjusted_edge_per_100", "avg_league_make_prob", "avg_player_make_prob"],
    impact: ["TS_PCT", "USG_PCT", "OFF_RATING", "DEF_RATING", "NET_RATING", "AST_PCT", "REB_PCT", "PIE"],
  };

  setControls(`<div class="control"><label>Player</label><select id="simPlayerSelect">${playerOptions(player)}</select></div><div class="control"><label>Season</label><select id="simSeasonSelect">${seasonOptions(player, season)}</select></div><div class="control"><label>Similarity Mode</label><select id="simModeSelect">${Object.keys(featureSets).map((m) => `<option value="${m}" ${m === mode ? "selected" : ""}>${m}</option>`).join("")}</select></div>`);
  ["simPlayerSelect", "simSeasonSelect", "simModeSelect"].forEach((id) => document.getElementById(id).onchange = renderSimilarityView);

  const features = featureSets[mode].filter((f) => state.profiles.some((row) => row[f] !== undefined));
  const rows = state.profiles.filter((row) => row.shots >= 100);
  const selectedIndex = rows.findIndex((row) => row.PLAYER_NAME === player && row.SEASON === season);

  if (selectedIndex < 0) {
    setSummary([]);
    setContent("<div class='panel'>No similarity data found.</div>");
    return;
  }

  const vectors = zscoreRows(rows, features);
  const selectedVector = vectors[selectedIndex];

  const sims = rows
    .map((row, i) => ({
      player: row.PLAYER_NAME,
      season: row.SEASON,
      shots: row.shots,
      similarity: cosineSimilarity(selectedVector, vectors[i]),
      actual_points_per_shot: row.actual_points_per_shot,
      league_expected_pps: row.league_expected_pps,
      shot_making_per_100: row.shot_making_per_100,
      player_adjusted_edge_per_100: row.player_adjusted_edge_per_100,
    }))
    .filter((row) => !(row.player === player && row.season === season))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 15);

  setSummary([
    { label: "Mode", value: mode },
    { label: "Features", value: features.length },
    { label: "Candidates", value: rows.length },
    { label: "Top Match", value: sims[0]?.player || "N/A" },
  ]);

  setContent(`<div class="panel"><h3>Most Similar Players</h3>${table(sims, ["player", "season", "similarity", "shots", "actual_points_per_shot", "league_expected_pps", "shot_making_per_100", "player_adjusted_edge_per_100"])}</div><div class="panel"><div id="similarityScatter"></div></div>`);

  Plotly.newPlot("similarityScatter", [{
    x: sims.map((d) => d.league_expected_pps),
    y: sims.map((d) => d.shot_making_per_100),
    text: sims.map((d) => `${d.player} ${d.season}`),
    mode: "markers",
    type: "scatter",
    marker: { size: sims.map((d) => 10 + d.similarity * 12), color: sims.map((d) => d.similarity), colorscale: "Viridis", showscale: true },
    hovertemplate: "%{text}<br>Shot Quality: %{x:.2f}<br>Shot Making: %{y:.2f}<extra></extra>",
  }], { title: "Similar Players: Shot Quality vs Shot Making", height: 500, xaxis: { title: "League Expected PPS" }, yaxis: { title: "Shot Making / 100" } }, { responsive: true });
}

async function renderPlayerView() {
  const players = unique(state.profiles.map((d) => d.PLAYER_NAME));
  const player = document.getElementById("playerSelect")?.value || players[0];
  const seasons = unique(state.profiles.filter((d) => d.PLAYER_NAME === player).map((d) => d.SEASON));
  const season = document.getElementById("seasonSelect")?.value || seasons[seasons.length - 1];

  setControls(`<div class="control"><label>Player</label><select id="playerSelect">${playerOptions(player)}</select></div><div class="control"><label>Season</label><select id="seasonSelect">${seasonOptions(player, season)}</select></div>`);
  document.getElementById("playerSelect").onchange = renderPlayerView;
  document.getElementById("seasonSelect").onchange = renderPlayerView;

  const profile = state.profiles.find((d) => d.PLAYER_NAME === player && d.SEASON === season);
  if (!profile) return;

  setSummary([
    { label: "Actual PPS", value: fmt(profile.actual_points_per_shot) },
    { label: "League Expected PPS", value: fmt(profile.league_expected_pps) },
    { label: "Shot Making / 100", value: fmt(profile.shot_making_per_100) },
    { label: "Player Edge / 100", value: fmt(profile.player_adjusted_edge_per_100) },
  ]);

  setContent(`<div class="grid"><div class="panel"><div id="shotChart"></div></div><div class="panel"><h3>Best / Worst Zones</h3><p><strong>Best:</strong> ${profile.best_zone || "N/A"} (${fmt(profile.best_zone_shot_making_per_100)} per 100)</p><p><strong>Worst:</strong> ${profile.worst_zone || "N/A"} (${fmt(profile.worst_zone_shot_making_per_100)} per 100)</p><h3>Similar Players</h3><div id="similarPlayers"></div></div></div><div class="panel"><div id="zoneChart"></div></div><div class="panel"><h3>Zone Table</h3><div id="zoneTable"></div></div>`);

  const shotMeta = state.shotIndex.find((d) => d.PLAYER_NAME === player && d.SEASON === season);
  const shots = shotMeta ? await loadJson(shotMeta.file) : [];
  drawShotChart(shots);

  const zoneData = state.zones.filter((d) => d.PLAYER_NAME === player && d.SEASON === season);
  drawZoneChart(zoneData);
  document.getElementById("zoneTable").innerHTML = table(zoneData, ["SHOT_ZONE_BASIC", "attempts", "actual_points_per_shot", "league_expected_pps", "player_expected_pps", "shot_making_per_100"]);
  renderSimilar(player, season);
}

function drawShotChart(shots) {
  const makes = shots.filter((d) => Number(d.SHOT_MADE_FLAG) === 1);
  const misses = shots.filter((d) => Number(d.SHOT_MADE_FLAG) === 0);
  const trace = (rows, name, color) => ({
    x: rows.map((d) => d.LOC_X),
    y: rows.map((d) => d.LOC_Y),
    mode: "markers",
    type: "scatter",
    name,
    marker: { color, size: 7, opacity: 0.7, line: { color: "white", width: 0.5 } },
    text: rows.map((d) => `${d.ACTION_TYPE}<br>${d.SHOT_ZONE_BASIC}<br>League EP: ${fmt(d.LEAGUE_EXPECTED_POINTS)}<br>Player EP: ${fmt(d.PLAYER_EXPECTED_POINTS)}`),
    hoverinfo: "text",
  });

  Plotly.newPlot("shotChart", [trace(misses, "Miss", "#dc2626"), trace(makes, "Make", "#16a34a")], {
    title: "Shot Detail",
    height: 660,
    plot_bgcolor: "#f8f4ea",
    paper_bgcolor: "#ffffff",
    shapes: courtShapes(),
    xaxis: { title: "", range: [-250, 250], showgrid: false, zeroline: false },
    yaxis: { title: "", range: [-60, 420], showgrid: false, zeroline: false, scaleanchor: "x", scaleratio: 1 },
    margin: { l: 20, r: 20, t: 40, b: 20 },
  }, { responsive: true });
}

function drawZoneChart(rows) {
  const sorted = [...rows].sort((a, b) => Number(b.league_expected_pps) - Number(a.league_expected_pps));
  Plotly.newPlot("zoneChart", [
    { x: sorted.map((d) => d.SHOT_ZONE_BASIC), y: sorted.map((d) => d.actual_points_per_shot), type: "bar", name: "Actual PPS" },
    { x: sorted.map((d) => d.SHOT_ZONE_BASIC), y: sorted.map((d) => d.league_expected_pps), type: "bar", name: "League Expected PPS" },
    { x: sorted.map((d) => d.SHOT_ZONE_BASIC), y: sorted.map((d) => d.player_expected_pps), type: "bar", name: "Player Expected PPS" },
  ], { title: "Zone Shot Quality vs Results", barmode: "group", height: 430, margin: { l: 40, r: 20, t: 40, b: 100 } }, { responsive: true });
}

function renderSimilar(player, season) {
  const row = state.similar.find((d) => d.PLAYER_NAME === player && d.SEASON === season);
  let sims = row?.similar_players || [];
  if (typeof sims === "string") {
    try { sims = JSON.parse(sims.replaceAll("'", '"')); } catch { sims = []; }
  }
  document.getElementById("similarPlayers").innerHTML = sims.length ? table(sims, ["player", "season", "similarity"]) : "<p>No similar players found.</p>";
}

function renderCalibrationView() {
  if (!state.calibrationCurve.length && !state.calibrationMetrics.length) {
    setControls("");
    setSummary([]);
    setContent("<div class='panel'><h3>Calibration data missing</h3><p class='note'>Export calibration_metrics.json and calibration_curve.json first.</p></div>");
    return;
  }

  setControls("");
  setSummary([
    { label: "Curve Rows", value: state.calibrationCurve.length },
    { label: "Metric Rows", value: state.calibrationMetrics.length },
    { label: "Purpose", value: "Expected value quality" },
    { label: "Best Use", value: "Probability trust" },
  ]);

  setContent(`<div class="panel"><div id="calibrationChart"></div></div><div class="panel"><h3>Calibration Metrics</h3>${table(state.calibrationMetrics, Object.keys(state.calibrationMetrics[0] || {}))}</div>`);

  const models = unique(state.calibrationCurve.map((d) => d.model));
  const traces = models.map((model) => {
    const rows = state.calibrationCurve.filter((d) => d.model === model);
    return {
      x: rows.map((d) => d.predicted_prob),
      y: rows.map((d) => d.actual_make_rate),
      mode: "lines+markers",
      type: "scatter",
      name: model,
    };
  });

  traces.push({
    x: [0, 1],
    y: [0, 1],
    mode: "lines",
    type: "scatter",
    name: "Perfect calibration",
    line: { dash: "dash", color: "#64748b" },
  });

  Plotly.newPlot("calibrationChart", traces, {
    title: "Predicted Make Probability vs Actual Make Rate",
    height: 540,
    xaxis: { title: "Predicted probability" },
    yaxis: { title: "Actual make rate" },
  }, { responsive: true });
}

function renderModelsView() {
  setControls("");
  setSummary([]);
  const tables = [`<div class="panel"><h3>Shot Model Metrics</h3>${table(state.metrics, Object.keys(state.metrics[0] || {}))}</div>`];
  if (state.breakoutMetrics.length) tables.push(`<div class="panel"><h3>Breakout Model Metrics</h3>${table(state.breakoutMetrics, Object.keys(state.breakoutMetrics[0] || {}))}</div>`);
  setContent(tables.join(""));
}

function render() {
  if (state.view === "versus") renderVersusView();
  if (state.view === "league") renderLeagueView();
  if (state.view === "trends") renderTrendsView();
  if (state.view === "projection") renderProjectionView();
  if (state.view === "similarity") renderSimilarityView();
  if (state.view === "calibration") renderCalibrationView();
  if (state.view === "player") renderPlayerView();
  if (state.view === "models") renderModelsView();
}

init().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<pre>${error.message}</pre>`;
});