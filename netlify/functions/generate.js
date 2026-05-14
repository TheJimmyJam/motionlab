/**
 * MotionLab — Anthropic API Proxy
 * Netlify serverless function: /.netlify/functions/generate
 * Routed to /api/generate via netlify.toml redirect
 *
 * Keeps the API key server-side only (Netlify env var ANTHROPIC_API_KEY).
 */

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

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: errData.error?.message || `Anthropic API error ${response.status}` }),
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
