# Shot Lens

Shot Lens is an NBA player analytics project focused on practical player evaluation, comparison, shot quality, projections, and scalable static deployment.

The project started as an expected shot value model, then evolved into a broader player evaluation lab. Shot-level modeling is still part of the system, but the main product is now built around player-season value signals, percentile rankings, comparison tools, projections, similarity search, and interactive visual scouting.

## Live Demo

GitHub Pages:

https://nikhil3654.github.io/shot-lens/

## What The App Does

Shot Lens lets users explore NBA players through model-backed analytics instead of only box-score tables.

Main features:

- Player Finder with search by player, team, and season
- Player comparison across different players or the same player across multiple seasons
- League rankings with custom evaluation presets
- Percentile reports for scoring value, all-around value, usage, efficiency, and shot making
- Projection lab for next-season player signals and breakout probability
- Similarity lab for finding comparable player-season profiles
- Player trend view with game-level movement
- Shot detail view with shot map and zone value breakdown
- Model metrics and calibration views
- Static GitHub Pages deployment with lazy-loaded data

## Project Motivation

Single-shot make or miss prediction is naturally noisy. A strong player analytics product should not depend only on predicting whether one shot goes in.

Shot Lens uses shot models more practically:

- Estimate shot quality
- Compare actual scoring to expected scoring
- Aggregate model output to player-season and player-zone profiles
- Use those profiles as signals for rankings, comparisons, projections, and similarity search

This makes the project more useful as an analytics tool and more defensible as a machine learning project.

## Model Approach

The project uses a two-model shot evaluation setup:

1. League Shot Quality Model

   Estimates expected shot value based on shot context, location, distance, zone, action type, period, and other available features.

2. Player-Adjusted Shot Model

   Adds player-level context to estimate player-specific expected value and shot-making signal.

The app focuses on aggregated outputs such as:

- actual_points_per_shot
- league_expected_pps
- player_expected_pps
- shot_making_per_100
- player_adjusted_edge_per_100
- shot_making_per_100_stable
- player_adjusted_edge_per_100_stable

A shrinkage adjustment is used for shot-making metrics so small-sample players do not dominate rankings too aggressively.

## Player Evaluation Signals

Shot Lens builds player evaluation from several groups of features:

Scoring and shot value:

- Actual points per shot
- Expected points per shot
- Shot making above expectation
- Player-adjusted shot edge

Advanced stats:

- True shooting percentage
- Usage rate
- Net rating
- Player impact estimate
- Minutes and volume filters

Projection signals:

- Projected next-season efficiency
- Projected next-season shot value
- Breakout probability

Composite scores:

- Scoring Value Score
- All Around Value Score

These are converted into season-level percentiles so users can quickly understand where a player ranks against the league.

## Current App Pages

### Player Finder

Search for a player or team, inspect percentile strengths, and send a player directly into the comparison page.

### Player Compare

Compare two player-seasons side by side. This supports:

- Different players
- Same player across different years
- Scoring profile chart
- Style radar
- Season progression chart
- Box-score role chart
- Zone comparison

### League Rankings

Rank players by practical evaluation presets:

- Scoring Value
- Shot Creation
- Efficient Role Scorer
- Breakout Watch
- Overall Impact
- Scoring Value Score
- All Around Value Score

Filters include season, minimum shots, minimum minutes, minimum usage, minimum true shooting, and maximum age.

### Projection Lab

Shows projected next-season signals and breakout probability.

### Similarity Lab

Finds similar player-season profiles based on scoring, efficiency, usage, and model-derived shot value.

### Player Trends

Loads game-level data only when needed and shows player movement over a season.

### Shot Detail

Loads shot-level files only when selected. This keeps the main site lighter while still allowing interactive shot maps.

### Models

Shows model metrics, calibration information, data status, and project methodology.

## Static Data Architecture

The site is designed to scale as a static app.

Instead of loading one massive JSON file on startup, the app uses a partitioned data layout:

    docs/
      data/
        manifest.json
        player_index.json
        player_profiles_slim.json
        players/
          PLAYER_ID/
            profile.json
            games_SEASON.json
            zones_SEASON.json
        shots/
          player_PLAYER_ID_SEASON.json

The homepage loads only the lightweight files needed for search, rankings, comparison, and summaries.

Large data is lazy-loaded only when the user opens a detail view.

Examples:

- Game logs are loaded only in Player Trends
- Shot files are loaded only in Shot Detail
- Calibration files are loaded only in Calibration
- Player zone files are loaded only when needed for comparison or shot detail

This lets the GitHub Pages version stay fast while still supporting more data over time.

## Repository Structure

    shot-lens/
      app/
        streamlit_app.py
      artifacts/
        model outputs and generated analytics files
      data/
        local raw/intermediate data
      docs/
        GitHub Pages static app
        index.html
        app.js
        styles.css
        data/
      notebooks/
        Kaggle training and data preparation notebooks
      scripts/
        export_static_docs_data.py
        partition_static_data.py
      README.md

## Local Static Site

To run the static site locally:

    cd D:\shot-lens\docs
    python -m http.server 8000

Then open:

    http://localhost:8000

## Kaggle Workflow

The project is designed so heavier processing can happen in Kaggle notebooks instead of locally.

Typical workflow:

1. Upload or attach the raw NBA shot data and advanced stat files in Kaggle.
2. Train or update the shot quality models.
3. Generate player profiles, zone profiles, projections, calibration files, and similarity files.
4. Download the generated artifacts.
5. Place the artifacts in the local artifacts folder.
6. Run the export script to create static JSON files.
7. Run the partition script to split large files into smaller player-season files.
8. Commit and deploy the docs folder through GitHub Pages.

Useful scripts:

    python scripts\export_static_docs_data.py
    python scripts\partition_static_data.py

## Deployment

The current deployment target is GitHub Pages from the docs folder.

Recommended Pages setup:

- Source: Deploy from branch
- Branch: main
- Folder: /docs

After pushing changes, GitHub Pages deploys the static app.

## Files That Should Usually Not Be Committed

Large model and raw data artifacts should stay local or be stored externally.

Recommended examples for .gitignore:

    artifacts/*.parquet
    artifacts/*.pkl
    artifacts/*.pt
    docs/data/player_game_profiles.json
    docs/data/zone_profiles.json
    docs/data/shots/

The deployed site should use smaller exported JSON files and partitioned player-season files.

## Why This Project Is Practical

Shot Lens is not just a visualization dashboard. It connects modeling to usable basketball decisions:

- Which players create the most scoring value?
- Which players beat shot quality expectations?
- Which players have efficient shot diets?
- Which young players show breakout indicators?
- Which players have similar statistical and shot profiles?
- How has a player changed across seasons?
- Where does a player rank by percentile compared with the league?

This makes the app useful for scouting-style analysis, portfolio demonstration, and future front-office style features.

## Current Limitations

- Public NBA data can be inconsistent across endpoints and seasons.
- Shot make/miss prediction has a natural performance ceiling because basketball shots are noisy.
- Some advanced metrics such as DARKO, EPM, LEBRON, and RAPM may require external data sources or manual CSV imports.
- The current static version does not have a backend API.
- Very large data should be partitioned or converted to a more scalable format before deployment.

## Future Improvements

Strong next steps:

- Add team pages with roster summaries and team-level rankings
- Add optional external advanced metric imports such as EPM, DARKO, LEBRON, RAPM, BPM, or VORP
- Add player role labels based on interpretable scoring and usage features
- Add multi-season player development cards
- Add shot diet similarity by zone distribution
- Add prospect and breakout ranking pages
- Add team fit tools
- Add lineup and rotation impact module
- Move to React if the UI grows beyond what plain JavaScript can comfortably maintain
- Consider DuckDB-WASM with Parquet files for larger static analytics

## Tech Stack

- Python
- Pandas
- Scikit-learn
- LightGBM / deep tabular modeling experiments
- PyTorch-based tabular models
- Plotly.js
- HTML, CSS, JavaScript
- GitHub Pages
- Kaggle notebooks for heavier training and processing

## Project Status

This is an active portfolio project. The current version is a working static analytics app, but the long-term goal is to make it a stronger NBA player evaluation platform with richer data, better model validation, and more practical scouting workflows.
