# Google Form + Google Sheet setup (one time)

## 1. Create the sheet and add the script
1. Create a blank Google Sheet at sheets.new and name it `SATTC League Data`.
2. Open **Extensions → Apps Script**.
3. Delete the default `Code.gs` content, paste all of `Code.gs` from this folder, and save.
4. Choose **setup** in the function dropdown and click **Run**.
   - When asked for permissions: pick your account → "Advanced" → "Go to (unsafe)" → Allow.
   - This warning appears for any script you wrote yourself; it is expected.
5. When it finishes, reload the sheet. You will see the tabs (Submissions, Teams, Schedule, Settings, How to) and a **League** menu.
   - 16 sample teams and a schedule are included so you can test right away.

## 2. Add the photo question to the form (scripts cannot create this item)
1. Open the "Form editor" link from **League → Show form links**.
2. Below the Notes question, add a question: type **File upload**, title `Score sheet photo (optional)`, **Required off**.
   - Photos are saved in your Google Drive form folder and are not public.
3. In the form settings under Responses, check that "Collect email addresses" is set to **Verified**.

## 3. Create the data URL for the dashboard
1. In Apps Script, click **Deploy → New deployment**.
2. Select type (⚙️) → **Web app**.
3. Execute as: **Me**, Who has access: **Anyone** → Deploy.
4. Copy the **Web app URL** (ends in `/exec`).
   - This URL only exposes teams, the schedule and **approved scores**. Emails, photos and notes are never sent.

## 4. Connect the GitHub dashboard
Put the URL in `config.js` and push.
```js
window.CONFIG = {
  DATA_URL: "https://script.google.com/macros/s/……/exec",
};
```

## 5. Invite league managers
- Click **Share** in the sheet and add each manager as an **Editor**.
- Managers review rows in the Submissions tab and tick **Approved**. The dashboard updates within 1–2 minutes.
- To see who approved a row, right-click the cell → **Show edit history**. (With personal Gmail accounts the "Approved by" column may stay blank.)

## 6. Before the real season (after sign-up closes Nov 15)
0. Remove the sample data once: in Apps Script, choose **clearSampleData** and click **Run**. It empties Teams, Schedule and Submissions, sets `sample` to `FALSE`, and adds a Division dropdown to the Teams tab.
1. **Teams** tab: enter the real teams (Division, both players and ratings). The Team ID column is hidden and filled automatically.
   - Leave Team name blank to show "Last name / Last name" automatically.
   - The higher-rated player automatically becomes A (captain).
2. **League → Generate schedule**: creates the round-robin schedule and updates the form dropdown. It warns about any team over the rating cap.
3. Adjust times and tables in the **Schedule** tab if needed, then run **League → Refresh form match list**.

## Score entry rules (also shown on the form)
- Each game is a dropdown with the **set score, Red team first**: `3-0`, `3-1`, `3-2` (Red wins) or `2-3`, `1-3`, `0-3` (Blue wins).
- Forfeited game: `Forfeit: Red wins` or `Forfeit: Blue wins`.
  - Only one player shows: pick the set scores for that player's two singles; the other three games are forfeits to the opponent.
  - Whole matchup forfeited (30 minutes late, etc.): all five games are forfeits → 5-0, 7 points.
- If a match is submitted twice, the Check column shows "Also submitted in row N". Among approved rows, the **most recently approved** one counts.
- Approved matches are removed from the form's match list automatically.

## Making changes
- After editing `Code.gs`, go to **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy** so the data URL picks up the change. The URL stays the same.
