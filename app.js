(function () {
  const $ = (s) => document.querySelector(s);
  const DATA_URL = (window.CONFIG && window.CONFIG.DATA_URL) || "";

  function start(L) {
  const state = { div: Object.keys(L.divisions)[0], tab: "standings" };
  try { const s = JSON.parse(localStorage.getItem("ttl-state")); if (s && L.divisions[s.div]) Object.assign(state, s); } catch (e) {}

  const TABS = [["standings", "Standings"], ["schedule", "Schedule"], ["teams", "Teams"], ["finals", "Finals"]];

  // ---------- scoring ----------
  function gameWinner(g) {
    if (g.forfeit) return { winner: g.forfeit, r: 0, b: 0, forfeit: true };
    if (g.won) return { winner: g.won[0] > g.won[1] ? "red" : "blue", r: g.won[0], b: g.won[1] };
    let r = 0, b = 0;
    g.sets.forEach(([x, y]) => (x > y ? r++ : b++));
    return { winner: r > b ? "red" : "blue", r, b };
  }
  function matchResult(m) {
    if (!m.games) return null;
    let rg = 0, bg = 0, rs = 0, bs = 0;
    const games = m.games.map((g) => { const w = gameWinner(g); w.winner === "red" ? rg++ : bg++; rs += w.r; bs += w.b; return w; });
    const winner = rg > bg ? "red" : "blue";
    return { rg, bg, rs, bs, winner, games,
      redPts: rg + (winner === "red" ? 2 : 0), bluePts: bg + (winner === "blue" ? 2 : 0) };
  }

  function standings(divKey) {
    const d = L.divisions[divKey];
    const T = {};
    d.teams.forEach((t) => (T[t.id] = { team: t, mp: 0, w: 0, l: 0, gw: 0, gl: 0, sw: 0, sl: 0, pts: 0, h2h: {} }));
    d.matches.forEach((m) => {
      const r = matchResult(m); if (!r) return;
      const R = T[m.red], B = T[m.blue];
      R.mp++; B.mp++;
      R.gw += r.rg; R.gl += r.bg; B.gw += r.bg; B.gl += r.rg;
      R.sw += r.rs; R.sl += r.bs; B.sw += r.bs; B.sl += r.rs;
      R.pts += r.redPts; B.pts += r.bluePts;
      if (r.winner === "red") { R.w++; B.l++; } else { B.w++; R.l++; }
      R.h2h[m.blue] = (R.h2h[m.blue] || 0) + r.redPts - r.bluePts;
      B.h2h[m.red] = (B.h2h[m.red] || 0) + r.bluePts - r.redPts;
    });
    const rows = Object.values(T);
    rows.sort((a, b) =>
      b.pts - a.pts ||
      (b.h2h[a.team.id] || 0) - (a.h2h[b.team.id] || 0) || // head-to-head (2-way)
      b.w - a.w ||
      (b.sw - b.sl) - (a.sw - a.sl) ||
      a.team.name.localeCompare(b.team.name)); // coin flip placeholder
    return rows;
  }

  // ---------- helpers ----------
  const teamById = (id) => L.divisions[state.div].teams.find((t) => t.id === id);
  const fmtDate = (iso, opts) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", opts || { weekday: "short", month: "short", day: "numeric" });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const now = new Date();
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const teamTotal = (id) => L.divisions[state.div].matches.filter((m) => m.red === id || m.blue === id).length;
  const teamCell = (t) => `<div class="team"><b>${esc(t.name)}</b><span>${esc(t.A.name)} (${t.A.rating}) · ${esc(t.B.name)} (${t.B.rating})</span></div>`;

  // ---------- views ----------
  function viewStandings() {
    const rows = standings(state.div);
    const d = L.divisions[state.div];
    return `<div class="card"><h2>${state.div} Standings <span class="muted small">· combined rating under ${d.cap.toLocaleString()}</span></h2>
      <div class="tablewrap"><table>
      <thead><tr><th>#</th><th class="l">Team</th><th>MP</th><th>W-L</th><th class="hide-sm">Games</th><th class="hide-sm">Sets ±</th><th>Pts</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr class="${i < 4 ? "q" : ""}">
        <td class="rank">${i + 1}</td><td class="l">${teamCell(r.team)}</td>
        <td>${r.mp}</td><td>${r.w}-${r.l}</td><td class="hide-sm">${r.gw}-${r.gl}</td>
        <td class="hide-sm">${r.sw - r.sl > 0 ? "+" : ""}${r.sw - r.sl}</td><td class="pts">${r.pts}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="legend"><i></i>Top 4 advance to Finals (Thu ${fmtDate(L.dates.finals, { month: "short", day: "numeric" })})</div>
    </div>
    <div class="notice">Points: 1 per game won + 2 for winning the matchup · 5-0 = 7/0 · 4-1 = 6/1 · 3-2 = 5/2.
    Tiebreakers: head-to-head, matchup wins, sets won minus sets lost.</div>`;
  }

  function matchCard(m) {
    const red = teamById(m.red), blue = teamById(m.blue);
    const r = matchResult(m);
    const side = (t, color, games, pts, won) =>
      `<div class="row"><span class="${won ? "win" : ""}"><span class="dot ${color}"></span>${esc(t.name)}</span>
       <span>${r ? `<span class="score">${games}</span> <span class="muted small">${pts} pts</span>` : ""}</span></div>`;
    let detail = "";
    if (r) {
      const who = (label) => {
        const map = { "Red A": red.A.name, "Red B": red.B.name, "Blue A": blue.A.name, "Blue B": blue.B.name };
        return label === "Doubles" ? "Doubles" : label.replace(/(Red|Blue) [AB]/g, (k) => map[k]);
      };
      detail = `<div class="detail">${m.games.map((g, i) => {
        const w = r.games[i];
        if (w.forfeit) {
          const winTeam = w.winner === "red" ? red : blue;
          return `<div class="game"><span>${i + 1}. ${esc(who(g.label))}<br><span class="sets">Forfeit</span></span>
            <b style="color:var(--${w.winner})">${esc(winTeam.name)}</b></div>`;
        }
        const flip = g.label.startsWith("Blue"); // show score in the order the players are listed
        const sets = (g.sets || []).map((s) => (flip ? [s[1], s[0]] : s).join("-")).join(", ");
        const sc = flip ? `${w.b}-${w.r}` : `${w.r}-${w.b}`;
        return `<div class="game"><span>${i + 1}. ${esc(who(g.label))}${sets ? `<br><span class="sets">${sets}</span>` : ""}</span>
          <b style="color:var(--${w.winner})">${sc}</b></div>`;
      }).join("")}</div>`;
    } else {
      detail = `<div class="detail small muted">
        Red: ${esc(red.A.name)} (A), ${esc(red.B.name)} (B)<br>Blue: ${esc(blue.A.name)} (A), ${esc(blue.B.name)} (B)<br>
        Order: Red A vs Blue B · Blue A vs Red B · Doubles · Red A vs Blue A · Red B vs Blue B</div>`;
    }
    return `<button class="match" onclick="this.classList.toggle('open')">
      <div class="meta"><span>${m.table ? "Table " + esc(m.table) : "Table TBD"}${m.time ? " · " + esc(m.time) : ""}</span><span>${r ? "Final · tap for details" : "Scheduled · tap for lineup"}</span></div>
      ${side(red, "r", r && r.rg, r && r.redPts, r && r.winner === "red")}
      ${side(blue, "b", r && r.bg, r && r.bluePts, r && r.winner === "blue")}
      ${detail}</button>`;
  }

  function viewSchedule() {
    const d = L.divisions[state.div];
    const nextWeek = L.dates.weeks.find((w) => w >= todayISO);
    const weeks = L.dates.weeks.map((date, i) => ({ date, i, matches: d.matches.filter((m) => m.week === i + 1) }));
    const holidays = L.dates.holidays.map((h) => `<span class="tag">${fmtDate(h, { month: "short", day: "numeric" })} no play</span>`).join(" ");
    return `<div class="notice">${holidays}<br>Conflicts due the Monday before each Thursday · Makeup deadline ${fmtDate(L.dates.makeupDeadline)}</div>` +
      weeks.map((w) => `<div class="week-h"><h3>Week ${w.i + 1} · ${fmtDate(w.date)}</h3>
        ${w.matches.every((m) => m.games) ? '<span class="tag">Done</span>' : w.date === nextWeek ? '<span class="tag next">Next</span>' : ""}</div>
        ${w.matches.map(matchCard).join("")}`).join("");
  }

  function playerStats() {
    const d = L.divisions[state.div];
    const P = {};
    d.teams.forEach((t) => ["A", "B"].forEach((k) => (P[t.id + k] = { mp: 0, w: 0, l: 0 })));
    d.matches.forEach((m) => {
      const r = matchResult(m); if (!r) return;
      const showed = new Set(); // a player counts as "played" if at least one of their singles was not forfeited
      m.games.forEach((g, i) => {
        if (g.label === "Doubles") return;
        const key0 = (s) => (s.startsWith("Red") ? m.red : m.blue) + s.slice(-1);
        if (!g.forfeit) g.label.split(" vs ").forEach((x) => showed.add(key0(x)));
      });
      showed.forEach((k) => P[k] && P[k].mp++);
      m.games.forEach((g, i) => {
        if (g.label === "Doubles" || g.forfeit) return;
        const [x, y] = g.label.split(" vs ");
        const key = (s) => (s.startsWith("Red") ? m.red : m.blue) + s.slice(-1);
        const win = r.games[i].winner;
        const wk = (win === "red") === x.startsWith("Red") ? key(x) : key(y);
        const lk = wk === key(x) ? key(y) : key(x);
        P[wk].w++; P[lk].l++;
      });
    });
    return P;
  }

  function viewTeams() {
    const d = L.divisions[state.div];
    const P = playerStats();
    return `<div class="notice">Finals eligibility: a player must play more than 50% of the team's regular-season matchups. Forfeited games are not counted as played.</div>` +
      d.teams.map((t) => { const total = teamTotal(t.id); return `<div class="card"><h2>${esc(t.name)} <span class="muted small">· combined ${t.A.rating + t.B.rating}</span></h2>
      <table><thead><tr><th class="l">Player</th><th>Rating</th><th>Played</th><th>Singles W-L</th></tr></thead><tbody>
      ${["A", "B"].map((k) => { const p = P[t.id + k]; return `<tr><td class="l">${esc(t[k].name)} <span class="tag">${k}${k === "A" ? " · Captain" : ""}</span></td>
        <td>${t[k].rating}</td><td>${p.mp}/${total}</td><td>${p.w}-${p.l}</td></tr>`; }).join("")}
      </tbody></table></div>`; }).join("");
  }

  function viewFinals() {
    const rows = standings(state.div).slice(0, 4);
    const done = L.divisions[state.div].matches.every((m) => m.games);
    const t = (i) => rows[i] ? `${i + 1}. ${esc(rows[i].team.name)} <span class="muted small">(${rows[i].pts} pts)</span>` : "TBD";
    return `<div class="notice">${done ? "Final seeding." : "Projected from current standings — final seeding after week 7."}
      Thu ${fmtDate(L.dates.finals, { month: "short", day: "numeric" })} · semifinals start 6:00 PM · first to 3 games advances.</div>
      <div class="bracket">
        <div class="slot"><h4>Semifinal 1</h4><div>${t(0)}</div><div>${t(3)}</div></div>
        <div class="slot"><h4>Semifinal 2</h4><div>${t(1)}</div><div>${t(2)}</div></div>
        <div class="slot"><h4>Final</h4><div class="muted">Winner SF1 vs Winner SF2</div></div>
        <div class="slot"><h4>3rd / 4th</h4><div class="muted">Loser SF1 vs Loser SF2</div></div>
      </div>`;
  }

  // ---------- render ----------
  function render() {
    try { localStorage.setItem("ttl-state", JSON.stringify(state)); } catch (e) {}
    $("#divSeg").innerHTML = Object.keys(L.divisions).map((k) => `<button class="${k === state.div ? "on" : ""}" data-div="${k}">${k}</button>`).join("");
    $("#tabs").innerHTML = TABS.map(([k, n]) => `<button class="${k === state.tab ? "on" : ""}" data-tab="${k}">${n}</button>`).join("");
    const v = { standings: viewStandings, schedule: viewSchedule, teams: viewTeams, finals: viewFinals }[state.tab];
    $("#view").innerHTML = v();
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-div],[data-tab]"); if (!b) return;
    if (b.dataset.div) state.div = b.dataset.div;
    if (b.dataset.tab) state.tab = b.dataset.tab;
    render();
  });
  $("#club").textContent = L.club;
  $("#title").textContent = `${L.short} Team League · ${L.season}`;
  document.title = `${L.short} Team League`;
  $("#sampleBanner").hidden = !L.sample;
  if (L.updated) $("#updated").textContent = "Updated " + new Date(L.updated).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " · ";
  render();
  }

  // ---------- load ----------
  if (!DATA_URL) { start(window.LEAGUE); return; } // no sheet connected yet → sample data.js
  $("#view").innerHTML = '<div class="notice">Loading…</div>';
  fetch(DATA_URL, { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(start)
    .catch((e) => { $("#view").innerHTML = `<div class="notice">Could not load league data (${esc0(e.message)}). Please try again in a minute.</div>`; });
  function esc0(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
})();
