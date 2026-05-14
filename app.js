/**
 * MotionLab — AI GSAP Studio
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

const promptInput   = document.getElementById('prompt');
const generateBtn   = document.getElementById('generate-btn');
const codeDisplay   = document.getElementById('code-display');
const statusEl      = document.getElementById('status');
const canvasFrame   = document.getElementById('canvas-frame');
const durationSlider = document.getElementById('duration');
const durationVal   = document.getElementById('duration-val');
const staggerSlider  = document.getElementById('stagger');
const staggerVal    = document.getElementById('stagger-val');
const easeSelect    = document.getElementById('ease');
const replayBtn     = document.getElementById('replay-btn');
const resetBtn      = document.getElementById('reset-btn');
const copyBtn       = document.getElementById('copy-btn');

// ─── State ─────────────────────────────────────────────────────────────────────

let currentCode  = '';
let isGenerating = false;

// ─── Slider live updates ───────────────────────────────────────────────────────

durationSlider.addEventListener('input', () => {
  durationVal.textContent = parseFloat(durationSlider.value).toFixed(1) + 's';
});

staggerSlider.addEventListener('input', () => {
  staggerVal.textContent = parseFloat(staggerSlider.value).toFixed(2) + 's';
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
  setStatus('Generating animation…', 'loading');
  codeDisplay.innerHTML = '<span class="code-placeholder">// Thinking…</span>';

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

    let code = data.code || '';

    currentCode = code;
    displayCode(code);
    runAnimation(code);
    setStatus('✓ Animation ready', 'success');

  } catch (err) {
    setStatus('✗ ' + err.message, 'error');
    codeDisplay.innerHTML = '<span class="code-placeholder">// Error — check console for details</span>';
    console.error('[MotionLab]', err);
  } finally {
    isGenerating = false;
    generateBtn.disabled = false;
    generateBtn.classList.remove('generating');
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
    console.error('[MotionLab sandbox]', e.data.error);
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

replayBtn.addEventListener('click', () => {
  if (!currentCode) return;
  runAnimation(currentCode);
  setStatus('↺ Replaying…', 'loading');
  setTimeout(() => setStatus('✓ Animation ready', 'success'), 600);
});

resetBtn.addEventListener('click', () => {
  resetCanvas();
  setStatus('Canvas reset.', '');
});

copyBtn.addEventListener('click', () => {
  if (!currentCode) return;
  navigator.clipboard.writeText(currentCode).then(() => {
    setStatus('✓ Copied to clipboard!', 'success');
    setTimeout(() => setStatus('✓ Animation ready', 'success'), 1800);
  }).catch(() => {
    // Fallback for browsers without clipboard API
    const ta = document.createElement('textarea');
    ta.value = currentCode;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    setStatus('✓ Copied!', 'success');
  });
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function displayCode(code) {
  codeDisplay.textContent = code;
}

function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + type;
}
