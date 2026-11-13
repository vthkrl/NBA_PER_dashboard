# Does PER win games?

A coordinated multi-view dashboard (D3 + Observable Framework) testing whether Player Efficiency Rating relates to NBA team win% in the 2025-26 season.

- **View A:** each team's best player's PER vs. team win% (dot size = share of games played; brush to select).
- **View B:** teammates' eFG% with the star off court (left) vs. on court (right).
- **View C:** minutes-weighted PER of the rest of the roster vs. team win%.

Hovering or clicking a team highlights it in all three views.

## Files

| File | Purpose |
| --- | --- |
| `pipeline/build.py` | Fetches stats with `nba_api`, computes PER (Hollinger), writes `src/data/teams.csv` |
| `src/index.md` | The page |
| `src/components/dashboard.js` | The three D3 views and linked highlighting |
| `src/style.css` | Styling |
| `observablehq.config.js` | Site settings |

## Running

```sh
pip install -r requirements.txt
npm install
npm run data   # optional: refetch data (must run locally; stats.nba.com blocks cloud IPs)
npm run dev    # preview at http://127.0.0.1:3000
npm run build  # static site in dist/
```

Pushing to `main` deploys the site to GitHub Pages via `.github/workflows/deploy.yml`.
