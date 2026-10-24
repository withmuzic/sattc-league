/**
 * Table Tennis Team League — Google Form + Sheet backend
 *
 * One-time setup:
 *   1. Create an empty Google Sheet, open Extensions → Apps Script, paste this file, Save.
 *   2. Run `setup` (choose it in the function dropdown, click Run, allow permissions).
 *   3. Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 *      Put the web-app URL into config.js (DATA_URL) in the GitHub repo.
 *
 * Tabs created:
 *   Settings     key/value league settings (club name, dates, divisions…)
 *   Teams        one row per team (players + ratings). A = higher rating.
 *   Schedule     one row per matchup (League menu → Generate schedule)
 *   Submissions  form responses + review columns (Approved checkbox etc.)
 *   How to       short guide for approvers
 *
 * Only Teams, Schedule and APPROVED scores are exposed by the web app (doGet).
 * Emails, photos and notes stay private in the sheet / Drive.
 */

// ---------------------------------------------------------------- constants
const T = { settings: 'Settings', teams: 'Teams', schedule: 'Schedule', subs: 'Submissions', howto: 'How to' };
const GAME_LABELS = ['Red A vs Blue B', 'Blue A vs Red B', 'Doubles', 'Red A vs Blue A', 'Red B vs Blue B'];
const Q_MATCH = 'Match';
const Q_NOTES = 'Notes (optional)';
const REVIEW_COLS = ['Match ID', 'Check', 'Approved', 'Approved by', 'Approved at'];
// Set score of each game, Red team first. Order matters: shown as-is in the form.
const SCORE_CHOICES = ['3-0 (Red wins)', '3-1 (Red wins)', '3-2 (Red wins)', '2-3 (Blue wins)', '1-3 (Blue wins)', '0-3 (Blue wins)', 'Forfeit: Red wins', 'Forfeit: Blue wins'];
const FORM_DESCRIPTION =
  'Submit the result right after your matchup. Anyone on either team can submit.\n' +
  'For each game, pick the set score with the Red team first (e.g. 3-1 means Red won 3 sets, Blue won 1).\n' +
  'Forfeited game: pick "Forfeit: Red wins" or "Forfeit: Blue wins".\n' +
  'Results appear on the standings after a league manager approves them.';
const NO_MATCH_CHOICE = '(no open matches — ask the league manager)';

const DEFAULT_SETTINGS = [
  ['club', 'San Antonio Table Tennis Club'],
  ['short', 'SATTC'],
  ['season', 'Season 1'],
  ['divisions', 'U3600=3600, U2800=2800'],
  ['weeks', '2026-11-19, 2026-12-03, 2026-12-10, 2026-12-17, 2027-01-07, 2027-01-14, 2027-01-21'],
  ['holidays', '2026-11-26, 2026-12-24, 2026-12-31'],
  ['makeup_deadline', '2027-01-25'],
  ['finals', '2027-01-28'],
  ['match_times', '6:00 PM, 6:00 PM, 7:30 PM, 7:30 PM'],
  ['sample', 'TRUE'],
];

// SAMPLE teams so everything can be tested end to end. Replace before the season.
const SAMPLE_TEAMS = [
  ['U3600', 'Frank Reyes', 1623, 'Jason Wang', 1285],
  ['U3600', 'Cody Park', 1546, 'Sam Reyes', 1205],
  ['U3600', 'Nick Lee', 1782, 'Max Garcia', 1695],
  ['U3600', 'Daniel Lin', 1717, 'Ben Lee', 1684],
  ['U3600', 'Victor Garcia', 1530, 'Daniel Choi', 1292],
  ['U3600', 'George Wilson', 1789, 'Henry Choi', 1481],
  ['U3600', 'Eric Wang', 1563, 'Tom Wang', 1199],
  ['U3600', 'Oscar Lee', 1660, 'Ben Lim', 1614],
  ['U2800', 'Frank Patel', 1373, 'Oscar Cruz', 1048],
  ['U2800', 'Hank Lee', 1415, 'Hank Lopez', 1013],
  ['U2800', 'Oscar Reyes', 1385, 'Eric Lopez', 1266],
  ['U2800', 'Tom Lee', 1402, 'Oscar Patel', 1140],
  ['U2800', 'Zack Chen', 1301, 'Leo Chen', 828],
  ['U2800', 'Hank Jones', 1285, 'Brian Reyes', 1203],
  ['U2800', 'Brian Lopez', 1349, 'Sam Nguyen', 1104],
  ['U2800', 'Hank Reyes', 1458, 'Tom Lucas', 874],
];

// ---------------------------------------------------------------- setup
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FORM_ID')) {
    throw new Error('Setup already ran (form exists). Use the League menu instead.');
  }
  ss.setSpreadsheetTimeZone('America/Chicago');

  // Settings
  const st = getOrCreateSheet_(ss, T.settings);
  st.clear();
  st.getRange('A:B').setNumberFormat('@');
  st.getRange(1, 1, 1, 2).setValues([['Key', 'Value']]).setFontWeight('bold');
  st.getRange(2, 1, DEFAULT_SETTINGS.length, 2).setValues(DEFAULT_SETTINGS);
  st.setColumnWidth(1, 150); st.setColumnWidth(2, 520); st.setFrozenRows(1);

  // Teams
  const tm = getOrCreateSheet_(ss, T.teams);
  tm.clear();
  tm.getRange(1, 1, 1, 8).setValues([['Team ID', 'Division', 'Team name (optional)', 'Player 1', 'Rating 1', 'Player 2', 'Rating 2', 'Combined']]).setFontWeight('bold');
  const counters = {};
  const rows = SAMPLE_TEAMS.map(([div, p1, r1, p2, r2]) => {
    counters[div] = (counters[div] || 0) + 1;
    return [div + '-' + String(counters[div]).padStart(2, '0'), div, '', p1, r1, p2, r2, ''];
  });
  tm.getRange(2, 1, rows.length, 8).setValues(rows);
  tm.getRange(2, 8, 200, 1).setFormulaR1C1('=IF(RC[-4]="","",RC[-3]+RC[-1])');
  tm.setFrozenRows(1);

  // Schedule header (filled by generateSchedule)
  const sc = getOrCreateSheet_(ss, T.schedule);
  sc.clear();
  sc.getRange(1, 1, 1, 10).setValues([['Match ID', 'Division', 'Week', 'Date', 'Time', 'Table', 'Red ID', 'Red team', 'Blue ID', 'Blue team']]).setFontWeight('bold');
  sc.setFrozenRows(1);

  // How to
  const ht = getOrCreateSheet_(ss, T.howto);
  ht.clear();
  ht.getRange(1, 1, 9, 1).setValues([
    ['How to review results'],
    ['1. Open the Submissions tab. Each row is one form submission.'],
    ['2. Check the scores against the photo link (if any) and the "Check" column.'],
    ['3. Tick "Approved" for the correct submission. The dashboard updates within about a minute.'],
    ['4. If a match has two approved rows, the most recently approved one counts.'],
    ['5. To undo, untick "Approved".'],
    ['Scores are set scores with the Red team first, e.g. 3-1 = Red won 3 sets, Blue won 1.'],
    ['Forfeited game: "Forfeit: Red wins" or "Forfeit: Blue wins".'],
    ['Teams/Schedule changes: after editing, use League → Refresh form match list.'],
  ]);
  ht.getRange('A1').setFontWeight('bold').setFontSize(13);
  ht.setColumnWidth(1, 700);

  // Default "Sheet1" cleanup
  const s1 = ss.getSheetByName('Sheet1');
  if (s1 && ss.getSheets().length > 1) ss.deleteSheet(s1);

  // Form
  const short = getSetting_('short') || 'League';
  const form = FormApp.create(short + ' League — Match Result');
  form.setDescription(FORM_DESCRIPTION);
  try { form.setEmailCollectionType(FormApp.EmailCollectionType.VERIFIED); } catch (e) { form.setCollectEmail(true); }
  form.setAllowResponseEdits(false);
  form.setShowLinkToRespondAgain(true);
  form.setConfirmationMessage('Thanks! Your result will appear on the standings once a league manager approves it.');

  form.addListItem().setTitle(Q_MATCH).setHelpText('Pick your matchup. Red/Blue are shown for each team.')
    .setChoiceValues([NO_MATCH_CHOICE]).setRequired(true);
  GAME_LABELS.forEach((label, i) => addScoreItem_(form, i));
  form.addParagraphTextItem().setTitle(Q_NOTES).setHelpText('Lateness, forfeits, anything the league manager should know.');

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  props.setProperty('FORM_ID', form.getId());
  SpreadsheetApp.flush();

  // Rename the response sheet and add review columns
  const resp = findResponseSheet_(SpreadsheetApp.openById(ss.getId()), form);
  resp.setName(T.subs);
  const lastCol = resp.getLastColumn();
  resp.getRange(1, lastCol + 1, 1, REVIEW_COLS.length).setValues([REVIEW_COLS]).setFontWeight('bold').setBackground('#fff4d6');
  resp.setFrozenRows(1);

  // Order tabs
  [T.subs, T.teams, T.schedule, T.settings, T.howto].forEach((n, i) => { ss.setActiveSheet(ss.getSheetByName(n)); ss.moveActiveSheet(i + 1); });

  // Triggers
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('handleSubmit').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('handleEdit').forSpreadsheet(ss).onEdit().create();

  generateSchedule_(true);
  Logger.log('Form (share this): ' + form.getPublishedUrl());
  Logger.log('Form editor: ' + form.getEditUrl());
}

function addScoreItem_(form, i) {
  return form.addListItem().setTitle('Game ' + (i + 1) + ' · ' + GAME_LABELS[i])
    .setHelpText(i === 2 ? 'Doubles · set score, Red team first' : 'A = higher-rated player on the team · set score, Red team first')
    .setChoiceValues(SCORE_CHOICES).setRequired(true);
}

// One-time upgrade for forms created with typed score boxes: replaces them with dropdowns
// and resets the Submissions tab (all existing responses are removed).
function upgradeScoreQuestions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const form = getForm_();
  form.setDescription(FORM_DESCRIPTION);
  form.getItems().forEach(item => {
    const m = item.getTitle().match(/^Game (\d) /);
    if (!m) return;
    const idx = item.getIndex();
    form.deleteItem(item);
    const added = addScoreItem_(form, Number(m[1]) - 1);
    form.moveItem(added.getIndex(), idx);
  });
  form.deleteAllResponses();
  form.removeDestination();
  SpreadsheetApp.flush();
  const old = ss.getSheetByName(T.subs);
  if (old) ss.deleteSheet(old);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();
  const resp = findResponseSheet_(SpreadsheetApp.openById(ss.getId()), form);
  resp.setName(T.subs);
  resp.getRange(1, resp.getLastColumn() + 1, 1, REVIEW_COLS.length).setValues([REVIEW_COLS]).setFontWeight('bold').setBackground('#fff4d6');
  resp.setFrozenRows(1);
  ss.setActiveSheet(resp); ss.moveActiveSheet(1);
  refreshFormChoices();
  clearCache_();
}

// Removes the sample teams, schedule and test submissions so real teams can be entered.
function clearSampleData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tm = ss.getSheetByName(T.teams);
  if (tm.getLastRow() > 1) tm.getRange(2, 1, tm.getLastRow() - 1, 7).clearContent();
  const sc = ss.getSheetByName(T.schedule);
  if (sc.getLastRow() > 1) sc.getRange(2, 1, sc.getLastRow() - 1, 10).clearContent();
  const sub = ss.getSheetByName(T.subs);
  if (sub.getLastRow() > 1) sub.deleteRows(2, sub.getLastRow() - 1);
  getForm_().deleteAllResponses();
  const st = ss.getSheetByName(T.settings);
  const keys = st.getRange(2, 1, st.getLastRow() - 1, 1).getValues().map(r => r[0]);
  const i = keys.indexOf('sample');
  if (i >= 0) st.getRange(i + 2, 2).setValue('FALSE');
  SETTINGS_CACHE = null;
  // Division dropdown on the Teams tab
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(divisions_()), true).setAllowInvalid(false).build();
  tm.getRange(2, 2, 199, 1).setDataValidation(rule);
  tm.getRange(2, 5, 199, 1).setNumberFormat('0');
  tm.hideColumns(1);
  tm.getRange(2, 7, 199, 1).setNumberFormat('0');
  refreshFormChoices();
  clearCache_();
}

// Team IDs are internal: filled automatically for any team row that has a Division and Player 1.
// Numbers are never reused, so existing schedule rows and results stay linked.
function ensureTeamIds_() {
  const tm = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(T.teams);
  if (tm.getLastRow() < 2) return;
  const rng = tm.getRange(2, 1, tm.getLastRow() - 1, 4);
  const vals = rng.getValues();
  const max = {};
  vals.forEach(([id]) => { const m = String(id).match(/^(.+)-(\d+)$/); if (m) max[m[1]] = Math.max(max[m[1]] || 0, Number(m[2])); });
  let changed = false;
  vals.forEach(row => {
    const div = String(row[1]).trim();
    if (!row[0] && div && String(row[3]).trim()) {
      max[div] = (max[div] || 0) + 1;
      row[0] = div + '-' + String(max[div]).padStart(2, '0');
      changed = true;
    }
  });
  if (changed) tm.getRange(2, 1, vals.length, 1).setValues(vals.map(r => [r[0]]));
}

// One-time: hide the Team ID column (IDs are filled automatically from now on).
function autoTeamIds() {
  const tm = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(T.teams);
  tm.getRange('A1').setNote('Filled automatically. Do not edit.');
  tm.hideColumns(1);
  ensureTeamIds_();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('League')
    .addItem('Refresh form match list', 'refreshFormChoices')
    .addItem('Generate schedule (overwrites Schedule tab)', 'generateSchedule')
    .addItem('Re-check all submissions', 'recheckAll')
    .addSeparator()
    .addItem('Show form links', 'showLinks')
    .addToUi();
}

function showLinks() {
  const form = getForm_();
  SpreadsheetApp.getUi().alert('Form for players:\n' + form.getPublishedUrl() + '\n\nForm editor:\n' + form.getEditUrl());
}

// ---------------------------------------------------------------- schedule
function generateSchedule() { generateSchedule_(false); }

function generateSchedule_(silent) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sc = ss.getSheetByName(T.schedule);
  if (!silent && sc.getLastRow() > 1) {
    const ui = SpreadsheetApp.getUi();
    if (ui.alert('Overwrite the Schedule tab?', 'This replaces every matchup in the Schedule tab.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  }
  ensureTeamIds_();
  const weeks = listSetting_('weeks');
  const times = listSetting_('match_times');
  const divs = divisions_();
  const teams = readTeams_();
  const out = [];
  const over = [];
  const tableNo = {}; // per week, across divisions

  Object.keys(divs).forEach(div => {
    const list = teams.filter(t => t.div === div);
    list.forEach(t => { if (t.A.rating + t.B.rating >= divs[div]) over.push(t.name + ' (' + div + ')'); });
    const ids = list.map(t => t.id);
    if (ids.length < 2) return;
    if (ids.length % 2) ids.push(null); // bye
    const n = ids.length;
    const rounds = Math.min(n - 1, weeks.length);
    let arr = ids.slice();
    for (let r = 0; r < rounds; r++) {
      let k = 0;
      for (let i = 0; i < n / 2; i++) {
        let red = arr[i], blue = arr[n - 1 - i];
        if (red === null || blue === null) continue;
        if ((r + i) % 2) [red, blue] = [blue, red];
        k++;
        tableNo[r] = (tableNo[r] || 0) + 1;
        const R = teams.find(t => t.id === red), B = teams.find(t => t.id === blue);
        out.push([div + '-W' + (r + 1) + '-' + k, div, r + 1, weeks[r], times.length ? times[(k - 1) % times.length] : '', tableNo[r], red, R.name, blue, B.name]);
      }
      arr = [arr[0], arr[n - 1]].concat(arr.slice(1, n - 1));
    }
  });

  if (sc.getLastRow() > 1) sc.getRange(2, 1, sc.getLastRow() - 1, 10).clearContent();
  sc.getRange('A:F').setNumberFormat('@');
  if (out.length) sc.getRange(2, 1, out.length, 10).setValues(out);
  refreshFormChoices();
  clearCache_();
  if (!silent) {
    SpreadsheetApp.getUi().alert('Created ' + out.length + ' matchups.' + (over.length ? '\n\nOver the rating cap:\n' + over.join('\n') : ''));
  }
}

// ---------------------------------------------------------------- form choices
function refreshFormChoices() {
  const form = getForm_();
  const sched = readSchedule_();
  const approved = approvedResults_();
  const open = sched.filter(m => !approved[m.id]).sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
  const choices = open.map(m => matchChoice_(m));
  const item = form.getItems(FormApp.ItemType.LIST).find(i => i.getTitle() === Q_MATCH).asListItem();
  item.setChoiceValues(choices.length ? choices : [NO_MATCH_CHOICE]);
}

function matchChoice_(m) {
  return m.div + ' · Wk ' + m.week + ' ' + shortDate_(m.date) + ' · ' + m.redName + ' (Red) vs ' + m.blueName + ' (Blue) · #' + m.id;
}

// ---------------------------------------------------------------- triggers
function handleSubmit(e) {
  const sh = e.range.getSheet();
  checkRow_(sh, e.range.getRow());
  clearCache_();
}

function handleEdit(e) {
  const sh = e.range.getSheet();
  const name = sh.getName();
  if (name === T.subs) {
    const col = headerMap_(sh);
    if (e.range.getColumn() !== col['Approved'] || e.range.getRow() < 2) return;
    for (let r = e.range.getRow(); r <= e.range.getLastRow(); r++) {
      const on = sh.getRange(r, col['Approved']).getValue() === true;
      let who = '';
      try { who = e.user ? e.user.getEmail() : ''; } catch (err) {}
      sh.getRange(r, col['Approved by']).setValue(on ? (who || '(see cell edit history)') : '');
      sh.getRange(r, col['Approved at']).setValue(on ? new Date() : '');
    }
    clearCache_();
    refreshFormChoices();
  } else if (name === T.teams) {
    ensureTeamIds_();
    clearCache_();
  } else if (name === T.schedule || name === T.settings) {
    clearCache_();
  }
}

function recheckAll() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(T.subs);
  for (let r = 2; r <= sh.getLastRow(); r++) checkRow_(sh, r);
  clearCache_();
}

// Fill Match ID, a validation note and the Approved checkbox for one response row.
function checkRow_(sh, row) {
  const col = headerMap_(sh);
  const vals = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
  const get = (h) => vals[col[h] - 1];
  const id = parseMatchId_(get(Q_MATCH));
  const notes = [];
  if (!id) notes.push('No match selected');

  const games = gameHeaders_(col).map(h => parseGame_(get(h)));
  games.forEach((g, i) => { if (g.error) notes.push('Game ' + (i + 1) + ': ' + g.error); });
  if (!notes.length) {
    const r = games.filter(g => g.winner === 'red').length;
    notes.unshift('Result ' + r + '-' + (5 - r) + (r > 2 ? ' Red wins' : ' Blue wins'));
  }
  if (id) {
    const ids = sh.getRange(2, col['Match ID'], Math.max(sh.getLastRow() - 1, 1), 1).getValues().map(x => x[0]);
    const dups = [];
    ids.forEach((x, i) => { if (x === id && i + 2 !== row) dups.push(i + 2); });
    if (dups.length) notes.push('Also submitted in row ' + dups.join(', '));
  }
  sh.getRange(row, col['Match ID']).setValue(id || '');
  sh.getRange(row, col['Check']).setValue(notes.join(' · '));
  const cb = sh.getRange(row, col['Approved']);
  if (cb.getDataValidation() === null) cb.insertCheckboxes();
}

// ---------------------------------------------------------------- parsing
function parseMatchId_(v) {
  const m = String(v || '').match(/#(\S+)\s*$/);
  return m ? m[1] : '';
}

// "11-8, 9-11, 11-5" → {sets:[[11,8],...], winner}; "R"/"B" → forfeit
function parseGame_(v) {
  const s = String(v || '').trim();
  if (/^[Rr]$/.test(s) || /^forfeit\W+red/i.test(s)) return { forfeit: 'red', winner: 'red', sets: [] };
  if (/^[Bb]$/.test(s) || /^forfeit\W+blue/i.test(s)) return { forfeit: 'blue', winner: 'blue', sets: [] };
  const w = s.match(/^([0-3])\s*-\s*([0-3])(?:\s|\(|$)/);
  if (w) {
    const r = Number(w[1]), b = Number(w[2]);
    if (Math.max(r, b) !== 3 || r === b) return { error: 'invalid set score "' + s + '"', sets: [] };
    return { won: [r, b], winner: r > b ? 'red' : 'blue', sets: [] };
  }
  const sets = s.split(',').map(p => p.split('-').map(x => parseInt(x, 10)));
  if (!sets.length || sets.some(p => p.length !== 2 || p.some(isNaN))) return { error: 'unreadable "' + s + '"', sets: [] };
  let r = 0, b = 0, err = '';
  sets.forEach(([x, y], i) => {
    const hi = Math.max(x, y), lo = Math.min(x, y);
    if (!err && (r === 3 || b === 3)) err = 'extra set after the game was decided';
    if (!err && (hi < 11 || hi - lo < 2 || (hi > 11 && hi - lo !== 2))) err = 'invalid set score ' + x + '-' + y;
    x > y ? r++ : b++;
  });
  if (!err && Math.max(r, b) !== 3) err = 'nobody reached 3 sets (' + r + '-' + b + ')';
  return { sets, winner: r > b ? 'red' : 'blue', error: err || undefined };
}

// ---------------------------------------------------------------- data API
function doGet(e) {
  const cache = CacheService.getScriptCache();
  let json = cache.get('league');
  if (!json) {
    json = JSON.stringify(buildLeague_());
    if (json.length < 90000) cache.put('league', json, 120);
  }
  const cb = e && e.parameter && e.parameter.callback;
  if (cb && /^[\w.]+$/.test(cb)) {
    return ContentService.createTextOutput(cb + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function buildLeague_() {
  const divs = divisions_();
  const teams = readTeams_();
  const sched = readSchedule_();
  const approved = approvedResults_();
  const league = {
    club: getSetting_('club'), short: getSetting_('short'), season: getSetting_('season'),
    sample: /^true$/i.test(getSetting_('sample')),
    updated: new Date().toISOString(),
    dates: { weeks: listSetting_('weeks'), holidays: listSetting_('holidays'), makeupDeadline: getSetting_('makeup_deadline'), finals: getSetting_('finals') },
    divisions: {},
  };
  Object.keys(divs).forEach(div => {
    league.divisions[div] = {
      cap: divs[div],
      teams: teams.filter(t => t.div === div).map(t => ({ id: t.id, name: t.name, A: t.A, B: t.B })),
      matches: sched.filter(m => m.div === div).map(m => ({
        id: m.id, week: m.week, date: m.date, time: m.time, table: m.table, red: m.red, blue: m.blue,
        games: approved[m.id] ? approved[m.id].games : null,
      })),
    };
  });
  return league;
}

// match id → {games, at} from approved rows (latest approval wins)
function approvedResults_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(T.subs);
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  const col = headerMap_(sh);
  const gh = gameHeaders_(col);
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  data.forEach((row, i) => {
    if (row[col['Approved'] - 1] !== true) return;
    const id = row[col['Match ID'] - 1] || parseMatchId_(row[col[Q_MATCH] - 1]);
    if (!id) return;
    const at = row[col['Approved at'] - 1];
    const t = at instanceof Date ? at.getTime() : i;
    const games = gh.map((h, k) => {
      const g = parseGame_(row[col[h] - 1]);
      const o = { label: GAME_LABELS[k], sets: g.sets };
      if (g.forfeit) o.forfeit = g.forfeit;
      if (g.won) o.won = g.won;
      return o;
    });
    if (!out[id] || out[id].t <= t) out[id] = { games, t };
  });
  return out;
}

// ---------------------------------------------------------------- readers
function readTeams_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(T.teams);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues()
    .filter(r => r[0] && r[1] && r[3])
    .map(([id, div, name, p1, r1, p2, r2]) => {
      let A = { name: String(p1).trim(), rating: Number(r1) || 0 };
      let B = { name: String(p2).trim(), rating: Number(r2) || 0 };
      if (B.rating > A.rating) [A, B] = [B, A]; // higher rating = A (tie: Player 1)
      const last = (n) => n.split(/\s+/).slice(-1)[0];
      return { id: String(id).trim(), div: String(div).trim(), name: String(name).trim() || (last(A.name) + ' / ' + last(B.name)), A, B };
    });
}

function readSchedule_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(T.schedule);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues()
    .filter(r => r[0])
    .map(([id, div, week, date, time, table, red, redName, blue, blueName]) => ({
      id: String(id).trim(), div: String(div).trim(), week: Number(week), date: toISO_(date),
      time: timeText_(time), table: table === '' ? '' : String(table), red: String(red).trim(), blue: String(blue).trim(),
      redName: String(redName), blueName: String(blueName),
    }));
}

// ---------------------------------------------------------------- helpers
function getForm_() { return FormApp.openById(PropertiesService.getScriptProperties().getProperty('FORM_ID')); }
function clearCache_() { CacheService.getScriptCache().remove('league'); }

function getOrCreateSheet_(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }

function findResponseSheet_(ss, form) {
  const id = form.getId();
  for (let tries = 0; tries < 10; tries++) {
    const s = ss.getSheets().find(sh => { const u = sh.getFormUrl(); return u && u.indexOf(id) >= 0; })
      || ss.getSheets().find(sh => sh.getFormUrl());
    if (s) return s;
    Utilities.sleep(1000);
    SpreadsheetApp.flush();
  }
  throw new Error('Could not find the form response sheet.');
}

function headerMap_(sh) {
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const m = {};
  h.forEach((x, i) => { if (x !== '') m[String(x).trim()] = i + 1; });
  return m;
}

function gameHeaders_(col) {
  return [1, 2, 3, 4, 5].map(n => Object.keys(col).find(h => h.indexOf('Game ' + n + ' ') === 0));
}

let SETTINGS_CACHE = null;
function getSetting_(key) {
  if (!SETTINGS_CACHE) {
    SETTINGS_CACHE = {};
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(T.settings);
    sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 2).getValues().forEach(([k, v]) => {
      if (k) SETTINGS_CACHE[String(k).trim()] = v instanceof Date ? toISO_(v) : String(v).trim();
    });
  }
  return SETTINGS_CACHE[key] || '';
}
function listSetting_(key) { return getSetting_(key).split(',').map(s => s.trim()).filter(Boolean); }
function divisions_() {
  const out = {};
  getSetting_('divisions').split(',').forEach(p => { const [k, v] = p.split('='); if (k && v) out[k.trim()] = Number(v); });
  return out;
}

function toISO_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return String(v || '').trim();
}
function timeText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'h:mm a');
  return String(v || '').trim();
}
function shortDate_(iso) {
  const m = String(iso).match(/^(\d{4})-(\d\d)-(\d\d)$/);
  if (!m) return String(iso);
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1] + ' ' + Number(m[3]);
}
