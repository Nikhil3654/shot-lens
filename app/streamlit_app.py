import ast
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS_DIR = ROOT / "artifacts"

st.set_page_config(page_title="Shot Lens", layout="wide")


@st.cache_data
def load_artifacts():
    paths = {
        "shots": ARTIFACTS_DIR / "shot_predictions_modern.parquet",
        "profiles": ARTIFACTS_DIR / "player_profiles_modern.parquet",
        "zones": ARTIFACTS_DIR / "zone_profiles_modern.parquet",
        "similar": ARTIFACTS_DIR / "similar_players_modern.parquet",
    }

    missing = [str(path) for path in paths.values() if not path.exists()]

    if missing:
        return None, None, None, None, missing

    shots = pd.read_parquet(paths["shots"])
    profiles = pd.read_parquet(paths["profiles"])
    zones = pd.read_parquet(paths["zones"])
    similar = pd.read_parquet(paths["similar"])

    return shots, profiles, zones, similar, []


def parse_similar_players(value):
    if isinstance(value, list):
        return value

    if hasattr(value, "tolist"):
        return value.tolist()

    if value is None:
        return []

    if isinstance(value, str):
        if value.strip() == "":
            return []

        try:
            parsed = ast.literal_eval(value)
            return parsed if isinstance(parsed, list) else [value]
        except Exception:
            return [value]

    return [str(value)]


def format_percent(value):
    if pd.isna(value):
        return "N/A"
    return f"{value:.1%}"


def format_number(value, digits=2):
    if pd.isna(value):
        return "N/A"
    return f"{value:.{digits}f}"


def make_shot_chart(player_shots):
    data = player_shots.copy()
    data["Result"] = data["SHOT_MADE_FLAG"].map({0: "Miss", 1: "Make"})

    fig = px.scatter(
        data,
        x="LOC_X",
        y="LOC_Y",
        color="Result",
        size="EXPECTED_POINTS",
        hover_data=[
            "ACTION_TYPE",
            "SHOT_DISTANCE",
            "SHOT_ZONE_BASIC",
            "MAKE_PROB",
            "EXPECTED_POINTS",
            "ACTUAL_POINTS",
        ],
        color_discrete_map={
            "Make": "#16a34a",
            "Miss": "#dc2626",
        },
        height=650,
    )

    fig.add_trace(
        go.Scatter(
            x=[0],
            y=[0],
            mode="markers",
            marker=dict(
                size=18,
                color="#f97316",
                line=dict(color="#111827", width=2),
            ),
            name="Hoop",
            hoverinfo="skip",
        )
    )

    fig.update_yaxes(scaleanchor="x", scaleratio=1)
    fig.update_layout(
        plot_bgcolor="#f8f4ea",
        paper_bgcolor="#ffffff",
        xaxis_title="Court X",
        yaxis_title="Court Y",
        legend_title_text="Shot Result",
        margin=dict(l=20, r=20, t=20, b=20),
    )

    return fig


def make_zone_chart(zone_data):
    plot_data = zone_data.sort_values("expected_points_per_shot", ascending=False)

    fig = px.bar(
        plot_data,
        x="SHOT_ZONE_BASIC",
        y=["actual_points_per_shot", "expected_points_per_shot"],
        barmode="group",
        height=420,
        labels={
            "value": "Points Per Shot",
            "SHOT_ZONE_BASIC": "Zone",
            "variable": "Metric",
        },
    )

    fig.update_layout(
        margin=dict(l=20, r=20, t=20, b=80),
        legend_title_text="",
    )

    return fig


def make_comparison_chart(compare_df, metric):
    fig = px.line(
        compare_df,
        x="SEASON",
        y=metric,
        markers=True,
        height=380,
    )
    fig.update_layout(
        margin=dict(l=20, r=20, t=20, b=20),
        xaxis_title="Season",
        yaxis_title=metric,
    )
    return fig


st.title("Shot Lens")
st.caption("NBA shot quality, shot making, and advanced player analytics")

shots, profiles, zones, similar, missing = load_artifacts()

if missing:
    st.warning("Missing artifact files:")
    for file in missing:
        st.code(file)
    st.stop()

profiles["PLAYER_ID"] = profiles["PLAYER_ID"].astype(str)
shots["PLAYER_ID"] = shots["PLAYER_ID"].astype(str)
zones["PLAYER_ID"] = zones["PLAYER_ID"].astype(str)
similar["PLAYER_ID"] = similar["PLAYER_ID"].astype(str)

profiles["SEASON"] = profiles["SEASON"].astype(str)
shots["SEASON"] = shots["SEASON"].astype(str)
zones["SEASON"] = zones["SEASON"].astype(str)
similar["SEASON"] = similar["SEASON"].astype(str)

mode = st.sidebar.radio(
    "View",
    [
        "Single Player Season",
        "Player Year Comparison",
    ],
)

players = sorted(profiles["PLAYER_NAME"].dropna().unique())

if mode == "Single Player Season":
    player = st.sidebar.selectbox("Player", players)

    seasons = sorted(
        profiles.loc[profiles["PLAYER_NAME"] == player, "SEASON"]
        .dropna()
        .unique()
    )

    season = st.sidebar.selectbox("Season", seasons)

    player_profile = profiles[
        (profiles["PLAYER_NAME"] == player) &
        (profiles["SEASON"] == season)
    ]

    player_shots = shots[
        (shots["PLAYER_NAME"] == player) &
        (shots["SEASON"] == season)
    ]

    player_zones = zones[
        (zones["PLAYER_NAME"] == player) &
        (zones["SEASON"] == season)
    ]

    if player_profile.empty:
        st.error("No profile found for that player-season.")
        st.stop()

    profile = player_profile.iloc[0]

    st.subheader(f"{player} - {season}")

    col1, col2, col3, col4 = st.columns(4)

    col1.metric("Actual PPS", format_number(profile["actual_points_per_shot"]))
    col2.metric("Expected PPS", format_number(profile["expected_points_per_shot"]))
    col3.metric(
        "Pts Above Exp / 100",
        format_number(profile["points_above_expected_per_100"]),
    )
    col4.metric("Avg Make Prob", format_percent(profile["avg_make_prob"]))

    col5, col6, col7, col8 = st.columns(4)

    col5.metric("TS%", format_percent(profile.get("TS_PCT")))
    col6.metric("Usage%", format_percent(profile.get("USG_PCT")))
    col7.metric("Net Rating", format_number(profile.get("NET_RATING")))
    col8.metric("PIE", format_percent(profile.get("PIE")))

    st.subheader("Shot Chart")
    st.plotly_chart(make_shot_chart(player_shots), use_container_width=True)

    st.subheader("Zone Shot Quality vs Results")
    st.plotly_chart(make_zone_chart(player_zones), use_container_width=True)

    st.subheader("Best / Worst Zones")
    b1, b2 = st.columns(2)
    b1.info(f"Best zone: {profile.get('best_zone', 'N/A')}")
    b2.warning(f"Worst zone: {profile.get('worst_zone', 'N/A')}")

    st.subheader("Zone Table")
    display_cols = [
        "SHOT_ZONE_BASIC",
        "attempts",
        "fg_pct",
        "actual_points_per_shot",
        "expected_points_per_shot",
        "points_above_expected_per_100",
    ]
    display_cols = [c for c in display_cols if c in player_zones.columns]

    st.dataframe(
        player_zones[display_cols].sort_values(
            "points_above_expected_per_100",
            ascending=False,
        ),
        use_container_width=True,
        hide_index=True,
    )

    st.subheader("Similar Players")

    sim_row = similar[
        (similar["PLAYER_NAME"] == player) &
        (similar["SEASON"] == season)
    ]

    if sim_row.empty:
        st.write("No similar players found.")
    else:
        sims = parse_similar_players(sim_row.iloc[0]["similar_players"])
        sim_df = pd.DataFrame(sims)

        if sim_df.empty:
            st.write("No similar players found.")
        else:
            st.dataframe(sim_df, use_container_width=True, hide_index=True)

else:
    player = st.sidebar.selectbox("Player", players)

    compare_df = profiles[
        profiles["PLAYER_NAME"] == player
    ].sort_values("SEASON")

    available_metrics = [
        "actual_points_per_shot",
        "expected_points_per_shot",
        "points_above_expected_per_100",
        "avg_make_prob",
        "TS_PCT",
        "USG_PCT",
        "NET_RATING",
        "PIE",
    ]

    available_metrics = [m for m in available_metrics if m in compare_df.columns]

    selected_metrics = st.sidebar.multiselect(
        "Metrics",
        available_metrics,
        default=[
            "actual_points_per_shot",
            "expected_points_per_shot",
            "points_above_expected_per_100",
        ],
    )

    st.subheader(f"{player} - Year Comparison")

    if not selected_metrics:
        st.info("Select at least one metric.")
        st.stop()

    for metric in selected_metrics:
        st.plotly_chart(
            make_comparison_chart(compare_df, metric),
            use_container_width=True,
        )

    table_cols = [
        "SEASON",
        "shots",
        "actual_points_per_shot",
        "expected_points_per_shot",
        "points_above_expected_per_100",
        "avg_make_prob",
        "TS_PCT",
        "USG_PCT",
        "NET_RATING",
        "PIE",
        "best_zone",
        "worst_zone",
    ]

    table_cols = [c for c in table_cols if c in compare_df.columns]

    st.dataframe(
        compare_df[table_cols],
        use_container_width=True,
        hide_index=True,
    )