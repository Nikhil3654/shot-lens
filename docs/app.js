const state = {
  view: "versus",
  profiles: [],
  similar: [],
  metrics: [],
  projections: [],
  projectionMetrics: [],
  breakoutMetrics: [],
  calibrationMetrics: [],
  calibrationCurve: [],
  shotIndex: [],
  ui: {
    playerA: null,
    seasonA: null,
    playerB: null,
    seasonB: null,
    leagueSeason: null,
    rankingPreset: "Scoring Value",
    minShots: 150,
    minUsage: 0,
    minTs: 0,
    maxAge: 45,
    minBreakout: 0,
    trendPlayer: null,
    trendSeason: null,
    projectionSeason: null,
    similarityPlayer: null,
    similaritySeason: null,
    shotPlayer: null,
    shotSeason: null,
  },
};

const lazyData = {
  shotIndex: null,
  calibrationMetrics: null,
  calibrationCurve: null,
};

const playerDataCache = new Map();
const shotFileCache = new Map();

const rankingPresets = {
  "Scoring Value": {
    actual_points_per_shot: 0.25,
    TS_PCT: 0.2,
    shot_making_per_100_stable: 0.25,
    player_adjusted_edge_per_100_stable: 0.2,
    USG_PCT: 0.1,
  },
  "Shot Creation": {
    USG_PCT: 0.25,
    player_adjusted_edge_per_100_stable: 0.25,
    shot_making_per_100_stable: 0.2,
    PCT_UAST_FGM: 0.15,
    avg_shot_distance: 0.15,
  },
  "Efficient Role Scorer": {
    TS_PCT: 0.3,
    league_expected_pps: 0.25,
    actual_points_per_shot: 0.25,
    shot_making_per_100_stable: 0.2,
  },
  "Breakout Watch": {
    breakout_probability: 0.35,
    projected_next_shot_making_per_100: 0.25,
    projected_next_actual_points_per_shot: 0.2,
    player_adjusted_edge_per_100_stable: 0.2,
  },
  "Overall Impact": {
    PIE: 0.25,
    NET_RATING: 0.25,
    TS_PCT: 0.15,
    USG_PCT: 0.1,
    shot_making_per_100_stable: 0.15,
    player_adjusted_edge_per_100_stable: 0.1,
  },
  "Scoring Value Score": {
    scoring_value_score: 1,
  },
  "All Around Value Score": {
    all_around_value_score: 1,
  },
};

async function loadJson(path) {
  const response = await fetch(path, { cache: "force-cache" });

  if (!response.ok) {
    throw new Error(`Could not load ${path}`);
  }

  return response.json();
}

async function loadOptionalJson(path, fallback = []) {
  try {
    return await loadJson(path);
  } catch {
    return fallback;
  }
}

async function loadLazyData(key, path) {
  if (lazyData[key]) return lazyData[key];

  lazyData[key] = loadOptionalJson(path, []);
  return lazyData[key];
}

async function ensureShotIndexLoaded() {
  state.shotIndex = await loadLazyData("shotIndex", "data/shot_index.json");
}

async function ensureCalibrationLoaded() {
  [state.calibrationMetrics, state.calibrationCurve] = await Promise.all([
    loadLazyData("calibrationMetrics", "data/calibration_metrics.json"),
    loadLazyData("calibrationCurve", "data/calibration_curve.json"),
  ]);
}

function playerFolder(playerId) {
  return `data/players/${playerId}`;
}

function safeSeason(season) {
  return String(season).replace("/", "-");
}

async function loadPlayerSeasonFile(playerId, season, kind) {
  const key = `${kind}:${playerId}:${season}`;

  if (playerDataCache.has(key)) {
    return playerDataCache.get(key);
  }

  const path = `${playerFolder(playerId)}/${kind}_${safeSeason(season)}.json`;
  const promise = loadOptionalJson(path, []);

  playerDataCache.set(key, promise);
  return promise;
}

async function loadPlayerGames(playerId, season) {
  return loadPlayerSeasonFile(playerId, season, "games");
}

async function loadPlayerZones(playerId, season) {
  return loadPlayerSeasonFile(playerId, season, "zones");
}

async function loadShotFile(playerId, season) {
  await ensureShotIndexLoaded();

  const hit = state.shotIndex.find(
    (row) =>
      String(row.PLAYER_ID) === String(playerId) &&
      String(row.SEASON) === String(season)
  );

  if (!hit || !hit.path) return [];

  if (shotFileCache.has(hit.path)) return shotFileCache.get(hit.path);

  const promise = loadOptionalJson(hit.path, []);
  shotFileCache.set(hit.path, promise);

  return promise;
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function fmt(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toFixed(digits);
}

function pct(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${(number * 100).toFixed(digits)}%`;
}

function signed(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number >= 0 ? "+" : ""}${number.toFixed(digits)}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function latestSeason() {
  const seasons = unique(state.profiles.map((row) => row.SEASON)).sort();
  return seasons[seasons.length - 1] || null;
}

function playerNames() {
  return unique(state.profiles.map((row) => row.PLAYER_NAME)).sort();
}

function seasonsForPlayer(playerName, source = state.profiles) {
  return unique(
    source
      .filter((row) => row.PLAYER_NAME === playerName)
      .map((row) => row.SEASON)
  ).sort();
}

function validSeasonForPlayer(playerName, selectedSeason, source = state.profiles) {
  const seasons = seasonsForPlayer(playerName, source);
  if (seasons.includes(selectedSeason)) return selectedSeason;
  return seasons[seasons.length - 1] || null;
}

function playerOptions(selected) {
  return playerNames()
    .map(
      (name) =>
        `<option value="${escapeHtml(name)}" ${
          name === selected ? "selected" : ""
        }>${escapeHtml(name)}</option>`
    )
    .join("");
}

function seasonOptionsForPlayer(playerName, selected) {
  return seasonsForPlayer(playerName)
    .map(
      (season) =>
        `<option value="${season}" ${
          season === selected ? "selected" : ""
        }>${season}</option>`
    )
    .join("");
}

function seasonOptions(selected) {
  return unique(state.profiles.map((row) => row.SEASON))
    .sort()
    .map(
      (season) =>
        `<option value="${season}" ${
          season === selected ? "selected" : ""
        }>${season}</option>`
    )
    .join("");
}

function profileRow(playerName, season) {
  return state.profiles.find(
    (row) => row.PLAYER_NAME === playerName && row.SEASON === season
  );
}

function profileByIdSeason(playerId, season) {
  return state.profiles.find(
    (row) => String(row.PLAYER_ID) === String(playerId) && row.SEASON === season
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function zscoreRows(rows, features) {
  const stats = features.map((feature) => {
    const values = rows.map((row) => numberValue(row[feature]));
    const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      Math.max(values.length, 1);
    const std = Math.sqrt(variance) || 1;
    return { mean, std };
  });

  return rows.map((row) =>
    features.map((feature, index) => {
      const value = numberValue(row[feature]);
      return (value - stats[index].mean) / stats[index].std;
    })
  );
}

function addStableMetrics() {
  const k = 300;

  state.profiles = state.profiles.map((row) => {
    const shots = numberValue(row.shots);
    const weight = shots / (shots + k);

    return {
      ...row,
      shot_making_per_100_stable:
        numberValue(row.shot_making_per_100) * weight,
      player_adjusted_edge_per_100_stable:
        numberValue(row.player_adjusted_edge_per_100) * weight,
    };
  });
}

function mergeProjectionFieldsIntoProfiles() {
  if (!state.projections.length) return;

  const byPlayer = new Map(
    state.projections.map((row) => [String(row.PLAYER_ID), row])
  );

  state.profiles = state.profiles.map((row) => {
    const projection = byPlayer.get(String(row.PLAYER_ID));
    if (!projection) return row;

    const projectedFields = {};

    Object.keys(projection).forEach((key) => {
      if (key.startsWith("projected_next_") || key === "breakout_probability") {
        projectedFields[key] = projection[key];
      }
    });

    projectedFields.projection_base_season = projection.SEASON;

    return {
      ...row,
      ...projectedFields,
    };
  });
}

function addValueScores() {
  const features = [
    "TS_PCT",
    "USG_PCT",
    "NET_RATING",
    "PIE",
    "actual_points_per_shot",
    "league_expected_pps",
    "shot_making_per_100_stable",
    "player_adjusted_edge_per_100_stable",
  ];

  const vectors = zscoreRows(state.profiles, features);

  state.profiles = state.profiles.map((row, index) => {
    const values = Object.fromEntries(
      features.map((feature, featureIndex) => [
        feature,
        vectors[index][featureIndex],
      ])
    );

    const scoring_value_score =
      values.actual_points_per_shot * 0.22 +
      values.TS_PCT * 0.18 +
      values.shot_making_per_100_stable * 0.22 +
      values.player_adjusted_edge_per_100_stable * 0.18 +
      values.USG_PCT * 0.1 +
      values.league_expected_pps * 0.1;

    const all_around_value_score =
      values.PIE * 0.25 +
      values.NET_RATING * 0.22 +
      values.TS_PCT * 0.16 +
      values.USG_PCT * 0.1 +
      values.actual_points_per_shot * 0.12 +
      values.shot_making_per_100_stable * 0.15;

    return {
      ...row,
      scoring_value_score,
      all_around_value_score,
    };
  });
}

function percentileRank(values, value) {
  const clean = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const number = Number(value);

  if (!Number.isFinite(number) || !clean.length) return null;

  const below = clean.filter((v) => v <= number).length;
  return below / clean.length;
}

function addSeasonPercentiles() {
  const percentileMetrics = [
    "actual_points_per_shot",
    "league_expected_pps",
    "player_expected_pps",
    "shot_making_per_100_stable",
    "player_adjusted_edge_per_100_stable",
    "TS_PCT",
    "USG_PCT",
    "NET_RATING",
    "PIE",
    "scoring_value_score",
    "all_around_value_score",
  ];

  const bySeason = new Map();

  state.profiles.forEach((row) => {
    if (!bySeason.has(row.SEASON)) bySeason.set(row.SEASON, []);
    bySeason.get(row.SEASON).push(row);
  });

  state.profiles = state.profiles.map((row) => {
    const seasonRows = bySeason.get(row.SEASON) || [];
    const out = { ...row };

    percentileMetrics.forEach((metric) => {
      const percentile = percentileRank(
        seasonRows.map((seasonRow) => seasonRow[metric]),
        row[metric]
      );

      if (percentile !== null) {
        out[`${metric}_percentile`] = percentile;
      }
    });

    return out;
  });
}

function rankingScore(row, presetName) {
  const weights = rankingPresets[presetName] || rankingPresets["Scoring Value"];
  return Object.entries(weights).reduce(
    (sum, [metric, weight]) => sum + numberValue(row[metric]) * weight,
    0
  );
}

function metricClass(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  if (number > 0) return "positive";
  if (number < 0) return "negative";
  return "";
}

function plotConfig() {
  return {
    responsive: true,
    displayModeBar: false,
  };
}

function plotLayout(extra = {}) {
  return {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 44, r: 18, t: 30, b: 44 },
    font: { family: "Inter, system-ui, sans-serif", color: "#0f172a" },
    ...extra,
  };
}

function renderPlot(id, traces, layout = {}) {
  const el = document.getElementById(id);
  if (!el || !window.Plotly) return;

  Plotly.react(el, traces, plotLayout(layout), plotConfig());
}

function statCard(label, value, helper = "") {
  return `
    <div class="stat-pill pulse-card">
      <span>${label}</span>
      <strong>${value}</strong>
      ${helper ? `<small>${helper}</small>` : ""}
    </div>
  `;
}

function playerSummaryCard(row, label = "") {
  if (!row) return "";

  return `
    <div class="card pulse-card">
      <p class="eyebrow">${label || row.SEASON}</p>
      <h2>${escapeHtml(row.PLAYER_NAME)}</h2>
      <div class="stats-grid">
        ${statCard("PTS", fmt(row.PTS, 1))}
        ${statCard("TS%", pct(row.TS_PCT, 1))}
        ${statCard("Usage", pct(row.USG_PCT, 1))}
        ${statCard("Scoring %ile", pct(row.scoring_value_score_percentile, 0))}
        ${statCard("Actual PPS", fmt(row.actual_points_per_shot, 3))}
        ${statCard("Expected PPS", fmt(row.league_expected_pps, 3))}
        ${statCard("Shot Making", signed(row.shot_making_per_100_stable, 2))}
        ${statCard("Player Edge", signed(row.player_adjusted_edge_per_100_stable, 2))}
      </div>
    </div>
  `;
}

function rankingPresetCards(activePreset) {
  const descriptions = {
    "Scoring Value": "Balances efficiency, shot making, shot quality, and usage.",
    "Shot Creation": "Rewards self-created scoring profile and difficult shot value.",
    "Efficient Role Scorer": "Finds efficient scorers with lower-friction shot diets.",
    "Breakout Watch": "Uses projections and current value signals to flag upside.",
    "Overall Impact": "Blends scoring, impact stats, and all-around contribution.",
    "Scoring Value Score": "Sorts directly by the composite scoring value score.",
    "All Around Value Score": "Sorts directly by the all-around value score.",
  };

  return `
    <div class="category-grid">
      ${Object.keys(rankingPresets)
        .map(
          (preset) => `
            <button class="category-card ${
              preset === activePreset ? "active" : ""
            }" data-preset-card="${preset}" type="button">
              <h3>${preset}</h3>
              <p>${descriptions[preset] || "Custom player evaluation preset."}</p>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function table(headers, rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.join("")}
        </tbody>
      </table>
    </div>
  `;
}

function playerSearchRows(query, season) {
  const text = String(query || "").toLowerCase().trim();

  return state.profiles
    .filter((row) => !season || row.SEASON === season)
    .filter((row) => {
      if (!text) return true;

      return [
        row.PLAYER_NAME,
        row.TEAM_ABBREVIATION,
        row.SEASON,
      ]
        .join(" ")
        .toLowerCase()
        .includes(text);
    })
    .sort((a, b) => {
      const scoreDiff =
        Number(b.all_around_value_score || 0) -
        Number(a.all_around_value_score || 0);

      if (scoreDiff !== 0) return scoreDiff;

      return String(a.PLAYER_NAME).localeCompare(String(b.PLAYER_NAME));
    })
    .slice(0, 30);
}

function percentileBadge(label, value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return `
      <div class="percentile-badge">
        <span>${label}</span>
        <strong>-</strong>
      </div>
    `;
  }

  let tier = "low";

  if (number >= 0.85) tier = "elite";
  else if (number >= 0.65) tier = "good";
  else if (number >= 0.35) tier = "average";

  return `
    <div class="percentile-badge ${tier}">
      <span>${label}</span>
      <strong>${Math.round(number * 100)}</strong>
    </div>
  `;
}

function percentileReport(row) {
  if (!row) return "";

  return `
    <div class="percentile-report">
      ${percentileBadge("Scoring", row.scoring_value_score_percentile)}
      ${percentileBadge("Overall", row.all_around_value_score_percentile)}
      ${percentileBadge("Shot Make", row.shot_making_per_100_stable_percentile)}
      ${percentileBadge("Edge", row.player_adjusted_edge_per_100_stable_percentile)}
      ${percentileBadge("TS", row.TS_PCT_percentile)}
      ${percentileBadge("Usage", row.USG_PCT_percentile)}
    </div>
  `;
}

function setCompareSlot(playerName, season, slot) {
  if (slot === "A") {
    state.ui.playerA = playerName;
    state.ui.seasonA = season;
  } else {
    state.ui.playerB = playerName;
    state.ui.seasonB = season;
  }

  state.view = "versus";
  render();
}

async function init() {
  try {
    [
      state.profiles,
      state.similar,
      state.metrics,
      state.projections,
      state.projectionMetrics,
      state.breakoutMetrics,
    ] = await Promise.all([
      loadOptionalJson("data/player_profiles_slim.json").then((rows) =>
        rows.length ? rows : loadJson("data/player_profiles.json")
      ),
      loadOptionalJson("data/similar_players.json"),
      loadOptionalJson("data/model_metrics.json"),
      loadOptionalJson("data/player_projections.json"),
      loadOptionalJson("data/player_projection_metrics.json"),
      loadOptionalJson("data/breakout_metrics.json"),
    ]);

    addStableMetrics();
    mergeProjectionFieldsIntoProfiles();
    addValueScores();
    addSeasonPercentiles();

    const names = playerNames();
    const defaultA =
      names.find((name) => name.includes("Stephen Curry")) || names[0] || null;
    const defaultB =
      names.find((name) => name.includes("Luka Doncic")) || names[1] || defaultA;

    state.ui.playerA = state.ui.playerA || defaultA;
    state.ui.seasonA = validSeasonForPlayer(state.ui.playerA, state.ui.seasonA);
    state.ui.playerB = state.ui.playerB || defaultB;
    state.ui.seasonB = validSeasonForPlayer(state.ui.playerB, state.ui.seasonB);
    state.ui.leagueSeason = state.ui.leagueSeason || latestSeason();
    state.ui.trendPlayer = state.ui.trendPlayer || defaultA;
    state.ui.trendSeason = validSeasonForPlayer(state.ui.trendPlayer, state.ui.trendSeason);
    state.ui.projectionSeason = state.ui.projectionSeason || latestSeason();
    state.ui.similarityPlayer = state.ui.similarityPlayer || defaultA;
    state.ui.similaritySeason = validSeasonForPlayer(
      state.ui.similarityPlayer,
      state.ui.similaritySeason
    );
    state.ui.shotPlayer = state.ui.shotPlayer || defaultA;
    state.ui.shotSeason = validSeasonForPlayer(state.ui.shotPlayer, state.ui.shotSeason);

    render();
  } catch (error) {
    document.getElementById("app").innerHTML = `
      <div class="panel">
        <h2>Data failed to load</h2>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

async function render() {
  document.body.dataset.view = state.view;

  const navItems = [
    ["finder", "Player Finder"],
    ["versus", "Player Compare"],
    ["league", "League Rankings"],
    ["trends", "Player Trends"],
    ["projection", "Projection"],
    ["similarity", "Similarity Lab"],
    ["calibration", "Calibration"],
    ["player", "Shot Detail"],
    ["models", "Models"],
  ];

  document.getElementById("nav").innerHTML = navItems
    .map(
      ([view, label]) => `
        <button class="${state.view === view ? "active" : ""}" data-view="${view}" type="button">
          ${label}
        </button>
      `
    )
    .join("");

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      render();
    });
  });

  const app = document.getElementById("app");

  try {
    if (state.view === "finder") {
      renderFinderView();
      return;
    }
    if (state.view === "versus") {
      await renderVersusView();
      return;
    }

    if (state.view === "league") {
      renderLeagueView();
      return;
    }

    if (state.view === "trends") {
      app.innerHTML = loadingMarkup("Loading player trend data...");
      await renderTrendsView();
      return;
    }

    if (state.view === "projection") {
      renderProjectionView();
      return;
    }

    if (state.view === "similarity") {
      renderSimilarityView();
      return;
    }

    if (state.view === "calibration") {
      app.innerHTML = loadingMarkup("Loading calibration data...");
      await ensureCalibrationLoaded();
      renderCalibrationView();
      return;
    }

    if (state.view === "player") {
      app.innerHTML = loadingMarkup("Loading shot detail data...");
      await renderShotDetailView();
      return;
    }

    if (state.view === "models") {
      renderModelsView();
      return;
    }

    await renderVersusView();
  } catch (error) {
    app.innerHTML = `
      <div class="panel">
        <h2>This view could not load</h2>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function loadingMarkup(text) {
  return `
    <div class="loading-card">
      <span class="loader"></span>
      ${text}
    </div>
  `;
}

async function renderVersusView() {
  const app = document.getElementById("app");

  state.ui.seasonA = validSeasonForPlayer(state.ui.playerA, state.ui.seasonA);
  state.ui.seasonB = validSeasonForPlayer(state.ui.playerB, state.ui.seasonB);

  const rowA = profileRow(state.ui.playerA, state.ui.seasonA);
  const rowB = profileRow(state.ui.playerB, state.ui.seasonB);

  app.innerHTML = `
    <section class="panel fade-in">
      <div class="controls">
        <div class="field">
          <label>Player A</label>
          <select id="playerA">${playerOptions(state.ui.playerA)}</select>
        </div>
        <div class="field">
          <label>Season A</label>
          <select id="seasonA">${seasonOptionsForPlayer(state.ui.playerA, state.ui.seasonA)}</select>
        </div>
        <div class="field">
          <label>Player B</label>
          <select id="playerB">${playerOptions(state.ui.playerB)}</select>
        </div>
        <div class="field">
          <label>Season B</label>
          <select id="seasonB">${seasonOptionsForPlayer(state.ui.playerB, state.ui.seasonB)}</select>
        </div>
      </div>
    </section>

    <section class="visual-grid">
      ${playerSummaryCard(rowA, `${rowA?.SEASON || ""} comparison side A`)}
      ${playerSummaryCard(rowB, `${rowB?.SEASON || ""} comparison side B`)}

      <div class="full-panel">
        <h2>Scoring Profile</h2>
        <div id="versus-bars" class="chart"></div>
      </div>

      <div class="chart-card">
        <h2>Style Radar</h2>
        <div id="style-radar" class="chart"></div>
      </div>

      <div class="chart-card">
        <h2>Season Progression</h2>
        <div id="season-progression" class="chart"></div>
      </div>

      <div class="chart-card">
        <h2>Box Score Role</h2>
        <div id="box-role" class="chart"></div>
      </div>

      <div class="chart-card">
        <h2>Zone Comparison</h2>
        <div id="zone-compare" class="chart"></div>
      </div>
    </section>
  `;

  document.getElementById("playerA").addEventListener("change", (event) => {
    state.ui.playerA = event.target.value;
    state.ui.seasonA = validSeasonForPlayer(state.ui.playerA, state.ui.seasonA);
    render();
  });

  document.getElementById("seasonA").addEventListener("change", (event) => {
    state.ui.seasonA = event.target.value;
    render();
  });

  document.getElementById("playerB").addEventListener("change", (event) => {
    state.ui.playerB = event.target.value;
    state.ui.seasonB = validSeasonForPlayer(state.ui.playerB, state.ui.seasonB);
    render();
  });

  document.getElementById("seasonB").addEventListener("change", (event) => {
    state.ui.seasonB = event.target.value;
    render();
  });

  if (!rowA || !rowB) return;

  renderVersusBars(rowA, rowB);
  renderStyleRadar(rowA, rowB);
  renderSeasonProgression(rowA, rowB);
  renderBoxRole(rowA, rowB);

  const [zonesA, zonesB] = await Promise.all([
    loadPlayerZones(rowA.PLAYER_ID, rowA.SEASON),
    loadPlayerZones(rowB.PLAYER_ID, rowB.SEASON),
  ]);

  renderZoneCompare(rowA, rowB, zonesA, zonesB);
}

function renderVersusBars(rowA, rowB) {
  const labels = ["Actual PPS", "Expected PPS", "Shot Making", "Player Edge", "TS%", "Usage"];
  const metrics = [
    "actual_points_per_shot",
    "league_expected_pps",
    "shot_making_per_100_stable",
    "player_adjusted_edge_per_100_stable",
    "TS_PCT",
    "USG_PCT",
  ];

  renderPlot(
    "versus-bars",
    [
      {
        type: "bar",
        name: `${rowA.PLAYER_NAME} ${rowA.SEASON}`,
        x: labels,
        y: metrics.map((metric) => numberValue(rowA[metric])),
        marker: { color: "#2563eb" },
      },
      {
        type: "bar",
        name: `${rowB.PLAYER_NAME} ${rowB.SEASON}`,
        x: labels,
        y: metrics.map((metric) => numberValue(rowB[metric])),
        marker: { color: "#f97316" },
      },
    ],
    { barmode: "group" }
  );
}

function renderFinderView() {
  const app = document.getElementById("app");

  if (!state.ui.finderSeason) {
    state.ui.finderSeason = latestSeason();
  }

  if (state.ui.finderQuery === undefined) {
    state.ui.finderQuery = "";
  }

  app.innerHTML = `
    <section class="panel fade-in finder-panel">
      <h2>Player Finder</h2>
      <p>
        Search players by name or team, inspect percentiles, and send players directly into comparison.
      </p>

      <div class="controls">
        <div class="field">
          <label for="finderQuery">Search</label>
          <input
            id="finderQuery"
            type="text"
            value="${escapeHtml(state.ui.finderQuery)}"
            placeholder="Search player or team..."
            autocomplete="off"
          />
        </div>

        <div class="field">
          <label for="finderSeason">Season</label>
          <select id="finderSeason">${seasonOptions(state.ui.finderSeason)}</select>
        </div>
      </div>
    </section>

    <section id="finderResults" class="finder-grid"></section>
  `;

  const queryInput = document.getElementById("finderQuery");
  const seasonInput = document.getElementById("finderSeason");
  const results = document.getElementById("finderResults");

  queryInput.oninput = () => {
    state.ui.finderQuery = queryInput.value;
    updateFinderResults();
  };

  seasonInput.onchange = () => {
    state.ui.finderSeason = seasonInput.value;
    updateFinderResults();
  };

  results.onclick = (event) => {
    const buttonA = event.target.closest("[data-compare-a]");
    const buttonB = event.target.closest("[data-compare-b]");

    if (buttonA) {
      setCompareSlot(buttonA.dataset.compareA, buttonA.dataset.season, "A");
      return;
    }

    if (buttonB) {
      setCompareSlot(buttonB.dataset.compareB, buttonB.dataset.season, "B");
    }
  };

  updateFinderResults();
}

function updateFinderResults() {
  const results = document.getElementById("finderResults");
  if (!results) return;

  const rows = playerSearchRows(
    state.ui.finderQuery,
    state.ui.finderSeason
  ).slice(0, 24);

  if (!rows.length) {
    results.innerHTML = `
      <div class="empty-state">
        <h3>No players found</h3>
        <p>Try another name, team, or season.</p>
      </div>
    `;
    return;
  }

  results.innerHTML = rows
    .map(
      (row) => `
        <article class="finder-card pulse-card">
          <div class="finder-card-head">
            <div>
              <p class="eyebrow">${escapeHtml(row.TEAM_ABBREVIATION || "-")} · ${escapeHtml(row.SEASON)}</p>
              <h3>${escapeHtml(row.PLAYER_NAME)}</h3>
            </div>

            <div class="finder-score">
              <strong>${pct(row.scoring_value_score_percentile, 0)}</strong>
              <span>score</span>
            </div>
          </div>

          ${percentileReport(row)}

          <div class="finder-stats">
            <div>
              <span>PPS</span>
              <strong>${fmt(row.actual_points_per_shot, 3)}</strong>
            </div>
            <div>
              <span>TS</span>
              <strong>${pct(row.TS_PCT, 1)}</strong>
            </div>
            <div>
              <span>USG</span>
              <strong>${pct(row.USG_PCT, 1)}</strong>
            </div>
            <div>
              <span>Edge</span>
              <strong class="${metricClass(row.player_adjusted_edge_per_100_stable)}">
                ${signed(row.player_adjusted_edge_per_100_stable, 2)}
              </strong>
            </div>
          </div>

          <div class="finder-actions">
            <button
              type="button"
              data-compare-a="${escapeHtml(row.PLAYER_NAME)}"
              data-season="${escapeHtml(row.SEASON)}"
            >
              Set A
            </button>
            <button
              type="button"
              data-compare-b="${escapeHtml(row.PLAYER_NAME)}"
              data-season="${escapeHtml(row.SEASON)}"
            >
              Set B
            </button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderStyleRadar(rowA, rowB) {
  const labels = ["Efficiency", "Usage", "Shot Making", "Player Edge", "Impact"];
  const metrics = [
    "TS_PCT_percentile",
    "USG_PCT_percentile",
    "shot_making_per_100_stable_percentile",
    "player_adjusted_edge_per_100_stable_percentile",
    "all_around_value_score_percentile",
  ];

  renderPlot(
    "style-radar",
    [
      {
        type: "scatterpolar",
        r: metrics.map((metric) => numberValue(rowA[metric]) * 100),
        theta: labels,
        fill: "toself",
        name: `${rowA.PLAYER_NAME} ${rowA.SEASON}`,
      },
      {
        type: "scatterpolar",
        r: metrics.map((metric) => numberValue(rowB[metric]) * 100),
        theta: labels,
        fill: "toself",
        name: `${rowB.PLAYER_NAME} ${rowB.SEASON}`,
      },
    ],
    {
      polar: { radialaxis: { visible: true, range: [0, 100] } },
      showlegend: true,
    }
  );
}

function renderSeasonProgression(rowA, rowB) {
  const rowsA = state.profiles
    .filter((row) => row.PLAYER_NAME === rowA.PLAYER_NAME)
    .sort((a, b) => String(a.SEASON).localeCompare(String(b.SEASON)));

  const rowsB = state.profiles
    .filter((row) => row.PLAYER_NAME === rowB.PLAYER_NAME)
    .sort((a, b) => String(a.SEASON).localeCompare(String(b.SEASON)));

  renderPlot(
    "season-progression",
    [
      {
        type: "scatter",
        mode: "lines+markers",
        name: rowA.PLAYER_NAME,
        x: rowsA.map((row) => row.SEASON),
        y: rowsA.map((row) => numberValue(row.scoring_value_score)),
      },
      {
        type: "scatter",
        mode: "lines+markers",
        name: rowB.PLAYER_NAME,
        x: rowsB.map((row) => row.SEASON),
        y: rowsB.map((row) => numberValue(row.scoring_value_score)),
      },
    ],
    { yaxis: { title: "Scoring value score" } }
  );
}

function renderBoxRole(rowA, rowB) {
  const labels = ["PTS", "AST", "REB", "Usage", "Net Rating"];
  const metrics = ["PTS", "AST", "REB", "USG_PCT", "NET_RATING"];

  renderPlot(
    "box-role",
    [
      {
        type: "bar",
        name: `${rowA.PLAYER_NAME} ${rowA.SEASON}`,
        x: labels,
        y: metrics.map((metric) => numberValue(rowA[metric])),
        marker: { color: "#2563eb" },
      },
      {
        type: "bar",
        name: `${rowB.PLAYER_NAME} ${rowB.SEASON}`,
        x: labels,
        y: metrics.map((metric) => numberValue(rowB[metric])),
        marker: { color: "#f97316" },
      },
    ],
    { barmode: "group" }
  );
}

function renderZoneCompare(rowA, rowB, zonesA, zonesB) {
  const zoneNames = unique([
    ...zonesA.map((row) => row.SHOT_ZONE_BASIC),
    ...zonesB.map((row) => row.SHOT_ZONE_BASIC),
  ]);

  const zoneValue = (rows, zone) => {
    const row = rows.find((item) => item.SHOT_ZONE_BASIC === zone);
    return row ? numberValue(row.actual_points_per_shot) : 0;
  };

  renderPlot(
    "zone-compare",
    [
      {
        type: "bar",
        name: `${rowA.PLAYER_NAME} ${rowA.SEASON}`,
        x: zoneNames,
        y: zoneNames.map((zone) => zoneValue(zonesA, zone)),
        marker: { color: "#2563eb" },
      },
      {
        type: "bar",
        name: `${rowB.PLAYER_NAME} ${rowB.SEASON}`,
        x: zoneNames,
        y: zoneNames.map((zone) => zoneValue(zonesB, zone)),
        marker: { color: "#f97316" },
      },
    ],
    { barmode: "group", xaxis: { tickangle: -25 } }
  );
}

function renderLeagueView() {
  const app = document.getElementById("app");

  const seasonRows = state.profiles
    .filter((row) => row.SEASON === state.ui.leagueSeason)
    .filter((row) => numberValue(row.shots) >= numberValue(state.ui.minShots))
    .filter((row) => numberValue(row.USG_PCT) >= numberValue(state.ui.minUsage))
    .filter((row) => numberValue(row.TS_PCT) >= numberValue(state.ui.minTs))
    .filter((row) => !row.AGE || numberValue(row.AGE) <= numberValue(state.ui.maxAge))
    .filter(
      (row) =>
        numberValue(row.breakout_probability) >= numberValue(state.ui.minBreakout)
    )
    .map((row) => ({
      ...row,
      ranking_score: rankingScore(row, state.ui.rankingPreset),
    }))
    .sort((a, b) => b.ranking_score - a.ranking_score)
    .slice(0, 75);

  app.innerHTML = `
    <section class="panel fade-in">
      <h2>League Rankings</h2>
      <div class="controls">
        <div class="field">
          <label>Season</label>
          <select id="leagueSeason">${seasonOptions(state.ui.leagueSeason)}</select>
        </div>
        <div class="field">
          <label>Min Shots</label>
          <input id="minShots" type="number" value="${state.ui.minShots}" />
        </div>
        <div class="field">
          <label>Min Usage</label>
          <input id="minUsage" type="number" step="0.01" value="${state.ui.minUsage}" />
        </div>
        <div class="field">
          <label>Min TS%</label>
          <input id="minTs" type="number" step="0.01" value="${state.ui.minTs}" />
        </div>
        <div class="field">
          <label>Max Age</label>
          <input id="maxAge" type="number" value="${state.ui.maxAge}" />
        </div>
      </div>
      ${rankingPresetCards(state.ui.rankingPreset)}
    </section>

    <section class="table-card">
      ${table(
        ["Rank", "Player", "Season", "Team", "Score", "Scoring %ile", "PPS", "TS%", "Usage", "Shot Making", "Player Edge", "Shots"],
        seasonRows.map(
          (row, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(row.PLAYER_NAME)}</td>
              <td>${row.SEASON}</td>
              <td>${escapeHtml(row.TEAM_ABBREVIATION || "-")}</td>
              <td>${fmt(row.ranking_score, 3)}</td>
              <td>${pct(row.scoring_value_score_percentile, 0)}</td>
              <td>${fmt(row.actual_points_per_shot, 3)}</td>
              <td>${pct(row.TS_PCT, 1)}</td>
              <td>${pct(row.USG_PCT, 1)}</td>
              <td class="${metricClass(row.shot_making_per_100_stable)}">${signed(row.shot_making_per_100_stable, 2)}</td>
              <td class="${metricClass(row.player_adjusted_edge_per_100_stable)}">${signed(row.player_adjusted_edge_per_100_stable, 2)}</td>
              <td>${fmt(row.shots, 0)}</td>
            </tr>
          `
        )
      )}
    </section>
  `;

  document.getElementById("leagueSeason").addEventListener("change", (event) => {
    state.ui.leagueSeason = event.target.value;
    render();
  });

  ["minShots", "minUsage", "minTs", "maxAge"].forEach((id) => {
    document.getElementById(id).addEventListener("change", (event) => {
      state.ui[id] = Number(event.target.value);
      render();
    });
  });

  document.querySelectorAll("[data-preset-card]").forEach((card) => {
    card.addEventListener("click", () => {
      state.ui.rankingPreset = card.dataset.presetCard;
      render();
    });
  });
}

async function renderTrendsView() {
  const app = document.getElementById("app");

  state.ui.trendSeason = validSeasonForPlayer(
    state.ui.trendPlayer,
    state.ui.trendSeason
  );

  const row = profileRow(state.ui.trendPlayer, state.ui.trendSeason);
  const games = row ? await loadPlayerGames(row.PLAYER_ID, row.SEASON) : [];

  app.innerHTML = `
    <section class="panel fade-in">
      <h2>Player Trends</h2>
      <div class="controls">
        <div class="field">
          <label>Player</label>
          <select id="trendPlayer">${playerOptions(state.ui.trendPlayer)}</select>
        </div>
        <div class="field">
          <label>Season</label>
          <select id="trendSeason">${seasonOptionsForPlayer(state.ui.trendPlayer, state.ui.trendSeason)}</select>
        </div>
      </div>
    </section>

    <section class="visual-grid">
      ${playerSummaryCard(row, "Selected trend profile")}
      <div class="card">
        <h2>Game Log Size</h2>
        <div class="stats-grid">
          ${statCard("Games Loaded", fmt(games.length, 0))}
          ${statCard("Avg PTS", fmt(avg(games, "PTS"), 1))}
          ${statCard("Avg TS%", pct(avg(games, "TS_PCT"), 1))}
          ${statCard("Avg Edge", signed(avg(games, "player_adjusted_edge_per_100"), 2))}
        </div>
      </div>
      <div class="full-panel">
        <h2>Game by Game Trend</h2>
        <div id="trend-chart" class="chart"></div>
      </div>
    </section>
  `;

  document.getElementById("trendPlayer").addEventListener("change", (event) => {
    state.ui.trendPlayer = event.target.value;
    state.ui.trendSeason = validSeasonForPlayer(state.ui.trendPlayer, state.ui.trendSeason);
    render();
  });

  document.getElementById("trendSeason").addEventListener("change", (event) => {
    state.ui.trendSeason = event.target.value;
    render();
  });

  renderPlot(
    "trend-chart",
    [
      {
        type: "scatter",
        mode: "lines+markers",
        name: "PTS",
        x: games.map((game) => game.GAME_DATE || game.GAME_ID),
        y: games.map((game) => numberValue(game.PTS)),
      },
      {
        type: "scatter",
        mode: "lines+markers",
        name: "Shot edge",
        yaxis: "y2",
        x: games.map((game) => game.GAME_DATE || game.GAME_ID),
        y: games.map((game) => numberValue(game.player_adjusted_edge_per_100)),
      },
    ],
    {
      yaxis: { title: "Points" },
      yaxis2: {
        title: "Shot edge",
        overlaying: "y",
        side: "right",
      },
    }
  );
}

function avg(rows, metric) {
  const values = rows.map((row) => Number(row[metric])).filter(Number.isFinite);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function renderProjectionView() {
  const app = document.getElementById("app");

  const rows = state.profiles
    .filter((row) => row.SEASON === state.ui.projectionSeason)
    .filter((row) => Number.isFinite(Number(row.breakout_probability)))
    .sort((a, b) => numberValue(b.breakout_probability) - numberValue(a.breakout_probability))
    .slice(0, 75);

  app.innerHTML = `
    <section class="panel fade-in">
      <h2>Projection Lab</h2>
      <div class="controls">
        <div class="field">
          <label>Base Season</label>
          <select id="projectionSeason">${seasonOptions(state.ui.projectionSeason)}</select>
        </div>
      </div>
    </section>

    <section class="table-card">
      ${table(
        ["Rank", "Player", "Team", "Breakout", "Next PPS", "Next TS%", "Next Usage", "Current PPS", "Current Edge"],
        rows.map(
          (row, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(row.PLAYER_NAME)}</td>
              <td>${escapeHtml(row.TEAM_ABBREVIATION || "-")}</td>
              <td>${pct(row.breakout_probability, 1)}</td>
              <td>${fmt(row.projected_next_actual_points_per_shot, 3)}</td>
              <td>${pct(row.projected_next_TS_PCT, 1)}</td>
              <td>${pct(row.projected_next_USG_PCT, 1)}</td>
              <td>${fmt(row.actual_points_per_shot, 3)}</td>
              <td class="${metricClass(row.player_adjusted_edge_per_100_stable)}">${signed(row.player_adjusted_edge_per_100_stable, 2)}</td>
            </tr>
          `
        )
      )}
    </section>
  `;

  document.getElementById("projectionSeason").addEventListener("change", (event) => {
    state.ui.projectionSeason = event.target.value;
    render();
  });
}

function renderSimilarityView() {
  const app = document.getElementById("app");

  state.ui.similaritySeason = validSeasonForPlayer(
    state.ui.similarityPlayer,
    state.ui.similaritySeason
  );

  const row = profileRow(state.ui.similarityPlayer, state.ui.similaritySeason);
  const matches = similarRowsFor(row).slice(0, 20);

  app.innerHTML = `
    <section class="panel fade-in">
      <h2>Similarity Lab</h2>
      <div class="controls">
        <div class="field">
          <label>Player</label>
          <select id="similarityPlayer">${playerOptions(state.ui.similarityPlayer)}</select>
        </div>
        <div class="field">
          <label>Season</label>
          <select id="similaritySeason">${seasonOptionsForPlayer(state.ui.similarityPlayer, state.ui.similaritySeason)}</select>
        </div>
      </div>
    </section>

    <section class="visual-grid">
      ${playerSummaryCard(row, "Similarity anchor")}
      <div class="table-card">
        <h2>Closest Profiles</h2>
        ${table(
          ["Player", "Season", "Similarity", "PPS", "TS%", "Usage", "Edge"],
          matches.map(
            (match) => `
              <tr>
                <td>${escapeHtml(match.PLAYER_NAME || match.similar_player || "-")}</td>
                <td>${escapeHtml(match.SEASON || match.similar_season || "-")}</td>
                <td>${fmt(match.similarity || match.score, 3)}</td>
                <td>${fmt(match.actual_points_per_shot, 3)}</td>
                <td>${pct(match.TS_PCT, 1)}</td>
                <td>${pct(match.USG_PCT, 1)}</td>
                <td>${signed(match.player_adjusted_edge_per_100_stable, 2)}</td>
              </tr>
            `
          )
        )}
      </div>
    </section>
  `;

  document.getElementById("similarityPlayer").addEventListener("change", (event) => {
    state.ui.similarityPlayer = event.target.value;
    state.ui.similaritySeason = validSeasonForPlayer(
      state.ui.similarityPlayer,
      state.ui.similaritySeason
    );
    render();
  });

  document.getElementById("similaritySeason").addEventListener("change", (event) => {
    state.ui.similaritySeason = event.target.value;
    render();
  });
}

function similarRowsFor(row) {
  if (!row) return [];

  const direct = state.similar.filter(
    (item) =>
      String(item.PLAYER_ID) === String(row.PLAYER_ID) &&
      String(item.SEASON) === String(row.SEASON)
  );

  if (direct.length) return direct;

  const features = [
    "actual_points_per_shot",
    "league_expected_pps",
    "TS_PCT",
    "USG_PCT",
    "shot_making_per_100_stable",
    "player_adjusted_edge_per_100_stable",
  ];

  return state.profiles
    .filter(
      (candidate) =>
        !(
          String(candidate.PLAYER_ID) === String(row.PLAYER_ID) &&
          candidate.SEASON === row.SEASON
        )
    )
    .map((candidate) => {
      const distance = Math.sqrt(
        features.reduce(
          (sum, feature) =>
            sum + (numberValue(candidate[feature]) - numberValue(row[feature])) ** 2,
          0
        )
      );

      return {
        ...candidate,
        similarity: 1 / (1 + distance),
      };
    })
    .sort((a, b) => b.similarity - a.similarity);
}

async function renderShotDetailView() {
  const app = document.getElementById("app");

  state.ui.shotSeason = validSeasonForPlayer(state.ui.shotPlayer, state.ui.shotSeason);

  const row = profileRow(state.ui.shotPlayer, state.ui.shotSeason);
  const shots = row ? await loadShotFile(row.PLAYER_ID, row.SEASON) : [];
  const zones = row ? await loadPlayerZones(row.PLAYER_ID, row.SEASON) : [];

  app.innerHTML = `
    <section class="panel fade-in">
      <h2>Shot Detail</h2>
      <div class="controls">
        <div class="field">
          <label>Player</label>
          <select id="shotPlayer">${playerOptions(state.ui.shotPlayer)}</select>
        </div>
        <div class="field">
          <label>Season</label>
          <select id="shotSeason">${seasonOptionsForPlayer(state.ui.shotPlayer, state.ui.shotSeason)}</select>
        </div>
      </div>
    </section>

    <section class="visual-grid">
      ${playerSummaryCard(row, "Shot detail profile")}
      <div class="card">
        <h2>Shot File</h2>
        <div class="stats-grid">
          ${statCard("Shots Loaded", fmt(shots.length, 0))}
          ${statCard("Zones", fmt(zones.length, 0))}
          ${statCard("Actual PPS", fmt(row?.actual_points_per_shot, 3))}
          ${statCard("Expected PPS", fmt(row?.league_expected_pps, 3))}
        </div>
      </div>

      <div class="full-panel">
        <h2>Interactive Shot Map</h2>
        <div id="shot-map" class="chart"></div>
      </div>

      <div class="full-panel">
        <h2>Zone Value</h2>
        <div id="shot-zone-bars" class="chart"></div>
      </div>
    </section>
  `;

  document.getElementById("shotPlayer").addEventListener("change", (event) => {
    state.ui.shotPlayer = event.target.value;
    state.ui.shotSeason = validSeasonForPlayer(state.ui.shotPlayer, state.ui.shotSeason);
    render();
  });

  document.getElementById("shotSeason").addEventListener("change", (event) => {
    state.ui.shotSeason = event.target.value;
    render();
  });

  renderShotMap(shots);
  renderShotZoneBars(zones);
}

function renderShotMap(shots) {
  const made = shots.filter((shot) => numberValue(shot.SHOT_MADE_FLAG) === 1);
  const missed = shots.filter((shot) => numberValue(shot.SHOT_MADE_FLAG) !== 1);

  renderPlot(
    "shot-map",
    [
      {
        type: "scattergl",
        mode: "markers",
        name: "Missed",
        x: missed.map((shot) => numberValue(shot.LOC_X)),
        y: missed.map((shot) => numberValue(shot.LOC_Y)),
        marker: { color: "rgba(220,38,38,0.38)", size: 6 },
        text: missed.map((shot) => shot.ACTION_TYPE || shot.SHOT_ZONE_BASIC || ""),
      },
      {
        type: "scattergl",
        mode: "markers",
        name: "Made",
        x: made.map((shot) => numberValue(shot.LOC_X)),
        y: made.map((shot) => numberValue(shot.LOC_Y)),
        marker: { color: "rgba(22,163,74,0.48)", size: 6 },
        text: made.map((shot) => shot.ACTION_TYPE || shot.SHOT_ZONE_BASIC || ""),
      },
    ],
    {
      xaxis: { range: [-260, 260], zeroline: false, title: "Court X" },
      yaxis: { range: [-60, 430], zeroline: false, title: "Court Y" },
      height: 560,
    }
  );
}

function renderShotZoneBars(zones) {
  renderPlot(
    "shot-zone-bars",
    [
      {
        type: "bar",
        name: "Actual PPS",
        x: zones.map((zone) => zone.SHOT_ZONE_BASIC || zone.SHOT_ZONE_AREA),
        y: zones.map((zone) => numberValue(zone.actual_points_per_shot)),
        marker: { color: "#2563eb" },
      },
      {
        type: "bar",
        name: "Expected PPS",
        x: zones.map((zone) => zone.SHOT_ZONE_BASIC || zone.SHOT_ZONE_AREA),
        y: zones.map((zone) => numberValue(zone.league_expected_pps)),
        marker: { color: "#f97316" },
      },
    ],
    { barmode: "group", xaxis: { tickangle: -25 } }
  );
}

function renderCalibrationView() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <section class="visual-grid">
      <div class="table-card">
        <h2>Calibration Metrics</h2>
        ${table(
          Object.keys(state.calibrationMetrics[0] || { metric: "", value: "" }),
          state.calibrationMetrics.map(
            (row) =>
              `<tr>${Object.values(row)
                .map((value) => `<td>${escapeHtml(fmtMaybe(value))}</td>`)
                .join("")}</tr>`
          )
        )}
      </div>
      <div class="chart-card">
        <h2>Calibration Curve</h2>
        <div id="calibration-chart" class="chart"></div>
      </div>
    </section>
  `;

  renderPlot(
    "calibration-chart",
    [
      {
        type: "scatter",
        mode: "lines+markers",
        name: "Model",
        x: state.calibrationCurve.map(
          (row) => numberValue(row.predicted_probability || row.predicted || row.mean_predicted_value)
        ),
        y: state.calibrationCurve.map(
          (row) => numberValue(row.actual_make_rate || row.actual || row.fraction_of_positives)
        ),
      },
      {
        type: "scatter",
        mode: "lines",
        name: "Perfect",
        x: [0, 1],
        y: [0, 1],
        line: { dash: "dash", color: "#64748b" },
      },
    ],
    {
      xaxis: { title: "Predicted make probability", range: [0, 1] },
      yaxis: { title: "Actual make rate", range: [0, 1] },
    }
  );
}

function fmtMaybe(value) {
  const number = Number(value);
  if (Number.isFinite(number)) return fmt(number, 4);
  return value;
}

function renderModelsView() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <section class="panel fade-in">
      <h2>Models</h2>
      <p>
        The site uses model outputs as player evaluation signals instead of treating
        single-shot prediction as the whole product.
      </p>
    </section>

    <section class="table-card">
      <h2>Model Metrics</h2>
      ${table(
        Object.keys(state.metrics[0] || { model: "", log_loss: "", roc_auc: "", brier: "" }),
        state.metrics.map(
          (row) =>
            `<tr>${Object.values(row)
              .map((value) => `<td>${escapeHtml(fmtMaybe(value))}</td>`)
              .join("")}</tr>`
        )
      )}
    </section>

    <section class="visual-grid">
      <div class="card">
        <h2>Primary Signals</h2>
        <div class="stats-grid">
          ${statCard("Shot Quality", "Expected PPS")}
          ${statCard("Shot Making", "Actual - Expected")}
          ${statCard("Player Edge", "Adjusted")}
          ${statCard("Projection", "Next Season")}
        </div>
      </div>
      <div class="card">
        <h2>Scaling Plan</h2>
        <p>
          Large files are loaded only when the user opens a detail view. Player,
          season, zone, shot, and later team files can grow independently.
        </p>
      </div>
    </section>
  `;
}

function setControls(html = "") {
  let controls = document.getElementById("controls");
  const app = document.getElementById("app");

  if (!app) return;

  if (!controls) {
    controls = document.createElement("section");
    controls.id = "controls";
    controls.className = "panel fade-in controls-shell";
    app.before(controls);
  }

  controls.innerHTML = html;
}

window.addEventListener("error", (event) => {
  const app = document.getElementById("app");

  if (app) {
    app.innerHTML = `
      <div class="panel">
        <h2>Site error</h2>
        <p>${event.message}</p>
      </div>
    `;
  }

  console.error(event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  const app = document.getElementById("app");

  if (app) {
    app.innerHTML = `
      <div class="panel">
        <h2>Data loading error</h2>
        <p>${event.reason?.message || event.reason}</p>
      </div>
    `;
  }

  console.error(event.reason);
});

document.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => {
    const app = document.getElementById("app");

    app.innerHTML = `
      <div class="panel">
        <h2>App failed to start</h2>
        <p>${error.message}</p>
      </div>
    `;

    console.error(error);
  });
});