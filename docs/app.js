const state = {
  view: "player",
  profiles: [],
  zones: [],
  similar: [],
  metrics: [],
  shotIndex: [],
  currentShots: [],
};

const fmt = (value, digits = 2) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "N/A";
};

const pct = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : "N/A";
};

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  return response.json();
}

async function init() {
  [state.profiles, state.zones, state.similar, state.metrics, state.shotIndex] =
    await Promise.all([
      loadJson("data/player_profiles.json"),
      loadJson("data/zone_profiles.json"),
      loadJson("data/similar_players.json"),
      loadJson("data/model_metrics.json"),
      loadJson("data/shot_index.json"),
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
    .map(
      (item) => `
        <div class="metric">
          <div class="label">${item.label}</div>
          <div class="value">${item.value}</div>
        </div>
      `
    )
    .join("");
}

function setContent(html) {
  document.getElementById("content").innerHTML = html;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
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

async function renderPlayerView() {
  const players = unique(state.profiles.map((d) => d.PLAYER_NAME));
  const player = document.getElementById("playerSelect")?.value || players[0];
  const seasons = unique(state.profiles.filter((d) => d.PLAYER_NAME === player).map((d) => d.SEASON));
  const season = document.getElementById("seasonSelect")?.value || seasons[seasons.length - 1];

  setControls(`
    <div class="control">
      <label>Player</label>
      <select id="playerSelect">${playerOptions(player)}</select>
    </div>
    <div class="control">
      <label>Season</label>
      <select id="seasonSelect">${seasonOptions(player, season)}</select>
    </div>
  `);

  document.getElementById("playerSelect").onchange = renderPlayerView;
  document.getElementById("seasonSelect").onchange = renderPlayerView;

  const profile = state.profiles.find((d) => d.PLAYER_NAME === player && d.SEASON === season);
  if (!profile) return;

  setSummary([
    { label: "Actual PPS", value: fmt(profile.actual_points_per_shot) },
    { label: "League Expected PPS", value: fmt(profile.league_expected_pps) },
    { label: "Player Expected PPS", value: fmt(profile.player_expected_pps) },
    { label: "Shot Making / 100", value: fmt(profile.shot_making_per_100) },
    { label: "Player Edge / 100", value: fmt(profile.player_adjusted_edge_per_100) },
    { label: "TS%", value: pct(profile.TS_PCT) },
    { label: "Usage%", value: pct(profile.USG_PCT) },
    { label: "Net Rating", value: fmt(profile.NET_RATING) },
  ]);

  setContent(`
    <div class="grid">
      <div class="panel"><div id="shotChart"></div></div>
      <div class="panel">
        <h3>Best / Worst Zones</h3>
        <p><strong>Best:</strong> ${profile.best_zone || "N/A"} (${fmt(profile.best_zone_shot_making_per_100)} per 100)</p>
        <p><strong>Worst:</strong> ${profile.worst_zone || "N/A"} (${fmt(profile.worst_zone_shot_making_per_100)} per 100)</p>
        <h3>Similar Players</h3>
        <div id="similarPlayers"></div>
      </div>
    </div>
    <div class="panel"><div id="zoneChart"></div></div>
    <div class="panel"><h3>Zone Table</h3><div id="zoneTable"></div></div>
  `);

  const shotMeta = state.shotIndex.find((d) => d.PLAYER_NAME === player && d.SEASON === season);
  const shots = shotMeta ? await loadJson(shotMeta.file) : [];
  drawShotChart(shots);

  const zoneData = state.zones.filter((d) => d.PLAYER_NAME === player && d.SEASON === season);
  drawZoneChart(zoneData);
  renderZoneTable(zoneData);

  renderSimilar(player, season);
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
    text: rows.map(
      (d) =>
        `${d.ACTION_TYPE}<br>${d.SHOT_ZONE_BASIC}<br>League EP: ${fmt(d.LEAGUE_EXPECTED_POINTS)}<br>Player EP: ${fmt(d.PLAYER_EXPECTED_POINTS)}`
    ),
    hoverinfo: "text",
  });

  Plotly.newPlot(
    "shotChart",
    [trace(misses, "Miss", "#dc2626"), trace(makes, "Make", "#16a34a")],
    {
      title: "Shot Chart",
      height: 660,
      plot_bgcolor: "#f8f4ea",
      paper_bgcolor: "#ffffff",
      shapes: courtShapes(),
      xaxis: { title: "", range: [-250, 250], showgrid: false, zeroline: false },
      yaxis: { title: "", range: [-60, 420], showgrid: false, zeroline: false, scaleanchor: "x", scaleratio: 1 },
      margin: { l: 20, r: 20, t: 40, b: 20 },
    },
    { responsive: true }
  );
}

function drawZoneChart(rows) {
  const sorted = [...rows].sort((a, b) => Number(b.league_expected_pps) - Number(a.league_expected_pps));

  Plotly.newPlot(
    "zoneChart",
    [
      {
        x: sorted.map((d) => d.SHOT_ZONE_BASIC),
        y: sorted.map((d) => d.actual_points_per_shot),
        type: "bar",
        name: "Actual PPS",
      },
      {
        x: sorted.map((d) => d.SHOT_ZONE_BASIC),
        y: sorted.map((d) => d.league_expected_pps),
        type: "bar",
        name: "League Expected PPS",
      },
      {
        x: sorted.map((d) => d.SHOT_ZONE_BASIC),
        y: sorted.map((d) => d.player_expected_pps),
        type: "bar",
        name: "Player Expected PPS",
      },
    ],
    {
      title: "Zone Shot Quality vs Results",
      barmode: "group",
      height: 430,
      margin: { l: 40, r: 20, t: 40, b: 100 },
    },
    { responsive: true }
  );
}

function renderZoneTable(rows) {
  const sorted = [...rows].sort((a, b) => Number(b.shot_making_per_100) - Number(a.shot_making_per_100));
  document.getElementById("zoneTable").innerHTML = table(
    sorted,
    ["SHOT_ZONE_BASIC", "attempts", "fg_pct", "actual_points_per_shot", "league_expected_pps", "player_expected_pps", "shot_making_per_100"]
  );
}

function renderSimilar(player, season) {
  const row = state.similar.find((d) => d.PLAYER_NAME === player && d.SEASON === season);
  let sims = row?.similar_players || [];
  if (typeof sims === "string") {
    try {
      sims = JSON.parse(sims.replaceAll("'", '"'));
    } catch {
      sims = [];
    }
  }
  document.getElementById("similarPlayers").innerHTML = sims.length
    ? table(sims, ["player", "season", "similarity"])
    : "<p>No similar players found.</p>";
}

function table(rows, cols) {
  return `
    <table>
      <thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows
          .map(
            (row) =>
              `<tr>${cols
                .map((c) => {
                  const value = row[c];
                  return `<td>${typeof value === "number" ? fmt(value) : value ?? ""}</td>`;
                })
                .join("")}</tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderCompareView() {
  const players = unique(state.profiles.map((d) => d.PLAYER_NAME));
  const player = document.getElementById("playerSelect")?.value || players[0];
  const metric = document.getElementById("metricSelect")?.value || "shot_making_per_100";

  const metrics = [
    "actual_points_per_shot",
    "league_expected_pps",
    "player_expected_pps",
    "shot_making_per_100",
    "player_adjusted_edge_per_100",
    "TS_PCT",
    "USG_PCT",
    "NET_RATING",
    "PIE",
  ];

  setControls(`
    <div class="control">
      <label>Player</label>
      <select id="playerSelect">${playerOptions(player)}</select>
    </div>
    <div class="control">
      <label>Metric</label>
      <select id="metricSelect">${metrics.map((m) => `<option value="${m}" ${m === metric ? "selected" : ""}>${m}</option>`).join("")}</select>
    </div>
  `);

  document.getElementById("playerSelect").onchange = renderCompareView;
  document.getElementById("metricSelect").onchange = renderCompareView;

  const rows = state.profiles.filter((d) => d.PLAYER_NAME === player).sort((a, b) => a.SEASON.localeCompare(b.SEASON));

  setSummary([]);
  setContent(`<div class="panel"><div id="compareChart"></div></div><div class="panel">${table(rows, ["SEASON", "shots", "actual_points_per_shot", "league_expected_pps", "player_expected_pps", "shot_making_per_100", "TS_PCT", "USG_PCT", "NET_RATING"])}</div>`);

  Plotly.newPlot(
    "compareChart",
    [
      {
        x: rows.map((d) => d.SEASON),
        y: rows.map((d) => d[metric]),
        type: "scatter",
        mode: "lines+markers",
        name: metric,
      },
    ],
    { title: `${player} - ${metric}`, height: 420 },
    { responsive: true }
  );
}

function renderLeagueView() {
  const seasons = unique(state.profiles.map((d) => d.SEASON));
  const season = document.getElementById("seasonSelect")?.value || seasons[seasons.length - 1];
  const metric = document.getElementById("metricSelect")?.value || "shot_making_per_100";
  const minShots = Number(document.getElementById("minShots")?.value || 300);

  const metrics = [
    "actual_points_per_shot",
    "league_expected_pps",
    "player_expected_pps",
    "shot_making_per_100",
    "player_adjusted_edge_per_100",
    "TS_PCT",
    "USG_PCT",
    "NET_RATING",
    "PIE",
  ];

  setControls(`
    <div class="control">
      <label>Season</label>
      <select id="seasonSelect">${allSeasonOptions(season)}</select>
    </div>
    <div class="control">
      <label>Metric</label>
      <select id="metricSelect">${metrics.map((m) => `<option value="${m}" ${m === metric ? "selected" : ""}>${m}</option>`).join("")}</select>
    </div>
    <div class="control">
      <label>Minimum shots</label>
      <input id="minShots" type="number" value="${minShots}" min="0" step="50" />
    </div>
  `);

  document.getElementById("seasonSelect").onchange = renderLeagueView;
  document.getElementById("metricSelect").onchange = renderLeagueView;
  document.getElementById("minShots").onchange = renderLeagueView;

  const rows = state.profiles
    .filter((d) => d.SEASON === season && Number(d.shots) >= minShots)
    .sort((a, b) => Number(b[metric]) - Number(a[metric]));

  setSummary([
    { label: "Players", value: rows.length },
    { label: "Avg Actual PPS", value: fmt(avg(rows, "actual_points_per_shot")) },
    { label: "Avg Expected PPS", value: fmt(avg(rows, "league_expected_pps")) },
    { label: "Avg Shot Making / 100", value: fmt(avg(rows, "shot_making_per_100")) },
  ]);

  setContent(`
    <div class="panel"><div id="leagueBar"></div></div>
    <div class="panel"><div id="leagueScatter"></div></div>
    <div class="panel">${table(rows, ["PLAYER_NAME", "SEASON", "shots", "actual_points_per_shot", "league_expected_pps", "player_expected_pps", "shot_making_per_100", "player_adjusted_edge_per_100", "TS_PCT", "USG_PCT", "NET_RATING"])}</div>
  `);

  const top = rows.slice(0, 30);

  Plotly.newPlot(
    "leagueBar",
    [
      {
        x: top.map((d) => d[metric]),
        y: top.map((d) => d.PLAYER_NAME),
        type: "bar",
        orientation: "h",
        marker: { color: "#2563eb" },
      },
    ],
    { title: `Top Players by ${metric}`, height: 760, yaxis: { autorange: "reversed" } },
    { responsive: true }
  );

  Plotly.newPlot(
    "leagueScatter",
    [
      {
        x: rows.map((d) => d.league_expected_pps),
        y: rows.map((d) => d.shot_making_per_100),
        text: rows.map((d) => d.PLAYER_NAME),
        mode: "markers",
        type: "scatter",
        marker: {
          size: rows.map((d) => Math.max(6, Math.sqrt(Number(d.shots)) / 2)),
          color: rows.map((d) => d.player_adjusted_edge_per_100),
          colorscale: "Viridis",
          showscale: true,
        },
        hovertemplate: "%{text}<br>Shot Quality: %{x:.2f}<br>Shot Making: %{y:.2f}<extra></extra>",
      },
    ],
    {
      title: "Shot Quality vs Shot Making",
      height: 540,
      xaxis: { title: "League Expected PPS" },
      yaxis: { title: "Shot Making / 100" },
    },
    { responsive: true }
  );
}

function avg(rows, col) {
  const nums = rows.map((d) => Number(d[col])).filter(Number.isFinite);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : NaN;
}

function renderVersusView() {
  const players = unique(state.profiles.map((d) => d.PLAYER_NAME));

  const playerA = document.getElementById("playerASelect")?.value || players[0];
  const playerB = document.getElementById("playerBSelect")?.value || players[1];

  const seasonsA = unique(state.profiles.filter((d) => d.PLAYER_NAME === playerA).map((d) => d.SEASON));
  const seasonsB = unique(state.profiles.filter((d) => d.PLAYER_NAME === playerB).map((d) => d.SEASON));

  const seasonA = document.getElementById("seasonASelect")?.value || seasonsA[seasonsA.length - 1];
  const seasonB = document.getElementById("seasonBSelect")?.value || seasonsB[seasonsB.length - 1];

  setControls(`
    <div class="control"><label>Player A</label><select id="playerASelect">${playerOptions(playerA)}</select></div>
    <div class="control"><label>Season A</label><select id="seasonASelect">${seasonOptions(playerA, seasonA)}</select></div>
    <div class="control"><label>Player B</label><select id="playerBSelect">${playerOptions(playerB)}</select></div>
    <div class="control"><label>Season B</label><select id="seasonBSelect">${seasonOptions(playerB, seasonB)}</select></div>
  `);

  document.getElementById("playerASelect").onchange = renderVersusView;
  document.getElementById("seasonASelect").onchange = renderVersusView;
  document.getElementById("playerBSelect").onchange = renderVersusView;
  document.getElementById("seasonBSelect").onchange = renderVersusView;

  const a = state.profiles.find((d) => d.PLAYER_NAME === playerA && d.SEASON === seasonA);
  const b = state.profiles.find((d) => d.PLAYER_NAME === playerB && d.SEASON === seasonB);

  if (!a || !b) {
    setContent("<div class='panel'>No comparison available.</div>");
    return;
  }

  const metrics = [
    "actual_points_per_shot",
    "league_expected_pps",
    "player_expected_pps",
    "shot_making_per_100",
    "player_adjusted_edge_per_100",
    "avg_league_make_prob",
    "avg_player_make_prob",
    "TS_PCT",
    "USG_PCT",
    "NET_RATING",
    "PIE",
  ];

  setSummary([
    { label: `${playerA} Shot Making`, value: fmt(a.shot_making_per_100) },
    { label: `${playerB} Shot Making`, value: fmt(b.shot_making_per_100) },
    { label: `${playerA} Shot Quality`, value: fmt(a.league_expected_pps) },
    { label: `${playerB} Shot Quality`, value: fmt(b.league_expected_pps) },
  ]);

  setContent(`
    <div class="panel"><div id="versusBars"></div></div>
    <div class="panel">
      ${table(
        metrics.map((metric) => ({
          metric,
          [playerA]: a[metric],
          [playerB]: b[metric],
          difference: Number(a[metric]) - Number(b[metric]),
        })),
        ["metric", playerA, playerB, "difference"]
      )}
    </div>
  `);

  Plotly.newPlot(
    "versusBars",
    [
      { x: metrics, y: metrics.map((m) => a[m]), type: "bar", name: `${playerA} ${seasonA}` },
      { x: metrics, y: metrics.map((m) => b[m]), type: "bar", name: `${playerB} ${seasonB}` },
    ],
    { title: "Player Comparison", barmode: "group", height: 520, margin: { l: 40, r: 20, t: 40, b: 130 } },
    { responsive: true }
  );
}

function renderModelsView() {
  setControls("");
  setSummary([]);
  setContent(`<div class="panel">${table(state.metrics, Object.keys(state.metrics[0] || {}))}</div><div class="panel"><div id="metricsChart"></div></div>`);

  Plotly.newPlot(
    "metricsChart",
    ["log_loss", "roc_auc", "brier"].map((metric) => ({
      x: state.metrics.map((d) => d.model),
      y: state.metrics.map((d) => d[metric]),
      type: "bar",
      name: metric,
    })),
    { title: "Model Metrics", barmode: "group", height: 430 },
    { responsive: true }
  );
}

function render() {
  if (state.view === "player") renderPlayerView();
  if (state.view === "compare") renderCompareView();
  if (state.view === "versus") renderVersusView();
  if (state.view === "league") renderLeagueView();
  if (state.view === "models") renderModelsView();
}
init().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<pre>${error.message}</pre>`;
});