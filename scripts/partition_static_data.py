from pathlib import Path
import json
import math
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DOCS_DATA = ROOT / "docs" / "data"
PLAYERS_OUT = DOCS_DATA / "players"


def clean_value(value):
    if value is None:
        return None

    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return round(value, 4)

    return value


def write_json(path, records):
    path.parent.mkdir(parents=True, exist_ok=True)

    cleaned = [
        {key: clean_value(value) for key, value in row.items()}
        for row in records
    ]

    with path.open("w", encoding="utf-8") as file:
        json.dump(cleaned, file, separators=(",", ":"))


def read_json_frame(path):
    if not path.exists():
        print(f"Missing {path}")
        return pd.DataFrame()

    return pd.read_json(path)


def main():
    PLAYERS_OUT.mkdir(parents=True, exist_ok=True)

    profiles_path = DOCS_DATA / "player_profiles.json"
    zones_path = DOCS_DATA / "zone_profiles.json"
    games_path = DOCS_DATA / "player_game_profiles.json"

    profiles = read_json_frame(profiles_path)
    zones = read_json_frame(zones_path)
    games = read_json_frame(games_path)

    if profiles.empty:
        raise RuntimeError("player_profiles.json is required")

    profiles["PLAYER_ID"] = profiles["PLAYER_ID"].astype(str)
    profiles["SEASON"] = profiles["SEASON"].astype(str)

    player_index = (
        profiles.sort_values(["PLAYER_NAME", "SEASON"])
        .groupby(["PLAYER_ID", "PLAYER_NAME"], as_index=False)
        .agg(
            seasons=("SEASON", lambda values: sorted(set(map(str, values)))),
            latest_season=("SEASON", "max"),
        )
        .sort_values("PLAYER_NAME")
    )

    write_json(
        DOCS_DATA / "player_index.json",
        player_index.to_dict("records"),
    )

    slim_profile_cols = [
        col for col in [
            "PLAYER_ID",
            "PLAYER_NAME",
            "SEASON",
            "TEAM_ABBREVIATION",
            "AGE",
            "GP",
            "MIN",
            "PTS",
            "REB",
            "AST",
            "TS_PCT",
            "EFG_PCT",
            "USG_PCT",
            "NET_RATING",
            "PIE",
            "shots",
            "actual_points_per_shot",
            "league_expected_pps",
            "player_expected_pps",
            "shot_making_per_100",
            "player_adjusted_edge_per_100",
            "shot_making_per_100_stable",
            "player_adjusted_edge_per_100_stable",
            "scoring_value_score",
            "all_around_value_score",
            "breakout_probability",
            "projected_next_actual_points_per_shot",
            "projected_next_shot_making_per_100",
            "projected_next_TS_PCT",
            "projected_next_USG_PCT",
        ]
        if col in profiles.columns
    ]

    slim_profiles = profiles[slim_profile_cols].copy()
    write_json(DOCS_DATA / "player_profiles_slim.json", slim_profiles.to_dict("records"))

    for player_id, player_rows in slim_profiles.groupby("PLAYER_ID"):
        write_json(
            PLAYERS_OUT / str(player_id) / "profile.json",
            player_rows.sort_values("SEASON").to_dict("records"),
        )

    if not zones.empty:
        zones["PLAYER_ID"] = zones["PLAYER_ID"].astype(str)
        zones["SEASON"] = zones["SEASON"].astype(str)

        zone_cols = [
            col for col in [
                "PLAYER_ID",
                "PLAYER_NAME",
                "SEASON",
                "SHOT_ZONE_BASIC",
                "SHOT_ZONE_AREA",
                "SHOT_ZONE_RANGE",
                "shots",
                "made",
                "actual_points",
                "actual_points_per_shot",
                "league_expected_pps",
                "player_expected_pps",
                "shot_making_per_100",
                "player_adjusted_edge_per_100",
            ]
            if col in zones.columns
        ]

        zones = zones[zone_cols].copy()

        for (player_id, season), rows in zones.groupby(["PLAYER_ID", "SEASON"]):
            safe_season = str(season).replace("/", "-")
            write_json(
                PLAYERS_OUT / str(player_id) / f"zones_{safe_season}.json",
                rows.to_dict("records"),
            )

    if not games.empty:
        games["PLAYER_ID"] = games["PLAYER_ID"].astype(str)
        games["SEASON"] = games["SEASON"].astype(str)

        game_cols = [
            col for col in [
                "PLAYER_ID",
                "PLAYER_NAME",
                "SEASON",
                "GAME_ID",
                "GAME_DATE",
                "MATCHUP",
                "TEAM_ABBREVIATION",
                "MIN",
                "PTS",
                "REB",
                "AST",
                "FGM",
                "FGA",
                "FG3M",
                "FG3A",
                "FTM",
                "FTA",
                "PLUS_MINUS",
                "TS_PCT",
                "USG_PCT",
                "NET_RATING",
                "PIE",
                "actual_points_per_shot",
                "league_expected_pps",
                "player_expected_pps",
                "shot_making_per_100",
                "player_adjusted_edge_per_100",
            ]
            if col in games.columns
        ]

        games = games[game_cols].copy()

        for (player_id, season), rows in games.groupby(["PLAYER_ID", "SEASON"]):
            safe_season = str(season).replace("/", "-")
            write_json(
                PLAYERS_OUT / str(player_id) / f"games_{safe_season}.json",
                rows.sort_values("GAME_DATE").to_dict("records"),
            )

    manifest = {
        "version": "partitioned-v1",
        "players": int(player_index.shape[0]),
        "seasons": sorted(profiles["SEASON"].dropna().astype(str).unique().tolist()),
        "files": {
            "player_index": "data/player_index.json",
            "player_profiles_slim": "data/player_profiles_slim.json",
        },
    }

    with (DOCS_DATA / "manifest.json").open("w", encoding="utf-8") as file:
        json.dump(manifest, file, indent=2)

    print("Partitioned static data written.")
    print(f"Players: {manifest['players']}")
    print(f"Seasons: {', '.join(manifest['seasons'])}")


if __name__ == "__main__":
    main()