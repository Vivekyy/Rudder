/**
 * The dashboard page, inlined as a string so `tsc` carries it into `dist/`
 * automatically. It streams the active learned-rule set from the local daemon.
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
<link rel="apple-touch-icon" href="/icon.svg" />
<link rel="icon" href="/icon.svg" type="image/svg+xml" />
<style>
  :root {
    --bg: #0e1116; --panel: #161b22; --line: #232a33; --text: #e6edf3;
    --muted: #8b949e; --accent: #58a6ff; --good: #3fb950;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 560px; margin: 0 auto; padding: 18px 16px 20px; }
  header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 16px; }
  h1 { font-size: 16px; margin: 0; letter-spacing: .3px; }
  .live { font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 6px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--good); box-shadow: 0 0 0 0 rgba(63,185,80,.6); animation: pulse 2s infinite; }
  .dot.off { background: var(--muted); animation: none; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(63,185,80,.6);} 70% { box-shadow: 0 0 0 7px rgba(63,185,80,0);} 100% { box-shadow: 0 0 0 0 rgba(63,185,80,0);} }
  .summary { color: var(--muted); margin-bottom: 12px; }
  .summary b { color: var(--text); }
  .rule { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 15px; margin-bottom: 10px; }
  .rule-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .rule-id { color: var(--accent); font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .rule-meta { color: var(--muted); font-size: 11px; }
  .rule-text { font-weight: 600; margin-bottom: 8px; }
  .condition { color: var(--muted); font-size: 12px; }
  .condition + .condition { margin-top: 3px; }
  .empty { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; color: var(--muted); padding: 28px 16px; text-align: center; }
  footer { color: var(--muted); font-size: 11px; text-align: center; margin-top: 20px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>rudder learned rules</h1>
    <div class="live"><span class="dot" id="dot"></span><span id="livetext">live</span></div>
  </header>
  <div class="summary" id="summary">Loading learned rules…</div>
  <div id="rules"></div>
  <footer>Generated locally from your coding sessions • updates as you work</footer>
</div>

<script>
  function render(s) {
    const rules = Array.isArray(s.active_rules) ? s.active_rules : [];
    const pending = Number(s.pending_prompts || 0);
    document.getElementById("summary").innerHTML =
      "<b>" + rules.length + "</b> active rule" + (rules.length === 1 ? "" : "s") +
      " · <b>" + pending + "</b> prompt" + (pending === 1 ? "" : "s") + " pending";

    const list = document.getElementById("rules");
    list.replaceChildren();
    if (!rules.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = pending ? "Rule evidence is being compiled…" : "No learned rules yet.";
      list.appendChild(empty);
      return;
    }
    for (const rule of rules) {
      const card = document.createElement("div");
      card.className = "rule";
      const head = document.createElement("div");
      head.className = "rule-head";
      const id = document.createElement("span");
      id.className = "rule-id";
      id.textContent = rule.atomic_id + " v" + rule.version;
      const meta = document.createElement("span");
      meta.className = "rule-meta";
      meta.textContent = rule.kind + " · " + rule.scope + (rule.project ? ":" + rule.project : "");
      head.append(id, meta);
      const text = document.createElement("div");
      text.className = "rule-text";
      text.textContent = rule.rule_text;
      const when = document.createElement("div");
      when.className = "condition";
      when.textContent = "When: " + rule.applies_when;
      const except = document.createElement("div");
      except.className = "condition";
      except.textContent = "Except: " + rule.does_not_apply_when;
      card.append(head, text, when, except);
      list.appendChild(card);
    }
  }

  function setLive(on) {
    document.getElementById("dot").className = on ? "dot" : "dot off";
    document.getElementById("livetext").textContent = on ? "live" : "reconnecting…";
  }

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
<link rel="apple-touch-icon" href="/icon.svg" />
<link rel="icon" href="/icon.svg" type="image/svg+xml" />
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
  <img class="logo" src="/icon.svg" alt="rudder" />
  <h1>Install rudder</h1>
  <p class="lead">Your learned coding rules, updated as you work.</p>
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

  // Send the installed app to the dashboard. On install, the browser opens the
  // app at the current URL (/install) rather than the manifest start_url (/), and
  // may reparent this tab into the app window without reloading — so a one-time
  // load check misses it. Re-check on the display-mode change, on pageshow, and a
  // few delayed ticks to cover the reparent-without-reload case.
  const standalone = matchMedia("(display-mode: standalone)");
  function toDashboard() { if (standalone.matches) location.replace("/"); }
  toDashboard();
  if (standalone.addEventListener) standalone.addEventListener("change", toDashboard);
  window.addEventListener("pageshow", toDashboard);
  [200, 600, 1200].forEach((d) => setTimeout(toDashboard, d));

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
  description: 'Learned rules from your AI coding sessions',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#0e1116',
  theme_color: '#0e1116',
  icons: [
    { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
  ],
});

/**
 * Minimal service worker. It registers a fetch handler (so the app qualifies as
 * installable) but never calls respondWith, so requests pass straight through
 * to the network with no caching or interference.
 */
export const SERVICE_WORKER = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
`;
