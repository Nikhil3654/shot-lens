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
    shots_path = ARTIFACTS_DIR / "shot_predictions.parquet"
    profiles_path = ARTIFACTS_DIR / "player_profiles.parquet"
    similar_path = ARTIFACTS_DIR / "similar_players.parquet"

    missing = [
        str(path.relative_to(ROOT))
        for path in [shots_path, profiles_path, similar_path]
        if not path.exists()
    ]

    if missing:
        return None, None, None, missing

    shots = pd.read_parquet(shots_path)
    profiles = pd.read_parquet(profiles_path)
    similar = pd.read_parquet(similar_path)

    return shots, profiles, similar, []


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


def make_style_chart(profile):
    labels = ["Rim", "Midrange", "Corner 3", "Above Break 3"]
    columns = ["rim_rate", "midrange_rate", "corner_3_rate", "above_break_3_rate"]

    df = pd.DataFrame({
        "Shot Area": labels,
        "Rate": [float(profile[col]) for col in columns],
    })

    fig = px.bar(
        df,
        x="Shot Area",
        y="Rate",
        text=df["Rate"].map(lambda x: f"{x:.1%}"),
        color="Shot Area",
        color_discrete_sequence=["#2563eb", "#dc2626", "#16a34a", "#9333ea"],
        height=340,
    )

    fig.update_traces(textposition="outside")
    fig.update_layout(
        showlegend=False,
        yaxis_tickformat=".0%",
        yaxis_title="Share of Attempts",
        xaxis_title="",
        margin=dict(l=20, r=20, t=20, b=20),
    )

    return fig


st.title("Shot Lens")
st.caption("NBA expected shot value, player style, and shot profile analytics")

shots, profiles, similar, missing = load_artifacts()

if missing:
    st.warning("The app is ready, but these artifact files are missing:")
    for file in missing:
        st.code(file)
    st.stop()

players = sorted(profiles["PLAYER_NAME"].dropna().unique())
player = st.sidebar.selectbox("Player", players)

seasons = sorted(
    profiles.loc[profiles["PLAYER_NAME"] == player, "SEASON"]
    .dropna()
    .unique()
)
season = st.sidebar.selectbox("Season", seasons)

player_shots = shots[
    (shots["PLAYER_NAME"] == player) &
    (shots["SEASON"] == season)
].copy()

profile_row = profiles[
    (profiles["PLAYER_NAME"] == player) &
    (profiles["SEASON"] == season)
]

if player_shots.empty or profile_row.empty:
    st.error("No data found for that player-season.")
    st.stop()

profile = profile_row.iloc[0]

col1, col2, col3, col4 = st.columns(4)

col1.metric("Shots", f"{int(profile['shots']):,}")
col2.metric("Expected Points", f"{profile['expected_points']:.1f}")
col3.metric("Actual Points", f"{profile['actual_points']:.1f}")
col4.metric("Points Above Expected", f"{profile['points_above_expected']:.1f}")

left, right = st.columns([2, 1])

with left:
    st.subheader("Shot Chart")
    st.plotly_chart(make_shot_chart(player_shots), use_container_width=True)

with right:
    st.subheader("Player Style")
    st.plotly_chart(make_style_chart(profile), use_container_width=True)

    st.subheader("Archetype")
    st.info(profile["archetype"])

st.subheader("Zone Summary")

zone_summary = (
    player_shots.groupby("SHOT_ZONE_BASIC")
    .agg(
        attempts=("SHOT_MADE_FLAG", "count"),
        makes=("SHOT_MADE_FLAG", "sum"),
        actual_points=("ACTUAL_POINTS", "sum"),
        expected_points=("EXPECTED_POINTS", "sum"),
        points_above_expected=("POINTS_ABOVE_EXPECTED", "sum"),
    )
    .reset_index()
)

zone_summary["fg_pct"] = zone_summary["makes"] / zone_summary["attempts"]
zone_summary = zone_summary.sort_values("points_above_expected", ascending=False)

st.dataframe(
    zone_summary,
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
    similar_players = parse_similar_players(sim_row.iloc[0]["similar_players"])
    for sim_player in similar_players:
        st.write(f"- {sim_player}")