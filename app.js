/**
 * Jankless — AI GSAP Studio
 * app.js
 *
 * Calls Claude API → generates GSAP code → runs in sandboxed iframe
 */

// ─── Config ───────────────────────────────────────────────────────────────────

// API calls go through /api/generate (Netlify serverless function)
// Key lives in Netlify env var ANTHROPIC_API_KEY — never in this file.
const API_ENDPOINT = '/api/generate';

// ─── Presets ──────────────────────────────────────────────────────────────────
// Two tiers: Learn (one target, one mechanic — designed to teach) and
// Recipes (the existing creative combinations).

const LEARN_PRESETS = [
  // Core motion
  'Slide Target 1 in from above with a bounce',
  'Fade Target 3 in from below',
  'Stagger Target 4 in with a wave from the center',
  'Stagger Target 5 in from the left, one by one',
  'Pulse Target 6 like a heartbeat on loop',
  'Spin Target 6 a full turn with elastic ease',

  // SplitText — char-by-char text reveal
  'Reveal Target 1 character by character with a wave',
  'Make Target 2 type itself out word by word',

  // DrawSVGPlugin — animate a stroked path
  'Draw Target 7 from left to right under the heading',

  // MorphSVGPlugin — shape morphing
  'Morph Target 8 into a star shape',
  'Morph Target 9 into a circle, then back to the clover',

  // Flip — state transitions
  'FLIP Target 3 to scale up to 1.6×, then back',

  // MotionPath — animate along a path
  'Send Target 6 along a wavy horizontal path across the canvas',

  // CustomEase — custom curve
  'Animate Target 1 in with a custom ease curve that overshoots and settles',

  // Physics2D — gravity / velocity
  'Drop Target 6 with gravity and let it bounce on the floor',

  // ScrambleText — decode text effect
  'Scramble Target 1 to decode from random characters into "Jankless"',
];

const RECIPE_PRESETS = [
  // Entrances
  'Bounce the boxes in from below with stagger',
  'Slide the card in from the right with a spring',
  'Fade everything in one by one, top to bottom',
  'Drop the heading in from above with a bounce',
  'Scale everything up from zero with elastic ease',
  'Fly the boxes in from the left, one by one',

  // Attention & loops
  'Make the circle pulse like a heartbeat',
  'Shake the heading like a glitch effect',
  'Make the card breathe in and out on loop',
  'Spin the circle continuously like a loader',
  'Make the boxes float up and down in a wave',
  'Flash the heading like a neon sign flickering',

  // Sequences & combos
  'Animate a wave ripple through the boxes',
  'Stagger the boxes in, then pulse the circle',
  'Slide the card in, then cascade the boxes below it',
  'Make everything spin and scale in dramatically',
  'Entrance the whole stage like a cinematic reveal',
  'Stagger all elements in with back.out easing',

  // Exits & transitions
  'Make the boxes explode outward then snap back',
  'Collapse everything to the center then expand',
  'Scatter the boxes randomly then snap into place',
  'Make the card wobble like it was just dropped',
];

// ─── DOM refs ──────────────────────────────────────────────────────────────────

const promptInput    = document.getElementById('prompt');
const generateBtn    = document.getElementById('generate-btn');
const codeDisplay    = document.getElementById('code-display');
const statusEl       = document.getElementById('status');
const canvasFrame    = document.getElementById('canvas-frame');
const durationSlider = document.getElementById('duration');
const durationVal    = document.getElementById('duration-val');
const staggerSlider  = document.getElementById('stagger');
const staggerVal     = document.getElementById('stagger-val');
const easeSelect     = document.getElementById('ease');
const replayBtn      = document.getElementById('replay-btn');
const resetBtn       = document.getElementById('reset-btn');
const copyBtn        = document.getElementById('copy-btn');
const runBtn         = document.getElementById('run-btn');
const pauseBtn       = document.getElementById('pause-btn');
const timescaleSlider = document.getElementById('timescale');
const timescaleVal   = document.getElementById('timescale-val');
const themeBtn       = document.getElementById('theme-btn');

// New in Tier 1
const timelineScrub  = document.getElementById('timeline-scrub');
const timelineVal    = document.getElementById('timeline-val');
const loopBtn        = document.getElementById('loop-btn');
const yoyoBtn        = document.getElementById('yoyo-btn');
const targetsEl      = document.getElementById('targets');
const historyListEl  = document.getElementById('history-list');
const historyClearBtn = document.getElementById('history-clear');
const historyCountEl = document.getElementById('history-count');
const historyBackend = document.getElementById('history-backend');
const panelTabs      = document.querySelectorAll('.panel-tab');
const easeCurveSvg   = document.getElementById('ease-curve');

// ─── State ─────────────────────────────────────────────────────────────────────

let currentCode  = '';
let currentPrompt = '';
let isGenerating = false;
let isPaused     = false;
let isLoop       = false;
let isYoyo       = false;
let isScrubbing  = false;
let lastDuration = 0;

// History store — picks Supabase if configured, falls back to localStorage.
const historyStore = window.JanklessStorage.createStore();

// ─── Mobile tabs ───────────────────────────────────────────────────────────────

const mobileTabs = document.querySelectorAll('.mobile-tab');
const mobilePanels = {
  create:  document.querySelector('.panel-left'),
  preview: document.querySelector('.panel-center'),
  tweak:   document.querySelector('.panel-right'),
};

function isMobile() {
  return window.innerWidth <= 768;
}

function switchTab(tabName) {
  Object.values(mobilePanels).forEach(p => p && p.classList.remove('mobile-active'));
  mobileTabs.forEach(t => t.classList.remove('active'));
  if (mobilePanels[tabName]) mobilePanels[tabName].classList.add('mobile-active');
  const btn = document.querySelector(`.mobile-tab[data-tab="${tabName}"]`);
  if (btn) btn.classList.add('active');
}

mobileTabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// Init mobile default tab
if (isMobile()) switchTab('create');

// Handle orientation / resize changes
window.addEventListener('resize', () => {
  if (!isMobile()) {
    Object.values(mobilePanels).forEach(p => p && p.classList.remove('mobile-active'));
  } else if (!document.querySelector('.mobile-tab.active')) {
    switchTab('create');
  }
});

// ─── Theme ─────────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('jankless-theme', theme);
  // Sync the canvas iframe
  try {
    canvasFrame.contentWindow.postMessage({ type: 'SET_THEME', theme }, '*');
  } catch (_) {}
}

// Send theme to iframe once it loads
canvasFrame.addEventListener('load', () => {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  canvasFrame.contentWindow.postMessage({ type: 'SET_THEME', theme }, '*');
});

// Init from saved preference (default: dark)
applyTheme(localStorage.getItem('jankless-theme') || 'dark');

themeBtn.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ─── Slider live updates ───────────────────────────────────────────────────────

durationSlider.addEventListener('input', () => {
  durationVal.textContent = parseFloat(durationSlider.value).toFixed(1) + 's';
});

staggerSlider.addEventListener('input', () => {
  staggerVal.textContent = parseFloat(staggerSlider.value).toFixed(2) + 's';
});

timescaleSlider.addEventListener('input', () => {
  const val = parseFloat(timescaleSlider.value).toFixed(1);
  timescaleVal.textContent = val + '×';
  canvasFrame.contentWindow.postMessage({ type: 'SET_TIMESCALE', value: parseFloat(val) }, '*');
});

// ─── Ease curve visualizer ────────────────────────────────────────────────────
// Tiny SVG curve preview next to the Ease dropdown. Samples the easing
// function and plots it so you can SEE what each ease actually does.

const EASE_SAMPLERS = {
  'linear':       t => t,
  'sine.inOut':   t => -(Math.cos(Math.PI * t) - 1) / 2,
  'power2.out':   t => 1 - Math.pow(1 - t, 2),
  'power3.out':   t => 1 - Math.pow(1 - t, 3),
  'expo.out':     t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  'back.out(1.7)': t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  'elastic.out(1,0.3)': t => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 0.3;
    return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * c4) + 1;
  },
  'bounce.out': t => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1)        return n1 * t * t;
    else if (t < 2 / d1) { t -= 1.5 / d1;   return n1 * t * t + 0.75; }
    else if (t < 2.5 / d1){ t -= 2.25 / d1; return n1 * t * t + 0.9375; }
    else                  { t -= 2.625 / d1; return n1 * t * t + 0.984375; }
  },
};

function drawEaseCurve(name) {
  if (!easeCurveSvg) return;
  const sampler = EASE_SAMPLERS[name] || EASE_SAMPLERS['linear'];
  const W = 100, H = 60, pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const v = sampler(t);
    pts.push((t * W).toFixed(2) + ',' + (H - v * H).toFixed(2));
  }
  easeCurveSvg.innerHTML =
    `<line x1="0" y1="${H}" x2="${W}" y2="${H}" stroke="currentColor" stroke-width="0.5" opacity="0.25"/>` +
    `<line x1="0" y1="0"   x2="${W}" y2="0"   stroke="currentColor" stroke-width="0.5" opacity="0.15" stroke-dasharray="2 2"/>` +
    `<polyline points="${pts.join(' ')}" fill="none" stroke="#00e67a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
}

if (easeCurveSvg) {
  drawEaseCurve(easeSelect.value);
  easeSelect.addEventListener('change', () => drawEaseCurve(easeSelect.value));
}

// ─── Targets — numbered, named, GSAP-aligned vocabulary ─────────────────────
//
// Each chip teaches the GSAP "target" abstraction. Hovering highlights the
// element(s) on the canvas. Clicking inserts "Target N" into the prompt
// (the AI server knows the mapping back to the actual selector).

const TARGETS = [
  { n: 1, label: 'Heading',       sel: '#heading',      count: 1, hint: 'Big "Jankless" title' },
  { n: 2, label: 'Tagline',       sel: '#subtext',      count: 1, hint: 'Subtitle below the heading' },
  { n: 3, label: 'KPI Card',      sel: '#card',         count: 1, hint: 'Monthly Revenue dashboard card' },
  { n: 4, label: 'Chart Bars',    sel: '.card-bar',     count: 7, hint: 'Seven bars inside the card chart' },
  { n: 5, label: 'Feature Boxes', sel: '.box',          count: 3, hint: 'Three colored boxes' },
  { n: 6, label: 'Hero Circle',   sel: '#circle',       count: 1, hint: 'Pink/orange gradient circle' },
  { n: 7, label: 'Underline',     sel: '#underline',     count: 1, hint: 'SVG path under the heading — best with DrawSVG' },
  { n: 8, label: 'Morph Heart',   sel: '#morph-shape',   count: 1, hint: 'Pink/orange heart SVG — morph it into stars, squares, etc. with MorphSVG' },
  { n: 9, label: 'Morph Clover',  sel: '#morph-shape-2', count: 1, hint: 'Green four-leaf clover SVG — second MorphSVG demo target' },
];

function renderTargets() {
  targetsEl.innerHTML = '';
  TARGETS.forEach(t => {
    const chip = document.createElement('button');
    chip.className = 'target-chip';
    chip.title = `${t.hint}\nMaps to ${t.sel}\nClick to insert "Target ${t.n}" into your prompt`;
    chip.innerHTML =
      `<span class="chip-num">${t.n}</span>` +
      `<span class="chip-label">${t.label}</span>` +
      (t.count > 1 ? `<span class="chip-count">×${t.count}</span>` : '');
    chip.addEventListener('click', () => insertIntoPrompt(`Target ${t.n}`));
    chip.addEventListener('mouseenter', () => sendHighlight(t.sel));
    chip.addEventListener('mouseleave', () => sendHighlight(null));
    chip.addEventListener('focus',      () => sendHighlight(t.sel));
    chip.addEventListener('blur',       () => sendHighlight(null));
    targetsEl.appendChild(chip);
  });
}

function sendHighlight(sel) {
  try {
    if (sel) {
      canvasFrame.contentWindow.postMessage({ type: 'HIGHLIGHT_TARGET', selector: sel }, '*');
    } else {
      canvasFrame.contentWindow.postMessage({ type: 'UNHIGHLIGHT_TARGET' }, '*');
    }
  } catch (_) {}
}

function insertIntoPrompt(text) {
  const start = promptInput.selectionStart;
  const end   = promptInput.selectionEnd;
  const before = promptInput.value.slice(0, start);
  const after  = promptInput.value.slice(end);
  const pad = before && !/\s$/.test(before) ? ' ' : '';
  const insert = pad + text + ' ';
  promptInput.value = before + insert + after;
  const pos = start + insert.length;
  promptInput.focus();
  promptInput.setSelectionRange(pos, pos);
}

renderTargets();

// ─── Preset rendering ────────────────────────────────────────────────────────

function renderPresets(containerId, presets) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  presets.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'suggestion-chip';
    btn.textContent = s;
    btn.addEventListener('click', () => {
      promptInput.value = s;
      generateAnimation();
    });
    el.appendChild(btn);
  });
}

renderPresets('learn-list',   LEARN_PRESETS);
renderPresets('recipes-list', RECIPE_PRESETS);

// ─── Panel tabs (Learn / Recipes / History) ──────────────────────────────────

const PANE_IDS = ['learn-section', 'recipes-section', 'history-section'];

panelTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.pane;
    panelTabs.forEach(t => t.classList.toggle('active', t === tab));
    PANE_IDS.forEach(id => {
      document.getElementById(id).hidden = (id !== target);
    });
    if (target === 'history-section') refreshHistory();
  });
});

// ─── History — list / save / load / delete ──────────────────────────────────

if (historyBackend) {
  historyBackend.textContent = historyStore.name;
  historyBackend.classList.toggle('supabase', historyStore.name === 'supabase');
}

async function refreshHistory() {
  let entries = [];
  try {
    entries = await historyStore.list();
  } catch (e) {
    console.error('[Jankless] history list failed:', e);
    historyListEl.innerHTML = '<div class="history-empty">Couldn\'t load history.</div>';
    return;
  }

  historyCountEl.textContent = entries.length || '';
  historyListEl.innerHTML = '';

  if (!entries.length) {
    historyListEl.innerHTML = '<div class="history-empty">No saved animations yet — generate one to start a history.</div>';
    return;
  }

  entries.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.title = 'Click to reload this prompt and code';

    const promptLine = document.createElement('div');
    promptLine.className = 'history-item-prompt';
    promptLine.textContent = entry.prompt;

    const meta = document.createElement('div');
    meta.className = 'history-item-meta';
    const time = document.createElement('span');
    time.textContent = relativeTime(entry.createdAt);
    const del = document.createElement('button');
    del.className = 'history-item-delete';
    del.textContent = '×';
    del.title = 'Delete this entry';
    del.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      try {
        await historyStore.remove(entry.id);
        refreshHistory();
      } catch (e) {
        console.error('[Jankless] history delete failed:', e);
      }
    });
    meta.appendChild(time);
    meta.appendChild(del);

    item.addEventListener('click', () => loadFromHistory(entry));

    item.appendChild(promptLine);
    item.appendChild(meta);
    historyListEl.appendChild(item);
  });
}

function loadFromHistory(entry) {
  promptInput.value = entry.prompt;
  currentPrompt = entry.prompt;
  currentCode = entry.code;
  displayCode(entry.code);
  if (entry.duration != null) { durationSlider.value = entry.duration; durationVal.textContent = (+entry.duration).toFixed(1) + 's'; }
  if (entry.ease)              { easeSelect.value = entry.ease; }
  if (entry.stagger != null)   { staggerSlider.value = entry.stagger; staggerVal.textContent = (+entry.stagger).toFixed(2) + 's'; }
  runAnimation(entry.code);
  resetPauseState();
  setStatus('↺ Loaded from history.', 'success');
  if (isMobile()) switchTab('preview');
}

async function saveToHistory(prompt, code) {
  try {
    await historyStore.add({
      prompt,
      code,
      duration: parseFloat(durationSlider.value),
      ease:     easeSelect.value,
      stagger:  parseFloat(staggerSlider.value),
      loop:     isLoop,
      yoyo:     isYoyo,
    });
    // Refresh the count quietly
    const count = (await historyStore.list()).length;
    historyCountEl.textContent = count || '';
  } catch (e) {
    console.warn('[Jankless] history save failed:', e);
  }
}

historyClearBtn.addEventListener('click', async () => {
  if (!confirm('Delete all saved animations?')) return;
  try {
    await historyStore.clear();
    refreshHistory();
  } catch (e) {
    console.error('[Jankless] history clear failed:', e);
  }
});

function relativeTime(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60)        return 'just now';
  if (s < 3600)      return Math.floor(s / 60) + 'm ago';
  if (s < 86400)     return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago';
  return new Date(ts).toLocaleDateString();
}

// Init the count badge on load
refreshHistory();

// ─── Loop / Yoyo toggles ─────────────────────────────────────────────────────

loopBtn.addEventListener('click', () => {
  isLoop = !isLoop;
  loopBtn.classList.toggle('active', isLoop);
  canvasFrame.contentWindow.postMessage({ type: 'SET_LOOP', value: isLoop }, '*');
});

yoyoBtn.addEventListener('click', () => {
  isYoyo = !isYoyo;
  yoyoBtn.classList.toggle('active', isYoyo);
  canvasFrame.contentWindow.postMessage({ type: 'SET_YOYO', value: isYoyo }, '*');
});

// ─── Timeline scrubber ────────────────────────────────────────────────────────

function fmtSecs(n) {
  return (n || 0).toFixed(2) + 's';
}

timelineScrub.addEventListener('input', () => {
  const value = parseFloat(timelineScrub.value) / 1000;
  isScrubbing = true;
  canvasFrame.contentWindow.postMessage({ type: 'SET_PROGRESS', value, scrubbing: true }, '*');
  if (lastDuration) timelineVal.textContent = fmtSecs(value * lastDuration) + ' / ' + fmtSecs(lastDuration);
});

const endScrub = () => {
  if (!isScrubbing) return;
  isScrubbing = false;
  canvasFrame.contentWindow.postMessage({ type: 'SCRUB_END', resume: !isPaused }, '*');
};
timelineScrub.addEventListener('change', endScrub);
timelineScrub.addEventListener('mouseup', endScrub);
timelineScrub.addEventListener('touchend', endScrub);

// ─── Core: Generate Animation ──────────────────────────────────────────────────

async function generateAnimation() {
  if (isGenerating) return;

  const prompt = promptInput.value.trim();
  if (!prompt) {
    setStatus('Enter a prompt first.', 'error');
    promptInput.focus();
    return;
  }

  isGenerating = true;
  generateBtn.disabled = true;
  generateBtn.classList.add('generating');
  codeDisplay.disabled = true;
  setStatus('Generating animation… (this may take a moment)', 'loading');
  codeDisplay.value = '// Thinking…';

  const duration = parseFloat(durationSlider.value).toFixed(1);
  const ease     = easeSelect.value;
  const stagger  = parseFloat(staggerSlider.value).toFixed(2);

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, duration, ease, stagger }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Server error ${response.status}`);
    }

    const code = data.code || '';
    currentCode = code;
    currentPrompt = prompt;
    displayCode(code);
    runAnimation(code);
    resetPauseState();
    setStatus('✓ Animation ready', 'success');
    saveToHistory(prompt, code);
    if (isMobile()) switchTab('preview');

  } catch (err) {
    setStatus('✗ ' + err.message, 'error');
    codeDisplay.value = '// Error — check console for details';
    console.error('[Jankless]', err);
  } finally {
    isGenerating = false;
    generateBtn.disabled = false;
    generateBtn.classList.remove('generating');
    codeDisplay.disabled = false;
  }
}

// ─── Sandbox communication ─────────────────────────────────────────────────────

function runAnimation(code) {
  canvasFrame.contentWindow.postMessage({ type: 'RUN_ANIMATION', code }, '*');
}

function resetCanvas() {
  canvasFrame.contentWindow.postMessage({ type: 'RESET' }, '*');
}

window.addEventListener('message', e => {
  if (!e.data || !e.data.type) return;

  if (e.data.type === 'ANIMATION_ERROR') {
    setStatus('✗ Runtime error: ' + e.data.error, 'error');
    console.error('[Jankless sandbox]', e.data.error);
  }

  if (e.data.type === 'ANIMATION_OK') {
    if (typeof e.data.duration === 'number') lastDuration = e.data.duration;
  }

  if (e.data.type === 'PROGRESS') {
    if (typeof e.data.duration === 'number') lastDuration = e.data.duration;
    if (!isScrubbing) {
      timelineScrub.value = String(Math.round((e.data.progress || 0) * 1000));
    }
    timelineVal.textContent = fmtSecs(e.data.time) + ' / ' + fmtSecs(e.data.duration);
  }
});

// ─── Button handlers ───────────────────────────────────────────────────────────

generateBtn.addEventListener('click', generateAnimation);

promptInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    generateAnimation();
  }
});

// Run button — executes whatever's currently in the code editor
runBtn.addEventListener('click', () => {
  const code = codeDisplay.value.trim();
  if (!code) return;
  currentCode = code;
  runAnimation(code);
  resetPauseState();
  setStatus('▶ Running…', 'loading');
  setTimeout(() => setStatus('✓ Animation ready', 'success'), 600);
});

// Replay button — same as Run (respects edits)
replayBtn.addEventListener('click', () => {
  const code = codeDisplay.value.trim();
  if (!code) return;
  runAnimation(code);
  resetPauseState();
  setStatus('↺ Replaying…', 'loading');
  setTimeout(() => setStatus('✓ Animation ready', 'success'), 600);
});

// Pause / Play toggle
pauseBtn.addEventListener('click', () => {
  isPaused = !isPaused;
  if (isPaused) {
    canvasFrame.contentWindow.postMessage({ type: 'PAUSE' }, '*');
    pauseBtn.textContent = '▶ Play';
    pauseBtn.classList.add('paused');
  } else {
    canvasFrame.contentWindow.postMessage({ type: 'PLAY' }, '*');
    pauseBtn.textContent = '⏸ Pause';
    pauseBtn.classList.remove('paused');
  }
});

resetBtn.addEventListener('click', () => {
  resetCanvas();
  resetPauseState();
  setStatus('Canvas reset.', '');
});

copyBtn.addEventListener('click', () => {
  const code = codeDisplay.value.trim();
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    setStatus('✓ Copied to clipboard!', 'success');
    setTimeout(() => setStatus('✓ Animation ready', 'success'), 1800);
  }).catch(() => {
    // Fallback for browsers without clipboard API
    const ta = document.createElement('textarea');
    ta.value = code;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    setStatus('✓ Copied!', 'success');
  });
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function displayCode(code) {
  codeDisplay.value = code;
}

function resetPauseState() {
  isPaused = false;
  pauseBtn.textContent = '⏸ Pause';
  pauseBtn.classList.remove('paused');
}

function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + type;
}
