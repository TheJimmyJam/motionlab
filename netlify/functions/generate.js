/**
 * MotionLab — Anthropic API Proxy
 * Netlify serverless function: /.netlify/functions/generate
 * Routed to /api/generate via netlify.toml redirect
 *
 * Keeps the API key server-side only (Netlify env var ANTHROPIC_API_KEY).
 */

const SYSTEM_PROMPT = `You are the animation engine inside Jankless, an AI GSAP studio. Your ONLY job is to output valid JavaScript that animates elements on a web canvas using GSAP 3.

NUMBERED TARGETS (the user-facing vocabulary — when the prompt mentions "Target N", use the mapped selector):
  Target 1  → #heading       (single, the big "Jankless" title)
  Target 2  → #subtext       (single, the tagline below the heading)
  Target 3  → #card          (single, the Monthly Revenue dashboard card)
  Target 4  → .card-bar      (×7,    the bars inside the card — great for stagger)
  Target 5  → .box           (×3,    the three colored feature boxes — great for stagger)
  Target 6  → #circle        (single, the pink-orange gradient circle)

When the user writes "Target N", use the corresponding selector. When they describe elements in plain language ("the heading", "the boxes", "the chart bars"), map to the same elements naturally.

ADDITIONAL DOM ELEMENTS (available but not in the user-facing target list):
  #card contains:
    .card-header  — top row with label + badge
    .card-label   — "Monthly Revenue" label (small caps)
    .card-badge   — green "↑ 12.4%" pill badge
    .card-metric  — large "$24,391" number
    .card-sub     — "vs $21,680 last month" subtext
    .card-bars    — wrapper row for the .card-bar elements (last bar has .active)
  #boxes        — flex-row wrapper around the three .box elements
  #box1, #box2, #box3 — individual boxes if you need to single one out
  #stage        — the full stage container (flex column, centered, wraps everything)

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

exports.handler = async function (event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in environment.' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
  }

  const { prompt, duration = '0.6', ease = 'power2.out', stagger = '0.10' } = body;

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'prompt is required.' }) };
  }

  const userMessage =
    `Animation request: ${prompt.trim()}\n\n` +
    `User's preferred defaults (use as a baseline, vary for artistic effect):\n` +
    `  duration: ${duration}s\n` +
    `  ease: ${ease}\n` +
    `  stagger (if multiple elements): ${stagger}s`;

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const requestHeaders = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };

  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1200;

  try {
    let response;
    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: requestHeaders,
        body: requestBody,
      });

      // Success or a non-retryable error — stop retrying
      if (response.ok || response.status !== 529) break;

      // 529 = overloaded — wait and retry
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
      } else {
        lastError = 'Anthropic API is overloaded. Please try again in a moment.';
      }
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: lastError || errData.error?.message || `Anthropic API error ${response.status}` }),
      };
    }

    const data = await response.json();
    let code = data.content[0].text.trim();

    // Strip any accidental markdown fences
    code = code.replace(/^```[\w]*\n?/m, '').replace(/\n?```$/m, '').trim();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
