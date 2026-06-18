/**
 * The dashboard page, inlined as a string so `tsc` carries it into `dist/`
 * automatically — no separate asset to copy and no dev-vs-dist path to resolve.
 * It opens an EventSource to `/events` and re-renders the day's stats live as
 * prompts come in and get tagged.
 */
export const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>rudder</title>
<style>
  :root {
    --bg: #0e1116; --panel: #161b22; --line: #232a33; --text: #e6edf3;
    --muted: #8b949e; --accent: #58a6ff; --warn: #f0883e; --good: #3fb950;
    --arch: #58a6ff; --tune: #bc8cff; --bug: #f0883e; --house: #8b949e;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 560px; margin: 0 auto; padding: 28px 22px 40px; }
  header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 22px; }
  h1 { font-size: 17px; margin: 0; letter-spacing: .3px; }
  h1 span { color: var(--muted); font-weight: 400; }
  .live { font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 6px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--good); box-shadow: 0 0 0 0 rgba(63,185,80,.6); animation: pulse 2s infinite; }
  .dot.off { background: var(--muted); animation: none; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(63,185,80,.6);} 70% { box-shadow: 0 0 0 7px rgba(63,185,80,0);} 100% { box-shadow: 0 0 0 0 rgba(63,185,80,0);} }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  .correction .big { font-size: 52px; font-weight: 700; line-height: 1; letter-spacing: -1px; }
  .correction .label { color: var(--muted); margin-top: 8px; }
  .correction .sub { color: var(--muted); font-size: 12px; margin-top: 10px; }
  .section-title { font-size: 12px; text-transform: uppercase; letter-spacing: .8px; color: var(--muted); margin: 0 0 14px; }
  .bar-row { margin-bottom: 14px; }
  .bar-row:last-child { margin-bottom: 0; }
  .bar-head { display: flex; justify-content: space-between; margin-bottom: 5px; }
  .bar-head .name { font-weight: 500; }
  .bar-head .val { color: var(--muted); }
  .bar-head .val b { color: var(--text); }
  .track { height: 8px; background: #0e1116; border-radius: 6px; overflow: hidden; }
  .fill { height: 100%; border-radius: 6px; transition: width .4s ease; }
  .totals { display: flex; gap: 18px; color: var(--muted); font-size: 12px; }
  .totals b { color: var(--text); }
  footer { color: var(--muted); font-size: 11px; text-align: center; margin-top: 20px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>rudder <span id="day"></span></h1>
    <div class="live"><span class="dot" id="dot"></span><span id="livetext">live</span></div>
  </header>

  <div class="card correction">
    <div class="big" id="correction">—</div>
    <div class="label" id="correctionLabel">You said no to your AI</div>
    <div class="sub" id="correctionSub"></div>
  </div>

  <div class="card">
    <div class="section-title">Where your prompts went</div>
    <div id="bars"></div>
  </div>

  <div class="card totals" id="totals"></div>
  <footer>Computed locally from your prompts • updates as you work</footer>
</div>

<script>
  const CATS = [
    { key: "architecting", name: "Architecting", color: "var(--arch)" },
    { key: "tuning", name: "Tuning", color: "var(--tune)" },
    { key: "bugfixing", name: "Bugfixing", color: "var(--bug)" },
    { key: "housekeeping", name: "Housekeeping", color: "var(--house)" },
  ];

  function render(s) {
    document.getElementById("day").textContent = s.day || "";

    const corr = document.getElementById("correction");
    const sub = document.getElementById("correctionSub");
    if (s.correctionPct === null || s.correctionPct === undefined) {
      corr.textContent = "—";
      document.getElementById("correctionLabel").textContent = "You haven't said yes or no yet today";
      sub.textContent = s.total ? s.total + " prompts so far" : "Waiting for your first prompt…";
    } else {
      corr.textContent = s.correctionPct + "%";
      document.getElementById("correctionLabel").textContent = "of the time, you said no to your AI";
      sub.textContent = s.disagree + " disagreements of " + (s.agree + s.disagree) + " yes/no reactions";
    }

    const bars = document.getElementById("bars");
    bars.innerHTML = "";
    for (const c of CATS) {
      const stat = (s.byCategory && s.byCategory[c.key]) || { pct: 0, count: 0 };
      const row = document.createElement("div");
      row.className = "bar-row";
      row.innerHTML =
        '<div class="bar-head"><span class="name">' + c.name + '</span>' +
        '<span class="val"><b>' + stat.pct + '%</b> · ' + stat.count + '</span></div>' +
        '<div class="track"><div class="fill" style="width:' + stat.pct + '%;background:' + c.color + '"></div></div>';
      bars.appendChild(row);
    }

    document.getElementById("totals").innerHTML =
      '<div><b>' + (s.total || 0) + '</b> prompts</div>' +
      '<div><b>' + (s.counted || 0) + '</b> counted</div>' +
      '<div><b>' + (s.ignored || 0) + '</b> git chores skipped</div>';
  }

  function setLive(on) {
    document.getElementById("dot").className = on ? "dot" : "dot off";
    document.getElementById("livetext").textContent = on ? "live" : "reconnecting…";
  }

  const es = new EventSource("/events");
  es.onmessage = (e) => { try { render(JSON.parse(e.data)); setLive(true); } catch {} };
  es.onerror = () => setLive(false);
  es.onopen = () => setLive(true);
</script>
</body>
</html>`;
