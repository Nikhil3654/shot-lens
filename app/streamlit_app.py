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
        "shots": ARTIFACTS_DIR / "shot_predictions_two_model_v2.parquet",
        "profiles": ARTIFACTS_DIR / "player_profiles_two_model_v2.parquet",
        "zones": ARTIFACTS_DIR / "zone_profiles_two_model_v2.parquet",
        "similar": ARTIFACTS_DIR / "similar_players_two_model_v2.parquet",
        "metrics": ARTIFACTS_DIR / "model_metrics_v2.csv",
    }

    missing = [str(path) for path in paths.values() if not path.exists()]

    if missing:
        return None, None, None, None, None, missing

    shots = pd.read_parquet(paths["shots"])
    profiles = pd.read_parquet(paths["profiles"])
    zones = pd.read_parquet(paths["zones"])
    similar = pd.read_parquet(paths["similar"])
    metrics = pd.read_csv(paths["metrics"])

    return shots, profiles, zones, similar, metrics, []


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
        size="LEAGUE_EXPECTED_POINTS",
        hover_data=[
            "ACTION_TYPE",
            "SHOT_DISTANCE",
            "SHOT_ZONE_BASIC",
            "LEAGUE_MAKE_PROB",
            "PLAYER_MAKE_PROB",
            "LEAGUE_EXPECTED_POINTS",
            "PLAYER_EXPECTED_POINTS",
            "SHOT_MAKING_POINTS",
            "PLAYER_ADJUSTED_EDGE",
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
    plot_data = zone_data.sort_values("league_expected_pps", ascending=False)

    fig = px.bar(
        plot_data,
        x="SHOT_ZONE_BASIC",
        y=[
            "actual_points_per_shot",
            "league_expected_pps",
            "player_expected_pps",
        ],
        barmode="group",
        height=430,
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
st.caption("Two-model NBA shot quality, shot making, and player-adjusted analytics")

shots, profiles, zones, similar, metrics, missing = load_artifacts()

if missing:
    st.warning("Missing artifact files:")
    for file in missing:
        st.code(file)
    st.stop()

for df in [profiles, shots, zones, similar]:
    df["PLAYER_ID"] = df["PLAYER_ID"].astype(str)
    df["SEASON"] = df["SEASON"].astype(str)

mode = st.sidebar.radio(
    "View",
    [
        "Single Player Season",
        "Player Year Comparison",
        "Model Metrics",
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
    col2.metric("League Expected PPS", format_number(profile["league_expected_pps"]))
    col3.metric("Player Expected PPS", format_number(profile["player_expected_pps"]))
    col4.metric("Shot Making / 100", format_number(profile["shot_making_per_100"]))

    col5, col6, col7, col8 = st.columns(4)
    col5.metric(
        "Player Edge / 100",
        format_number(profile["player_adjusted_edge_per_100"]),
    )
    col6.metric("Avg Shot Quality", format_percent(profile["avg_league_make_prob"]))
    col7.metric("Avg Player Prob", format_percent(profile["avg_player_make_prob"]))
    col8.metric("Shot Distance", format_number(profile["avg_shot_distance"]))

    col9, col10, col11, col12 = st.columns(4)
    col9.metric("TS%", format_percent(profile.get("TS_PCT")))
    col10.metric("Usage%", format_percent(profile.get("USG_PCT")))
    col11.metric("Net Rating", format_number(profile.get("NET_RATING")))
    col12.metric("PIE", format_percent(profile.get("PIE")))

    st.subheader("Shot Chart")
    st.plotly_chart(make_shot_chart(player_shots), use_container_width=True)

    st.subheader("Zone Shot Quality vs Player Expectation")
    st.plotly_chart(make_zone_chart(player_zones), use_container_width=True)

    st.subheader("Best / Worst Shot-Making Zones")
    b1, b2 = st.columns(2)
    b1.info(
        f"Best zone: {profile.get('best_zone', 'N/A')} "
        f"({format_number(profile.get('best_zone_shot_making_per_100'))} per 100)"
    )
    b2.warning(
        f"Worst zone: {profile.get('worst_zone', 'N/A')} "
        f"({format_number(profile.get('worst_zone_shot_making_per_100'))} per 100)"
    )

    st.subheader("Zone Table")
    display_cols = [
        "SHOT_ZONE_BASIC",
        "attempts",
        "fg_pct",
        "actual_points_per_shot",
        "league_expected_pps",
        "player_expected_pps",
        "shot_making_per_100",
        "player_adjusted_edge_per_100",
    ]
    display_cols = [c for c in display_cols if c in player_zones.columns]

    st.dataframe(
        player_zones[display_cols].sort_values(
            "shot_making_per_100",
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

elif mode == "Player Year Comparison":
    player = st.sidebar.selectbox("Player", players)

    compare_df = profiles[
        profiles["PLAYER_NAME"] == player
    ].sort_values("SEASON")

    available_metrics = [
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
    ]

    available_metrics = [m for m in available_metrics if m in compare_df.columns]

    selected_metrics = st.sidebar.multiselect(
        "Metrics",
        available_metrics,
        default=[
            "actual_points_per_shot",
            "league_expected_pps",
            "shot_making_per_100",
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
        "best_zone",
        "worst_zone",
    ]

    table_cols = [c for c in table_cols if c in compare_df.columns]

    st.dataframe(
        compare_df[table_cols],
        use_container_width=True,
        hide_index=True,
    )

else:
    st.subheader("Model Metrics")

    st.write(
        "The league model estimates average shot quality without player identity. "
        "The player-adjusted model adds player/team context."
    )

    st.dataframe(metrics, use_container_width=True, hide_index=True)

    metric_long = metrics.melt(
        id_vars="model",
        value_vars=["log_loss", "roc_auc", "brier"],
        var_name="metric",
        value_name="value",
    )

    fig = px.bar(
        metric_long,
        x="metric",
        y="value",
        color="model",
        barmode="group",
        height=420,
    )

    st.plotly_chart(fig, use_container_width=True)