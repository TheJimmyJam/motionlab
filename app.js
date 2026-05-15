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

// ─── State ─────────────────────────────────────────────────────────────────────

let currentCode  = '';
let isGenerating = false;
let isPaused     = false;

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
    displayCode(code);
    runAnimation(code);
    resetPauseState();
    setStatus('✓ Animation ready', 'success');
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
  if (e.data.type === 'ANIMATION_ERROR') {
    setStatus('✗ Runtime error: ' + e.data.error, 'error');
    console.error('[Jankless sandbox]', e.data.error);
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
