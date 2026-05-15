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

// ─── Quick-start suggestions ───────────────────────────────────────────────────

const SUGGESTIONS = [
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

// ─── Suggestions ──────────────────────────────────────────────────────────────

const suggestionsEl = document.getElementById('suggestions');
SUGGESTIONS.forEach(s => {
  const btn = document.createElement('button');
  btn.className = 'suggestion-chip';
  btn.textContent = s;
  btn.addEventListener('click', () => {
    promptInput.value = s;
    generateAnimation();
  });
  suggestionsEl.appendChild(btn);
});

// ─── Targets — clickable selectors that exist in the canvas ──────────────────

const TARGETS = [
  { sel: '#heading',  label: '#heading'  },
  { sel: '#subtext',  label: '#subtext'  },
  { sel: '#card',     label: '#card'     },
  { sel: '.card-bar', label: '.card-bar' },
  { sel: '#boxes',    label: '#boxes'    },
  { sel: '.box',      label: '.box'      },
  { sel: '#box1',     label: '#box1'     },
  { sel: '#box2',     label: '#box2'     },
  { sel: '#box3',     label: '#box3'     },
  { sel: '#circle',   label: '#circle'   },
];

function renderTargets() {
  targetsEl.innerHTML = '';
  TARGETS.forEach(t => {
    const chip = document.createElement('button');
    chip.className = 'target-chip';
    chip.textContent = t.label;
    chip.title = `Insert "${t.sel}" into your prompt`;
    chip.addEventListener('click', () => insertIntoPrompt(t.sel));
    targetsEl.appendChild(chip);
  });
}

function insertIntoPrompt(text) {
  const start = promptInput.selectionStart;
  const end   = promptInput.selectionEnd;
  const before = promptInput.value.slice(0, start);
  const after  = promptInput.value.slice(end);
  // Add a space if we're glued to existing non-space text
  const pad = before && !/\s$/.test(before) ? ' ' : '';
  const insert = pad + text + ' ';
  promptInput.value = before + insert + after;
  const pos = start + insert.length;
  promptInput.focus();
  promptInput.setSelectionRange(pos, pos);
}

renderTargets();

// ─── Panel tabs (Quick starts / History) ─────────────────────────────────────

panelTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.pane;
    panelTabs.forEach(t => t.classList.toggle('active', t === tab));
    document.getElementById('quickstarts-section').hidden = (target !== 'quickstarts-section');
    document.getElementById('history-section').hidden    = (target !== 'history-section');
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
