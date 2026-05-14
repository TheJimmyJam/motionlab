/**
 * MotionLab — AI GSAP Studio
 * app.js
 *
 * Calls Claude API → generates GSAP code → runs in sandboxed iframe
 */

// ─── Config ───────────────────────────────────────────────────────────────────

// API key loaded from config.js (gitignored) — see config.example.js
const ANTHROPIC_API_KEY = window.MOTIONLAB_CONFIG?.apiKey || '';
const MODEL = 'claude-sonnet-4-6';

// ─── System Prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the animation engine inside MotionLab, an AI GSAP studio. Your ONLY job is to output valid JavaScript that animates elements on a web canvas using GSAP 3.

AVAILABLE DOM ELEMENTS (already in the page, use their exact IDs/classes):
  #heading    — large text: "MotionLab"
  #subtext    — subtitle text below heading
  #card       — rounded card (240px wide); contains .card-title and .card-body
  #boxes      — flex row containing three boxes
  #box1       — indigo box (72×72px, border-radius 14px)
  #box2       — purple box (72×72px, border-radius 14px)
  #box3       — violet box (72×72px, border-radius 14px)
  #circle     — pink-orange gradient circle (72×72px)
  #stage      — the full stage container (flex column, centered, wraps everything)

WHAT YOU CAN USE:
  - gsap.to(), gsap.from(), gsap.fromTo(), gsap.set()
  - gsap.timeline() with .to(), .from(), .fromTo(), .set(), .call(), .add()
  - Stagger: { stagger: 0.12 } or gsap.utils.toArray()
  - Eases: "power2.out", "power3.out", "expo.out", "elastic.out(1,0.3)", "back.out(1.7)", "bounce.out", "sine.inOut", "none", "linear"
  - Properties: x, y, rotation, scale, scaleX, scaleY, skewX, skewY, opacity, width, height, backgroundColor, borderRadius, boxShadow, transformOrigin, autoAlpha

OUTPUT RULES (non-negotiable):
  1. Output ONLY JavaScript code. Zero markdown. No \`\`\` fences. No explanations. No comments unless brief and useful.
  2. The code runs inside function(gsap){ YOUR CODE HERE } — do NOT redeclare gsap, do NOT use import/require/fetch.
  3. Make a complete, satisfying animation. Not just a single tween — use timelines for sequences.
  4. Be creative and expressive. Premium motion feels alive: thoughtful easing, subtle overlaps, considered rhythm.
  5. Clean, readable code. Consistent indentation.
  6. You may animate any subset of elements — you don't have to animate all of them.
  7. For repetitive/looping animations, use { repeat: -1, yoyo: true } or similar.`;

// ─── Quick-start suggestions ───────────────────────────────────────────────────

const SUGGESTIONS = [
  'Bounce the boxes in from below with stagger',
  'Make the circle pulse like a heartbeat',
  'Slide the card in from the right with a spring',
  'Fade everything in one by one, top to bottom',
  'Make everything spin and scale dramatically',
  'Shake the heading like a glitch effect',
  'Stagger boxes from left with elastic easing',
  'Make the card flip and pop into place',
  'Animate a wave through the boxes',
  'Create a snappy entrance for the whole stage',
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

  const userMessage =
    `Animation request: ${prompt}\n\n` +
    `User's preferred defaults (use as a baseline, vary for artistic effect):\n` +
    `  duration: ${duration}s\n` +
    `  ease: ${ease}\n` +
    `  stagger (if multiple elements): ${stagger}s`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-client-side-key-allowed': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    let code = data.content[0].text.trim();

    // Strip any accidental markdown fences the model might output
    code = code
      .replace(/^```[\w]*\n?/m, '')
      .replace(/\n?```$/m, '')
      .trim();

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
