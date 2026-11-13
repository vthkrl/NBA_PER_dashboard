import time
from pathlib import Path

import pandas as pd
from nba_api.stats.endpoints import (
    leaguedashteamstats,
    leaguestandingsv3,
    teamplayerdashboard,
    teamplayeronoffdetails,
)

SEASON = "2025-26"
BEST_MIN_GAMES_PCT = 0.40
BEST_MIN_MPG = 20
ROSTER_MIN_MINUTES = 250

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUT_FILE = ROOT / "src" / "data" / "teams.csv"


def fetch(name, endpoint, **params):
    cached = sorted(RAW_DIR.glob(f"{SEASON}_{name}_*.csv"))
    if cached:
        return [pd.read_csv(f) for f in cached]

    for attempt in range(1, 4):
        try:
            tables = endpoint(season=SEASON, timeout=60, **params).get_data_frames()
            break
        except Exception as error:
            if attempt == 3:
                raise
            print(f"  {name}: attempt {attempt} failed ({error}); retrying in 10 s")
            time.sleep(10)

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for i, table in enumerate(tables):
        table.to_csv(RAW_DIR / f"{SEASON}_{name}_{i}.csv", index=False)
    time.sleep(1)
    return tables


def compute_per(p, lg):
    factor = 2 / 3 - (0.5 * lg.AST / lg.FGM) / (2 * lg.FGM / lg.FTM)
    vop = lg.PTS / (lg.FGA - lg.OREB + lg.TOV + 0.44 * lg.FTA)
    drb_pct = lg.DREB / lg.REB
    tm_ast_ratio = p.TM_AST / p.TM_FGM

    uper = (1 / p.MIN) * (
        p.FG3M
        + 2 / 3 * p.AST
        + (2 - factor * tm_ast_ratio) * p.FGM
        + p.FTM * 0.5 * (1 + (1 - tm_ast_ratio) + 2 / 3 * tm_ast_ratio)
        - vop * p.TOV
        - vop * drb_pct * (p.FGA - p.FGM)
        - vop * 0.44 * (0.44 + 0.56 * drb_pct) * (p.FTA - p.FTM)
        + vop * (1 - drb_pct) * p.DREB
        + vop * drb_pct * p.OREB
        + vop * p.STL
        + vop * drb_pct * p.BLK
        - p.PF * (lg.FTM / lg.PF - 0.44 * (lg.FTA / lg.PF) * vop)
    )

    aper = uper * (lg.PACE / p.TM_PACE)
    lg_aper = (aper * p.MIN).sum() / p.MIN.sum()
    return aper * 15 / lg_aper


def efg(fgm, fg3m, fga):
    return (fgm + 0.5 * fg3m) / fga


def main():
    teams = fetch("team_totals", leaguedashteamstats.LeagueDashTeamStats)[0]
    advanced = fetch("team_advanced", leaguedashteamstats.LeagueDashTeamStats,
                     measure_type_detailed_defense="Advanced")[0]
    standings = fetch("standings", leaguestandingsv3.LeagueStandingsV3)[0]
    teams = teams.merge(advanced[["TEAM_ID", "PACE"]], on="TEAM_ID")
    teams = teams.merge(standings[["TeamID", "Conference"]], left_on="TEAM_ID", right_on="TeamID")

    league = teams[["AST", "FGM", "FGA", "FTM", "FTA", "PTS", "OREB", "DREB", "REB", "TOV", "PF"]].sum()
    league["PACE"] = teams.PACE.mean()

    players, on_court, off_court = [], [], []
    for i, team in enumerate(teams.itertuples(), 1):
        print(f"[{i:2d}/{len(teams)}] {team.TEAM_NAME}")
        roster = fetch(f"players_{team.TEAM_ID}", teamplayerdashboard.TeamPlayerDashboard,
                       team_id=team.TEAM_ID)[1]
        roster["TEAM_ID"] = team.TEAM_ID
        players.append(roster)
        _, on, off = fetch(f"onoff_{team.TEAM_ID}", teamplayeronoffdetails.TeamPlayerOnOffDetails,
                           team_id=team.TEAM_ID)
        on_court.append(on)
        off_court.append(off)
    on_court = pd.concat(on_court)
    off_court = pd.concat(off_court)

    players = pd.concat(players)
    players = players[players.MIN > 0].merge(
        teams[["TEAM_ID", "AST", "FGM", "PACE"]].rename(
            columns={"AST": "TM_AST", "FGM": "TM_FGM", "PACE": "TM_PACE"}),
        on="TEAM_ID")
    players["PER"] = compute_per(players, league)

    rows = []
    for team in teams.itertuples():
        roster = players[players.TEAM_ID == team.TEAM_ID]

        eligible = roster[(roster.GP >= BEST_MIN_GAMES_PCT * team.GP) & (roster.MIN / roster.GP >= BEST_MIN_MPG)]
        best = eligible.loc[eligible.PER.idxmax()]

        regulars = roster[(roster.MIN >= ROSTER_MIN_MINUTES) & (roster.PLAYER_ID != best.PLAYER_ID)]
        roster_per = (regulars.PER * regulars.MIN).sum() / regulars.MIN.sum()

        on = on_court[(on_court.TEAM_ID == team.TEAM_ID) & (on_court.VS_PLAYER_ID == best.PLAYER_ID)].iloc[0]
        off = off_court[(off_court.TEAM_ID == team.TEAM_ID) & (off_court.VS_PLAYER_ID == best.PLAYER_ID)].iloc[0]

        rows.append({
            "team": on.TEAM_ABBREVIATION,
            "team_name": team.TEAM_NAME,
            "conference": team.Conference,
            "wins": team.W,
            "losses": team.L,
            "win_pct": team.W / (team.W + team.L),
            "best_player_id": best.PLAYER_ID,
            "best_player": best.PLAYER_NAME,
            "best_per": best.PER,
            "best_gp_pct": best.GP / team.GP,
            "tm8_efg_on": efg(on.FGM - best.FGM, on.FG3M - best.FG3M, on.FGA - best.FGA),
            "tm8_efg_off": efg(off.FGM, off.FG3M, off.FGA),
            "roster_per": roster_per,
        })

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    table = pd.DataFrame(rows).sort_values("win_pct", ascending=False)
    table.to_csv(OUT_FILE, index=False, float_format="%.4f")
    print(f"Wrote {len(table)} teams to {OUT_FILE}")


if __name__ == "__main__":
    main()
