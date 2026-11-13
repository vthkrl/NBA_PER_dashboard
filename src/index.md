---
title: Does PER win games?
---

```js
import {dashboard} from "./components/dashboard.js";
const teams = FileAttachment("data/teams.csv").csv({typed: true});
```

# Does PER win games?

Player Efficiency Rating (PER) is a determining factor in every NBA MVP race. I aim to find out whether it actually impacts winning basketball. <b style="color:#1b9e77">Green = East</b>, <b style="color:#d95f02">orange = West</b>.

```js
display(dashboard(teams, Math.max(width, 900)));
```

<details>
<summary>Table view: all 30 teams</summary>

```js
display(Inputs.table(teams, {
  columns: ["team_name", "conference", "wins", "losses", "win_pct", "best_player", "best_per", "best_gp_pct", "tm8_efg_off", "tm8_efg_on", "roster_per"],
  header: {team_name: "Team", conference: "Conf.", wins: "W", losses: "L", win_pct: "Win%", best_player: "Best player",
    best_per: "PER", best_gp_pct: "Games %", tm8_efg_off: "Tm8 eFG% off", tm8_efg_on: "Tm8 eFG% on", roster_per: "Rest-of-roster PER"},
  rows: 30
}));
```

</details>

**Method.** PER is computed from nba_api season totals with <a href="https://www.basketball-reference.com/about/per.html">Hollinger's formula</a> (league average = 15). "Best player" = the team's highest-PER player with >= 40% of team games and >= 20 minutes per game. Roster PER = minutes-weighted average over the team's other players with >= 250 minutes (the best player is left out). Teammate eFG% removes the star's own shots from the team's on-court totals. Headshots: NBA.com.
