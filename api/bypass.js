// api/bypass.js
const crypto = require('crypto');

async function bypass(url = 'https://sfl.gl/u0i6x') {
  const start = Date.now();
  const cookies = new Map();

  const updateCookies = (res) => {
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (k && v) cookies.set(k.trim(), v.trim());
    }
  };

  const getCookieHeader = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

  const get = async (targetUrl, referer = '') => {
    let cur = targetUrl;
    let ref = referer;
    while (true) {
      const res = await fetch(cur, {
        headers: { ...headers, Cookie: getCookieHeader(), ...(ref ? { Referer: ref } : {}) },
        redirect: 'manual'
      });
      updateCookies(res);
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        ref = cur;
        cur = new URL(res.headers.get('location'), cur).href;
        continue;
      }
      return { url: cur, text: await res.text() };
    }
  };

  const post = async (path, body, referer) => {
    const res = await fetch('https://app.khaddavi.net' + path, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        Cookie: getCookieHeader(),
        Referer: referer,
        Origin: 'https://app.khaddavi.net',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(body)
    });
    updateCookies(res);
    return res.json();
  };

  const genToken = () => {
    const raw = decodeURIComponent(cookies.get('XSRF-TOKEN') || '');
    const fp = '#' + Buffer.from(crypto.randomBytes(32).toString('hex')).toString('base64');
    return raw.slice(0, 128 - fp.length) + fp;
  };

  try {
    const { text: html1 } = await get(url);
    const rayId = html1.match(/name=["']ray_id["']\s+value=["']([^"']+)["']/)[1];
    const alias = html1.match(/name=["']alias["']\s+value=["']([^"']+)["']/)[1];
    const action = html1.match(/<form\s+action=["']([^"']+)["']/)[1];

    const { url: p1 } = await get(`${action}?ray_id=${rayId}&alias=${alias}`, url);
    await post('/api/session', { _token: genToken() }, p1);
    const { target } = await post('/api/verify', { _a: 0, captcha: null, passcode: null }, p1);

    const { url: p2 } = await get(target, p1);
    await post('/api/session', { _token: genToken() }, p2);
    const k = Math.floor(Math.random() * 1000);
    const goRes = await post('/api/go', { key: k, size: `${(1920 + k) * 2}.${(1080 + k) * 2}` }, p2);

    const { text: readyHtml } = await get(goRes.url || goRes.data?.url, p2);
    const destination = readyHtml.match(/window\.location\.href\s*=\s*["']([^"']+)["']/)[1].replace(/\\\//g, '/');

    const elapsed = Date.now() - start;
    return {
      status: 'success',
      author: 'Baim',
      input_url: url,
      alias,
      destination,
      duration: `${(elapsed / 1000).toFixed(2)}s`,
      elapsed_ms: elapsed
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    return {
      status: 'error',
      author: 'Baim',
      input_url: url,
      message: err.message,
      duration: `${(elapsed / 1000).toFixed(2)}s`,
      elapsed_ms: elapsed
    };
  }
}

// ========== Handler untuk Vercel ==========
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const result = await bypass(url);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      author: 'Baim',
      input_url: url,
      message: err.message,
    });
  }
};
