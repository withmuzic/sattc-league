# SATTC Team League

Standings, schedule, results and finals bracket for the San Antonio Table Tennis Club Team League.

Live page: https://withmuzic.github.io/sattc-league/

## Files
- `index.html`, `style.css`, `app.js` — the dashboard (no build step)
- `data.js` — league data: teams, schedule, game scores. **Currently sample data.**

## Scoring
1 point per game won + 2 bonus for winning the matchup (5-0 = 7/0, 4-1 = 6/1, 3-2 = 5/2).
Tiebreakers: head-to-head, matchup wins, sets won minus sets lost.

Points and standings are computed in the browser from the game scores in `data.js`.

## Results from Google Forms
Players submit results through a Google Form; league managers tick **Approved** in the Google Sheet,
and the dashboard reads approved results from an Apps Script web app (`config.js` → `DATA_URL`).
Setup: [google-apps-script/SETUP.md](google-apps-script/SETUP.md) · script: [google-apps-script/Code.gs](google-apps-script/Code.gs)
