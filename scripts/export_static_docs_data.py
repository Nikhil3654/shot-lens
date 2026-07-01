from pathlib import Path
import json
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts"
OUT = ROOT / "docs" / "data"

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "shots").mkdir(parents=True, exist_ok=True)

profiles = pd.read_parquet(ARTIFACTS / "player_profiles_two_model_v2.parquet")
zones = pd.read_parquet(ARTIFACTS / "zone_profiles_two_model_v2.parquet")
similar = pd.read_parquet(ARTIFACTS / "similar_players_two_model_v2.parquet")
metrics = pd.read_csv(ARTIFACTS / "model_metrics_v2.csv")
shots = pd.read_parquet(ARTIFACTS / "shot_predictions_two_model_v2.parquet")

for df in [profiles, zones, similar, shots]:
    df["PLAYER_ID"] = df["PLAYER_ID"].astype(str)
    df["SEASON"] = df["SEASON"].astype(str)

profiles.to_json(OUT / "player_profiles.json", orient="records")
zones.to_json(OUT / "zone_profiles.json", orient="records")
similar.to_json(OUT / "similar_players.json", orient="records")
metrics.to_json(OUT / "model_metrics.json", orient="records")

index_rows = []

for (player_id, season), group in shots.groupby(["PLAYER_ID", "SEASON"]):
    safe_name = f"player_{player_id}_{season}.json"

    keep_cols = [
        "PLAYER_ID",
        "PLAYER_NAME",
        "SEASON",
        "LOC_X",
        "LOC_Y",
        "SHOT_MADE_FLAG",
        "SHOT_DISTANCE",
        "SHOT_ZONE_BASIC",
        "ACTION_TYPE",
        "LEAGUE_MAKE_PROB",
        "PLAYER_MAKE_PROB",
        "LEAGUE_EXPECTED_POINTS",
        "PLAYER_EXPECTED_POINTS",
        "SHOT_MAKING_POINTS",
        "PLAYER_ADJUSTED_EDGE",
    ]

    keep_cols = [c for c in keep_cols if c in group.columns]

    group[keep_cols].to_json(
        OUT / "shots" / safe_name,
        orient="records",
    )

    index_rows.append({
        "PLAYER_ID": player_id,
        "PLAYER_NAME": group["PLAYER_NAME"].iloc[0],
        "SEASON": season,
        "file": f"data/shots/{safe_name}",
    })

with open(OUT / "shot_index.json", "w", encoding="utf-8") as f:
    json.dump(index_rows, f)

game_profiles = (
    shots.groupby(["PLAYER_ID", "PLAYER_NAME", "SEASON", "GAME_ID", "GAME_DATE"])
    .agg(
        shots=("SHOT_MADE_FLAG", "count"),
        makes=("SHOT_MADE_FLAG", "sum"),
        actual_points=("ACTUAL_POINTS", "sum"),
        league_expected_points=("LEAGUE_EXPECTED_POINTS", "sum"),
        player_expected_points=("PLAYER_EXPECTED_POINTS", "sum"),
        shot_making_points=("SHOT_MAKING_POINTS", "sum"),
        player_adjusted_edge=("PLAYER_ADJUSTED_EDGE", "sum"),
    )
    .reset_index()
)

game_profiles["actual_points_per_shot"] = (
    game_profiles["actual_points"] / game_profiles["shots"]
)

game_profiles["league_expected_pps"] = (
    game_profiles["league_expected_points"] / game_profiles["shots"]
)

game_profiles["player_expected_pps"] = (
    game_profiles["player_expected_points"] / game_profiles["shots"]
)

game_profiles["shot_making_per_100"] = (
    game_profiles["shot_making_points"] / game_profiles["shots"] * 100
)

game_profiles["player_adjusted_edge_per_100"] = (
    game_profiles["player_adjusted_edge"] / game_profiles["shots"] * 100
)

game_profiles["GAME_DATE"] = pd.to_datetime(
    game_profiles["GAME_DATE"],
    errors="coerce",
).dt.strftime("%Y-%m-%d")

game_profiles = game_profiles.sort_values(
    ["PLAYER_ID", "SEASON", "GAME_DATE", "GAME_ID"]
)

projections = pd.read_parquet(ARTIFACTS / "player_projections_v1.parquet")
projection_metrics = pd.read_csv(ARTIFACTS / "player_projection_metrics_v1.csv")
breakout_metrics = pd.read_csv(ARTIFACTS / "breakout_metrics_v1.csv")

projections["PLAYER_ID"] = projections["PLAYER_ID"].astype(str)
projections["SEASON"] = projections["SEASON"].astype(str)

projections.to_json(OUT / "player_projections.json", orient="records")
projection_metrics.to_json(OUT / "player_projection_metrics.json", orient="records")
breakout_metrics.to_json(OUT / "breakout_metrics.json", orient="records")

rolling_rows = []

for (player_id, season), group in game_profiles.groupby(["PLAYER_ID", "SEASON"]):
    group = group.copy()
    group["rolling_5_shot_making_per_100"] = (
        group["shot_making_per_100"].rolling(5, min_periods=1).mean()
    )
    group["rolling_5_league_expected_pps"] = (
        group["league_expected_pps"].rolling(5, min_periods=1).mean()
    )
    group["rolling_5_actual_pps"] = (
        group["actual_points_per_shot"].rolling(5, min_periods=1).mean()
    )
    rolling_rows.append(group)

game_profiles = pd.concat(rolling_rows, ignore_index=True)

game_profiles.to_json(OUT / "player_game_profiles.json", orient="records")

print("Exported static data to docs/data")
print("Profiles:", profiles.shape)
print("Zones:", zones.shape)
print("Similar:", similar.shape)
print("Shots:", shots.shape)