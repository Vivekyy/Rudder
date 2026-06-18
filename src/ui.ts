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
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#0e1116" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="rudder" />
<link rel="apple-touch-icon" href="/icon-192.png" />
<link rel="icon" href="/icon-192.png" />
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
  .wrap { max-width: 380px; margin: 0 auto; padding: 18px 16px 20px; }
  header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 16px; }
  h1 { font-size: 16px; margin: 0; letter-spacing: .3px; }
  h1 span { color: var(--muted); font-weight: 400; }
  .live { font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 6px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--good); box-shadow: 0 0 0 0 rgba(63,185,80,.6); animation: pulse 2s infinite; }
  .dot.off { background: var(--muted); animation: none; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(63,185,80,.6);} 70% { box-shadow: 0 0 0 7px rgba(63,185,80,0);} 100% { box-shadow: 0 0 0 0 rgba(63,185,80,0);} }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
  .correction .big { font-size: 46px; font-weight: 700; line-height: 1; letter-spacing: -1px; }
  .correction .label { color: var(--muted); margin-top: 8px; }
  .correction .sub { color: var(--muted); font-size: 12px; margin-top: 10px; }
  .section-title { font-size: 12px; text-transform: uppercase; letter-spacing: .8px; color: var(--muted); margin: 0 0 14px; }
  .bar-row { margin-bottom: 12px; }
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

  // When running as the installed standalone app, shrink the window to fit the
  // content once it has rendered. Best-effort: browsers permit resizeTo for app
  // windows, but ignore it for normal tabs (where the guard already returns).
  let fitted = false;
  function fitWindow() {
    try {
      if (fitted || !matchMedia("(display-mode: standalone)").matches) return;
      const wrap = document.querySelector(".wrap");
      const r = wrap.getBoundingClientRect();
      const chromeW = window.outerWidth - window.innerWidth;
      const chromeH = window.outerHeight - window.innerHeight;
      window.resizeTo(Math.ceil(r.width) + chromeW, Math.ceil(r.bottom) + chromeH);
      fitted = true;
    } catch {}
  }

  const es = new EventSource("/events");
  es.onmessage = (e) => { try { render(JSON.parse(e.data)); setLive(true); setTimeout(fitWindow, 60); } catch {} };
  es.onerror = () => setLive(false);
  es.onopen = () => setLive(true);

  // Register the (pass-through) service worker so the standalone app keeps working.
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
</script>
</body>
</html>`;

/**
 * The installer landing page. This is what `rudder start` opens in a browser tab
 * when the app is NOT yet installed — a focused "install rudder" screen rather
 * than the in-browser dashboard. Once installed, `rudder start` launches the app
 * directly and this page is never shown again.
 */
export const INSTALL_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Install rudder</title>
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#0e1116" />
<link rel="apple-touch-icon" href="/icon-192.png" />
<link rel="icon" href="/icon-192.png" />
<style>
  :root { --bg:#0e1116; --panel:#161b22; --line:#232a33; --text:#e6edf3; --muted:#8b949e; --accent:#58a6ff; }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    display: flex; align-items: center; justify-content: center;
  }
  .card { width: 360px; max-width: 90vw; text-align: center; padding: 8px; }
  img.logo { width: 84px; height: 84px; border-radius: 20px; }
  h1 { font-size: 22px; margin: 18px 0 6px; }
  p.lead { color: var(--muted); margin: 0 0 22px; }
  button {
    background: var(--accent); color: #06131f; border: 0; border-radius: 9px;
    padding: 11px 20px; font-size: 15px; font-weight: 600; cursor: pointer; width: 100%;
  }
  button:disabled { background: var(--line); color: var(--muted); cursor: default; }
  .hint { color: var(--muted); font-size: 12.5px; margin-top: 16px; line-height: 1.6; }
  .hint code { color: var(--text); background: var(--panel); padding: 1px 6px; border-radius: 5px; }
  a { color: var(--accent); text-decoration: none; }
  #status { min-height: 18px; color: var(--accent); font-size: 13px; margin-top: 12px; }
</style>
</head>
<body>
<div class="card">
  <img class="logo" src="/icon-192.png" alt="rudder" />
  <h1>Install rudder</h1>
  <p class="lead">A live dashboard of your AI-coding stats, as a standalone app.</p>
  <button id="install" disabled>Preparing…</button>
  <div id="status"></div>
  <div class="hint" id="hint">
    On <b>Safari</b>, use <code>File → Add to Dock</code>.<br />
    Already installed? Open <b>rudder</b> from your dock, or just run <code>rudder start</code> again.<br />
    <a href="/">Or view in this browser →</a>
  </div>
</div>
<script>
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  const btn = document.getElementById("install");
  const status = document.getElementById("status");
  let deferredPrompt = null;

  // Already running as the installed app? Send them to the dashboard.
  if (matchMedia("(display-mode: standalone)").matches) location.replace("/");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.disabled = false;
    btn.textContent = "Install app";
  });
  btn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome !== "accepted") { btn.disabled = false; }
  });
  window.addEventListener("appinstalled", () => {
    btn.disabled = true;
    btn.textContent = "Installed ✓";
    status.textContent = "Open rudder from your dock (the daemon stays running here).";
  });

  // If the browser never fires beforeinstallprompt (e.g. Safari, or already
  // installed), guide the user rather than leaving a dead button.
  setTimeout(() => {
    if (!deferredPrompt && btn.textContent === "Preparing…") {
      btn.textContent = "Use your browser's Install menu";
      btn.disabled = true;
    }
  }, 1500);
</script>
</body>
</html>`;

/** Web app manifest — makes the dashboard installable as a standalone app. */
export const MANIFEST = JSON.stringify({
  name: 'rudder',
  short_name: 'rudder',
  description: 'Your live AI-coding stats',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#0e1116',
  theme_color: '#0e1116',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
});

/**
 * Minimal service worker. It registers a fetch handler (so the app qualifies as
 * installable) but never calls respondWith, so requests — including the live SSE
 * stream — pass straight through to the network with no caching or interference.
 */
export const SERVICE_WORKER = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
`;
