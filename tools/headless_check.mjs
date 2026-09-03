// Headless smoke test for The Periodic Table Room.
// Spawns Chrome headless, connects over CDP (WebSocket), loads the page,
// asserts the scene built (window.RPRoom), and exercises the interaction
// surface: element selection + detail panel, movement, search (incl. edge
// cases + empty-search restore), category-chip filtering and the WebXR
// button / holographic info card presence. Reports any console errors.
// No extra dependencies (Node >= 22 has global WebSocket).
//
// Usage:  node tools/headless_check.mjs [url] [--keep]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL = process.argv[2] || 'http://localhost:8099/';
const KEEP = process.argv.includes('--keep');
let CHROME = process.env.CHROME
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!fs.existsSync(CHROME)) {
  CHROME = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
}
if (!fs.existsSync(CHROME)) {
  console.error('headless_check: no Chrome/Edge binary found; set CHROME to one.');
  process.exit(1);
}
const PORT = 9333;
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-check-'));

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=1600,1000', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let chromeErr = ''; chrome.stderr.on('data', (d) => { chromeErr += d; });

async function waitFor(fn, ms = 20000, label = 'waitFor') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const v = await fn(); if (v) return v; } catch (e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('timeout waiting for condition: ' + label);
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

// Named-check helper so the gate output shows exactly what was asserted.
const checkResults = [];
function check(name, ok) {
  checkResults.push({ name, ok });
  if (!ok) console.log(`  ✗ ${name}`);
  return !!ok;
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

  // --- interaction suite (after last camera tween settled) ---
  await waitFor(async () => (await evalExpr('window.RPRoom.cameraIdle()')) === true, 30000, 'camera idle');

  // search: type "Fe" → iron + fermium visible; clear → all back
  results.search = await evalExpr(`(() => {
    const el = document.querySelector('#search-input');
    el.value = 'Fe';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const after = window.RPRoom.matchedCount();
    const miss = el.classList.contains('miss');
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return { matches: after, miss, restored: window.RPRoom.matchedCount() };
  })()`);

  // movement: free flight — W moves forward (z decreases), Space gains height
  const p0 = await evalExpr('window.RPRoom.camPos()');
  await evalExpr(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }))`);
  await waitFor(async () => {
    const p = await evalExpr('window.RPRoom.camPos()');
    return p.z < p0.z - 0.4;
  }, 15000, 'W forward');
  const p1 = await evalExpr('window.RPRoom.camPos()');
  await evalExpr(`document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }))`);
  await evalExpr(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }))`);
  await waitFor(async () => {
    const p = await evalExpr('window.RPRoom.camPos()');
    return p.y > p1.y + 0.3;
  }, 15000, 'Space up');
  const p2 = await evalExpr('window.RPRoom.camPos()');
  await evalExpr(`document.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }))`);
  results.movement = {
    start: p0, afterW: p1, afterSpace: p2,
    movedForward: p1.z < p0.z - 0.4,
    gainedHeight: p2.y > p1.y + 0.3,
  };

  // grid spacing of the element cards
  results.grid = await evalExpr('window.RPRoom.grid()');
  results.xrButton = await evalExpr(`(() => {
    const b = document.getElementById('xr');
    return { text: b.textContent, hidden: b.classList.contains('hidden'), disabled: b.disabled };
  })()`);

  // ------------------------------------------------------------------
  //  PT-T1 additions — extended interaction coverage
  // ------------------------------------------------------------------

  // --- Category-chip filtering ---------------------------------------
  // static contract: one chip per family, keys match ELEMENT_CATEGORIES,
  // each chip is a <button>
  results.category = {};
  results.category.keysOk = await evalExpr(`(() => {
    const expected = window.ELEMENT_CATEGORIES.map(c => c[0]).sort().join(',');
    const actual = Array.from(document.querySelectorAll('.chip')).map(c => c.dataset.cat).sort().join(',');
    return { expected, actual, ok: expected === actual };
  })()`);
  results.category.buttonsOk = await evalExpr(
    `Array.from(document.querySelectorAll('.chip')).every(c => c.tagName === 'BUTTON' && c.dataset.cat)`
  );

  // clicking a chip activates it (active class) AND selects the first
  // element of that family (observable: RPRoom.selected + detail panel)
  results.category.nobleGas = await evalExpr(`(() => {
    const chip = document.querySelector('.chip[data-cat="noble gas"]');
    chip.click();
    const first = window.ELEMENTS.find(el => el.cat === 'noble gas');
    const panel = document.getElementById('panel');
    return {
      activeCount: document.querySelectorAll('.chip.active').length,
      activeCat: document.querySelector('.chip.active')?.dataset.cat ?? null,
      selected: window.RPRoom.selected(),
      firstN: first.n,
      firstName: first.name,
      panelVisible: !panel.classList.contains('hidden'),
      panelHasFirst: panel.innerText.includes(first.name),
    };
  })()`);

  // clicking the active chip again toggles the filter back off
  results.category.toggleOff = await evalExpr(`(() => {
    const chip = document.querySelector('.chip[data-cat="noble gas"]');
    chip.click();
    return {
      activeCount: document.querySelectorAll('.chip.active').length,
      selected: window.RPRoom.selected(),      // selection is kept
      panelStillVisible: !document.getElementById('panel').classList.contains('hidden'),
    };
  })()`);

  // data-driven: every family chip must select its first element
  results.category.allFamilies = await evalExpr(`(() => {
    const out = [];
    for (const [key] of window.ELEMENT_CATEGORIES) {
      const chip = document.querySelector('.chip[data-cat="' + key + '"]');
      chip.click();
      const first = window.ELEMENTS.find(el => el.cat === key);
      out.push({ key, selected: window.RPRoom.selected(), first: first.n, ok: window.RPRoom.selected() === first.n });
    }
    return out;
  })()`);
  // leave the room un-filtered again (toggle the last chip off)
  await evalExpr(`document.querySelector('.chip.active')?.click(); true`);
  await waitFor(async () => (await evalExpr('window.RPRoom.cameraIdle()')) === true, 30000, 'camera idle after chips');

  // --- Search edge cases + empty-search restore ----------------------
  results.searchEdge = await evalExpr(`(() => {
    const input = document.querySelector('#search-input');
    // mirrors app's queryMatch so expected counts are data-driven
    const expectedFor = (q) => {
      q = q.trim().toLowerCase();
      if (!q) return window.ELEMENTS.length;
      return window.ELEMENTS.filter(el =>
        String(el.n).includes(q) || el.s.toLowerCase().includes(q) || el.name.toLowerCase().includes(q)
      ).length;
    };
    const run = (q, label) => {
      input.value = q;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return {
        label,
        matches: window.RPRoom.matchedCount(),
        expected: expectedFor(q),
        miss: input.classList.contains('miss'),
        hit: input.classList.contains('hit'),
      };
    };
    const out = {
      symbol: run('Fe', 'symbol'),
      caseInsensitive: run('fE', 'case'),
      number: run('26', 'number'),
      partial: run('hyd', 'partial'),
      miss: run('zzzz', 'miss'),
      single: run('o', 'single-letter'),
    };
    // empty-search restore: clearing must bring all 118 back & clear classes
    out.empty = run('', 'empty');
    return out;
  })()`);
  // Esc in the search box clears it and restores all nodes
  results.searchEdge.escapeRestore = await evalExpr(`(() => {
    const input = document.querySelector('#search-input');
    input.value = 'Fe';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return {
      value: input.value,
      matches: window.RPRoom.matchedCount(),
      miss: input.classList.contains('miss'),
      hit: input.classList.contains('hit'),
    };
  })()`);
  // Enter flies to the first match (Fe = 26) and opens the panel
  results.searchEdge.enter = await evalExpr(`(() => {
    const input = document.querySelector('#search-input');
    input.value = 'Fe';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return {
      selected: window.RPRoom.selected(),
      panelVisible: !document.getElementById('panel').classList.contains('hidden'),
    };
  })()`);
  // clear the box afterwards so later interactions start clean
  await evalExpr(`(() => {
    const input = document.querySelector('#search-input');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return window.RPRoom.matchedCount();
  })()`);
  await waitFor(async () => (await evalExpr('window.RPRoom.cameraIdle()')) === true, 30000, 'camera idle after Enter');

  // --- Info-card / hologram + detail panel ---------------------------
  // Select gold (79): panel shows the full fact sheet; the in-world
  // holographic card renders into an off-DOM canvas (only #room exists in
  // the DOM), so we assert on the observable panel + canvas presence.
  results.infoCard = await evalExpr(`(() => {
    window.RPRoom.selectByNumber(79);
    const panel = document.getElementById('panel');
    const body = document.getElementById('panel-body');
    const txt = body.innerText || '';
    return {
      panelVisible: !panel.classList.contains('hidden'),
      hasSymbol: txt.includes('Au'),
      hasName: txt.includes('Gold'),
      hasNumber: txt.includes('79'),
      hasShells: txt.includes('electron shells'),
      hasConfig: txt.includes('configuration') && /\[Xe\]/.test(txt),
      hasMass: txt.includes('atomic mass') && txt.includes(' u'),
      hasPhase: /phase/i.test(txt),
      domCanvases: document.querySelectorAll('canvas').length,   // 1 => #room only
      xrHintHidden: document.getElementById('xr-hint').classList.contains('hidden'),
    };
  })()`);

  // panel close → deselect (hides panel AND the holographic card)
  results.panelClose = await evalExpr(`(() => {
    document.getElementById('panel-close').click();
    return {
      hidden: document.getElementById('panel').classList.contains('hidden'),
      selected: window.RPRoom.selected(),
    };
  })()`);

  // --- XR button / WebXR state ---------------------------------------
  // wait a moment so any late isSessionSupported resolution has landed,
  // then assert the final headless state: visible, disabled, "unavailable"
  await evalExpr('new Promise(r => setTimeout(r, 800))');
  results.xrFinal = await evalExpr(`(() => {
    const b = document.getElementById('xr');
    const before = { text: b.textContent.trim(), disabled: b.disabled };
    b.click();                       // disabled ⇒ no requestSession, no throw
    return {
      tag: b.tagName,
      type: b.type,
      visible: !b.classList.contains('hidden'),
      disabled: b.disabled,
      text: b.textContent.trim(),
      clickStable: before.text === b.textContent.trim() && before.disabled === b.disabled,
      hintHidden: document.getElementById('xr-hint').classList.contains('hidden'),
    };
  })()`);

  // re-select 118 as the final resting state (mirrors previous behaviour)
  results.finalSelected = await evalExpr(`(() => {
    window.RPRoom.selectByNumber(118);
    return window.RPRoom.selected();
  })()`);
  await evalExpr('new Promise(r => setTimeout(r, 1200))');

  console.log(JSON.stringify(results, null, 2));
  console.log('ERRORS:', errors.length ? errors : '(none)');
  if (chromeErr.includes('FATAL')) console.log('CHROME FATAL detected');

  // ---- pass / fail verdict -------------------------------------------------
  const familyOk = results.category?.allFamilies?.length > 0
    && results.category.allFamilies.every((f) => f.ok === true);
  const edgeOk = results.searchEdge?.symbol
    && Object.values(results.searchEdge).filter((v) => v && v.matches !== undefined);

  const pass = !errors.length
    && check('boot: 118 elements + 118 nodes', results.boot?.elements === 118 && results.boot?.nodes === 118)
    && check('boot: shells drawn', (results.boot?.shellsDrawn || 0) > 0)
    && check('boot: loading overlay gone', results.boot?.loadingGone === true)
    && check('boot: subtitle mentions families + WebXR', /families/.test(results.boot?.subtitle || '') && /WebXR/.test(results.boot?.subtitle || ''))
    && check('boot: 10 category chips', results.boot?.chips === 10)
    && check('select: Fe(26) by number', results.select?.ok === true && results.select?.selected === 26)
    && check('panel: visible with Iron + Fe + shells', results.panel?.visible && results.panel?.hasIron && results.panel?.hasFe && results.panel?.hasShells)
    && check('lookups: H(1) + Og(118) selectable', results.hydrogen === true && results.oganesson === true)
    && check('search: Fe → 2 matches, clear → 118 restored', results.search?.matches === 2 && results.search?.restored === 118)
    && check('movement: W moves forward', results.movement?.movedForward === true)
    && check('movement: Space gains height', results.movement?.gainedHeight === true)
    && check('grid: colW 3.4, rowH 3.2', results.grid?.colW === 3.4 && results.grid?.rowH === 3.2)
    && check('chips: keys match ELEMENT_CATEGORIES', results.category?.keysOk?.ok === true)
    && check('chips: every chip is a <button> with data-cat', results.category?.buttonsOk === true)
    && check('chips: clicking noble gas selects Helium(2) + shows it in panel',
        results.category?.nobleGas?.activeCount === 1
        && results.category?.nobleGas?.activeCat === 'noble gas'
        && results.category?.nobleGas?.selected === results.category?.nobleGas?.firstN
        && results.category?.nobleGas?.selected === 2
        && results.category?.nobleGas?.panelVisible
        && results.category?.nobleGas?.panelHasFirst)
    && check('chips: click again toggles filter off', results.category?.toggleOff?.activeCount === 0 && results.category?.toggleOff?.panelStillVisible === true)
    && check('chips: every family selects its first element', familyOk)
    && check('searchEdge: all queries match data-driven expected counts',
        Object.values(results.searchEdge)
          .filter((v) => v && v.matches !== undefined && v.expected !== undefined)
          .every((v) => v.matches === v.expected))
    && check('searchEdge: miss query → 0 matches + miss class', results.searchEdge?.miss?.matches === 0 && results.searchEdge?.miss?.miss === true && results.searchEdge?.miss?.hit === false)
    && check('searchEdge: symbol match sets hit class', results.searchEdge?.symbol?.hit === true && results.searchEdge?.symbol?.miss === false)
    && check('searchEdge: number search "26" → 1 match', results.searchEdge?.number?.matches === 1)
    && check('searchEdge: empty query restores 118 + clears classes', results.searchEdge?.empty?.matches === 118 && results.searchEdge?.empty?.miss === false && results.searchEdge?.empty?.hit === false)
    && check('searchEdge: Esc clears input + restores 118', results.searchEdge?.escapeRestore?.value === '' && results.searchEdge?.escapeRestore?.matches === 118 && results.searchEdge?.escapeRestore?.miss === false)
    && check('searchEdge: Enter flies to first match (26) + opens panel', results.searchEdge?.enter?.selected === 26 && results.searchEdge?.enter?.panelVisible === true)
    && check('infoCard: panel shows full Gold fact sheet after select',
        results.infoCard?.panelVisible && results.infoCard?.hasSymbol && results.infoCard?.hasName
        && results.infoCard?.hasNumber && results.infoCard?.hasShells
        && results.infoCard?.hasConfig && results.infoCard?.hasMass && results.infoCard?.hasPhase)
    && check('infoCard: hologram canvas is off-DOM (only #room canvas)', results.infoCard?.domCanvases === 1 && results.infoCard?.xrHintHidden === true)
    && check('panelClose: closes panel + deselects (hides hologram)', results.panelClose?.hidden === true && results.panelClose?.selected === null)
    && check('xr: visible, disabled, "XR unavailable" text', results.xrFinal?.visible === true && results.xrFinal?.disabled === true && /XR unavailable/.test(results.xrFinal?.text || ''))
    && check('xr: disabled click is a no-op, hint stays hidden', results.xrFinal?.clickStable === true && results.xrFinal?.hintHidden === true)
    && check('final: Oganesson(118) selected', results.finalSelected === 118);

  const passed = checkResults.filter((c) => c.ok).length;
  const failed = checkResults.filter((c) => !c.ok).length;
  console.log(`CHECKS: ${passed} passed, ${failed} failed of ${checkResults.length}`);
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
  if (!KEEP) setTimeout(() => { try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* ignore */ } }, 200);
}
