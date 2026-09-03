// Headless smoke test for The Periodic Table Room.
// Spawns Chrome headless, connects over CDP (WebSocket), loads the page,
// asserts the scene built (window.RPRoom), selects an element, and reports
// any console errors. No extra dependencies (Node >= 22 has global WebSocket).
//
// Usage:  node tools/headless_check.mjs [url] [--keep]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL = process.argv[2] || 'http://localhost:8099/';
const CHROME = process.env.CHROME
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-check-'));

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=1600,1000', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let chromeErr = ''; chrome.stderr.on('data', (d) => { chromeErr += d; });

async function waitFor(fn, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const v = await fn(); if (v) return v; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('timeout waiting for condition');
}

let targetUrl = '';
let ws;
let idc = 0;
const pending = new Map();
const errors = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++idc;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function evalExpr(expression) {
  return send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    .then((r) => {
      if (r.exceptionDetails) {
        const st = r.exceptionDetails.stackTrace?.callFrames?.slice(0, 8)
          .map((f) => `  at ${f.functionName} (${f.url}:${f.lineNumber}:${f.columnNumber})`).join('\n');
        console.log('EVAL EXCEPTION:', r.exceptionDetails.exception?.description || r.exceptionDetails.text, st ? '\n' + st : '');
        return undefined;
      }
      return r.result?.value;
    });
}

async function main() {
  // connect to the debugger
  console.log('DEBUG: waiting for debugger target…');
  await waitFor(async () => {
    const req = await fetch(`http://127.0.0.1:${PORT}/json`);
    const list = await req.json();
    const page = (list || []).find((t) => t.type === 'page' && !t.url.startsWith('devtools'));
    if (!page) return null;
    targetUrl = page.webSocketDebuggerUrl;
    return targetUrl;
  }, 25000);

  ws = new WebSocket(targetUrl);
  console.log('DEBUG: connecting ws to', targetUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  console.log('DEBUG: ws open');
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(`EXCEPTION: ${msg.params.exceptionDetails?.text}`);
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push(`LOG ERROR: ${msg.params.entry.text}`);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(`CONSOLE ERROR: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');

  const results = {};
  console.log('DEBUG: navigating…');
  const navRes = await send('Page.navigate', { url: URL });
  await new Promise((r) => setTimeout(r, 4000));
  const dbg = await evalExpr(`({
    href: location.href,
    ready: document.readyState,
    title: document.title,
    hasELEMENTS: !!window.ELEMENTS,
    hasRPRoom: !!window.RPRoom,
    loading: !!document.getElementById('loading'),
    bodyChildren: document.body ? document.body.children.length : -1,
  })`);
  console.log('DEBUG: post-navigate', JSON.stringify(dbg));
  const navError = navRes && navRes.errorText;
  if (navError) console.log('DEBUG: navigation errorText:', navError);
  await waitFor(async () => {
    const v = await evalExpr('!!window.RPRoom');
    return v;
  }, 30000);
  console.log('DEBUG: RPRoom present');

  results.boot = await evalExpr(`({
    elements: window.RPRoom.elements,
    nodes: window.RPRoom.nodes,
    shellsDrawn: window.RPRoom.shellsDrawn(),
    selected: window.RPRoom.selected(),
    loadingGone: !document.getElementById('loading'),
    subtitle: document.getElementById('sub').textContent,
    chips: document.querySelectorAll('.chip').length,
    xrBtnText: document.getElementById('xr').textContent,
  })`);

  // wait a couple of animation frames, then select iron = 26
  await evalExpr('new Promise(r => setTimeout(r, 600))');
  results.select = await evalExpr(`(() => {
    const ok = window.RPRoom.selectByNumber(26);
    return { ok, selected: window.RPRoom.selected(), }
  })()`);
  await evalExpr('new Promise(r => setTimeout(r, 1600))'); // let camera tween run
  results.panel = await evalExpr(`(() => {
    const p = document.getElementById('panel');
    const txt = p.innerText || '';
    return {
      visible: !p.classList.contains('hidden'),
      hasIron: txt.includes('Iron'),
      hasFe: txt.includes('Fe'),
      hasShells: txt.includes('electron shells'),
    };
  })()`);

  // a couple of element lookups
  results.hydrogen = await evalExpr(`window.RPRoom.selectByNumber(1)`);
  results.oganesson = await evalExpr(`window.RPRoom.selectByNumber(118)`);

  // wait a bit more and re-check for errors that arise during animation
  await evalExpr('new Promise(r => setTimeout(r, 1200))');
  results.finalSelected = await evalExpr('window.RPRoom.selected()');

  console.log(JSON.stringify(results, null, 2));
  console.log('ERRORS:', errors.length ? errors : '(none)');
  if (chromeErr.includes('FATAL')) console.log('CHROME FATAL detected');

  const pass = !errors.length
    && results.boot?.elements === 118
    && results.boot?.nodes === 118
    && results.select?.ok === true
    && results.select?.selected === 26
    && results.panel?.visible === true
    && results.panel?.hasIron && results.panel?.hasFe
    && results.boot?.loadingGone === true
    && results.boot?.chips >= 7;
  console.log(pass ? 'PASS' : 'FAIL');
  return pass ? 0 : 1;
}

try {
  process.exitCode = await main();
} catch (e) {
  console.error('CHECK FAILED:', e.message);
  if (chromeErr) console.error('chrome stderr tail:', chromeErr.slice(-800));
  process.exitCode = 1;
} finally {
  try { chrome.kill(); } catch { /* ignore */ }
  setTimeout(() => { try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* ignore */ } }, 200);
}
