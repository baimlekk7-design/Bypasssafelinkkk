const crypto = require('crypto');

// ──────────────────────────────────────────────
//  BYPASS SFL (Khaddavi)
// ──────────────────────────────────────────────
async function bypassSfl(url) {
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
      provider: 'SFL',
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
      provider: 'SFL',
      input_url: url,
      message: err.message,
      duration: `${(elapsed / 1000).toFixed(2)}s`,
      elapsed_ms: elapsed
    };
  }
}

// ──────────────────────────────────────────────
//  BYPASS VERTISE (direct-link.net / linkvertise)
// ──────────────────────────────────────────────
async function bypassVertise(inputUrl) {
  const start = Date.now();
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  try {
    let resolvedUrl = inputUrl;
    if (inputUrl.includes('direct-link.net')) {
      const res = await fetch(inputUrl, {
        method: 'GET',
        headers: { 'User-Agent': headers['User-Agent'] },
        redirect: 'manual'
      });
      const loc = res.headers.get('location');
      if (loc) resolvedUrl = new URL(loc, inputUrl).href;
    }

    const parsed = new URL(resolvedUrl);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const userId = parts[0] === 'access' ? parts[1] : parts[0];
    const hash = parts[0] === 'access' ? parts[2] : parts[1];

    if (!userId || !hash) {
      throw new Error('Format URL Linkvertise tidak valid');
    }

    const query = `
      query($input: PublicLinkIdentificationInput!) {
        linkByIdentifier(linkIdentificationInput: $input) {
          id
          url
          target_host
          title
          is_premium_only
        }
      }
    `;

    const gqlRes = await fetch('https://publisher.linkvertise.com/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        variables: {
          input: {
            userIdAndUrl: { user_id: String(userId), url: String(hash) }
          }
        }
      })
    });

    const body = await gqlRes.json();
    const linkData = body.data?.linkByIdentifier;

    if (!linkData) {
      const errMsg = body.errors?.[0]?.message || 'Data link tidak ditemukan';
      throw new Error(errMsg);
    }

    let dest = linkData.target_host;
    if (dest && !dest.startsWith('http://') && !dest.startsWith('https://')) {
      dest = 'https://' + dest;
    }

    const elapsed = Date.now() - start;
    return {
      status: 'success',
      author: 'Baim',
      provider: 'Vertise',
      input_url: inputUrl,
      destination: dest || null,
      title: linkData.title || null,
      is_premium_only: Boolean(linkData.is_premium_only),
      duration: `${(elapsed / 1000).toFixed(2)}s`,
      elapsed_ms: elapsed
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    return {
      status: 'error',
      author: 'Baim',
      provider: 'Vertise',
      input_url: inputUrl,
      message: err.message,
      duration: `${(elapsed / 1000).toFixed(2)}s`,
      elapsed_ms: elapsed
    };
  }
}

// ──────────────────────────────────────────────
//  DETEKSI PROVIDER
// ──────────────────────────────────────────────
function detectProvider(url) {
  if (url.includes('sfl.gl') || url.includes('khaddavi.net')) return 'sfl';
  if (url.includes('direct-link.net') || url.includes('linkvertise')) return 'vertise';
  return 'unknown';
}

// ──────────────────────────────────────────────
//  HANDLER VERCEL
// ──────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const provider = detectProvider(url);
    let result;
    if (provider === 'sfl') {
      result = await bypassSfl(url);
    } else if (provider === 'vertise') {
      result = await bypassVertise(url);
    } else {
      throw new Error('Provider tidak dikenali. Gunakan sfl.gl atau direct-link.net');
    }
    result.author = 'Baim'; // pastikan
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      author: 'Baim',
      input_url: url,
      message: err.message
    });
  }
};
