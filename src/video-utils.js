const axios = require('axios');

function extractYoutubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

function extractRealUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.hostname.includes('google.com') && parsed.pathname === '/url') {
      const target = parsed.searchParams.get('url') || parsed.searchParams.get('q');
      if (target?.startsWith('http')) return target;
    }
    const nested = parsed.searchParams.get('url');
    if (nested?.startsWith('http')) return nested;
  } catch (_) {}
  return urlString;
}

async function resolveUrlRedirects(url, depth = 0) {
  if (depth > 5 || !url?.startsWith('http')) return url;

  const isShortTiktok = url.includes('tiktok.com') && (
    url.includes('/t/') || url.includes('vm.tiktok.com') ||
    url.includes('vt.tiktok.com') || url.includes('v.tiktok.com')
  );
  if (!isShortTiktok) return url;

  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CinemaDasGuria/1.0)' },
      maxRedirects: 0,
      validateStatus: (s) => s >= 300 && s < 400,
      timeout: 4000
    });
    if (response.headers.location) {
      return resolveUrlRedirects(new URL(response.headers.location, url).toString(), depth + 1);
    }
  } catch (_) {}
  return url;
}

function normalizeUrl(url) {
  if (!url) return '';
  const ytId = extractYoutubeId(url);
  return ytId ? `https://www.youtube.com/watch?v=${ytId}` : url.trim();
}

async function resolveVideoMetadata(url) {
  const ytId = extractYoutubeId(url);
  let title = `Vídeo (${new URL(url).hostname})`;
  let thumbnail = '';

  if (ytId) {
    title = 'Vídeo do YouTube';
    thumbnail = `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
    try {
      const res = await axios.get(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        { timeout: 3000 }
      );
      if (res.data?.title) title = res.data.title;
      if (res.data?.thumbnail_url) thumbnail = res.data.thumbnail_url;
    } catch (_) {}
  } else if (url.includes('tiktok.com')) {
    title = 'Vídeo do TikTok';
    thumbnail = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='90'><rect width='120' height='90' rx='10' fill='%231e1e24'/><polygon points='50,35 75,45 50,55' fill='%23ff0050'/></svg>`;
    try {
      const resolved = await resolveUrlRedirects(url);
      const res = await axios.get(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(resolved)}`,
        { timeout: 3000 }
      );
      if (res.data?.title) title = res.data.title;
      if (res.data?.thumbnail_url) thumbnail = res.data.thumbnail_url;
    } catch (_) {}
  } else {
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean);
      if (parts.length) title = decodeURIComponent(parts.pop());
    } catch (_) {}
    thumbnail = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='90'><rect width='120' height='90' rx='10' fill='%231e1e24'/><polygon points='50,35 75,45 50,55' fill='%2300f2ea'/></svg>`;
  }

  return { title, thumbnail: thumbnail.replace(/"/g, "'") };
}

module.exports = {
  extractYoutubeId,
  extractRealUrl,
  resolveUrlRedirects,
  normalizeUrl,
  resolveVideoMetadata
};
