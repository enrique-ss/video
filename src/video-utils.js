const axios = require('axios');

function extractYoutubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

function extractInstagramShortcode(url) {
  const postMatch = url.match(/\/p\/([^\/?]+)/);
  const reelMatch = url.match(/\/reel\/([^\/?]+)/) || url.match(/\/reels\/([^\/?]+)/);
  return postMatch ? postMatch[1] : (reelMatch ? reelMatch[1] : null);
}

async function getInstagramDirectUrl(url) {
  try {
    const shortcode = extractInstagramShortcode(url);
    if (!shortcode) return null;

    // Tenta obter a página do Instagram
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    // Procura por URLs de vídeo no HTML da página
    const html = response.data;
    
    // Padrão para encontrar URLs de vídeo do Instagram
    const videoUrlMatch = html.match(/https:\/\/[^"\s]+\.mp4[^"\s]*/);
    if (videoUrlMatch && videoUrlMatch[0]) {
      return videoUrlMatch[0];
    }

    // Tenta outro padrão para dados JSON embutidos
    const jsonMatch = html.match(/"video_url":"([^"]+)"/);
    if (jsonMatch && jsonMatch[1]) {
      // Decodifica caracteres Unicode escapados
      return jsonMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
    }

    return null;
  } catch (error) {
    console.error('Erro ao obter URL direta do Instagram:', error.message);
    return null;
  }
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
    thumbnail = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
    try {
      // Tenta oEmbed do YouTube primeiro
      const res = await axios.get(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        { timeout: 8000 }
      );
      if (res.data?.title) title = res.data.title;
      if (res.data?.thumbnail_url) thumbnail = res.data.thumbnail_url;
    } catch (error) {
      console.log('YouTube oEmbed falhou, usando fallback:', error.message);
      // Tenta extrair informações da URL
      try {
        const urlObj = new URL(url);
        const params = urlObj.searchParams;
        const videoId = params.get('v') || ytId;
        title = `YouTube ID: ${videoId}`;
      } catch (_) {
        title = 'Vídeo do YouTube';
      }
    }
  } else if (url.includes('tiktok.com')) {
    // Extrai informações da URL do TikTok para um título mais descritivo
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      // Tenta extrair @username do TikTok
      const usernameMatch = pathname.match(/@([^\/]+)/);
      const username = usernameMatch ? usernameMatch[1] : null;
      
      // Tenta extrair o ID do vídeo
      const videoIdMatch = pathname.match(/\/video\/(\d+)/) || pathname.match(/\/v\/(\d+)/);
      const videoId = videoIdMatch ? videoIdMatch[1] : null;
      
      if (username && videoId) {
        title = `@${username} - ${videoId}`;
      } else if (username) {
        title = `Vídeo de @${username}`;
      } else if (videoId) {
        title = `TikTok ${videoId}`;
      } else {
        title = 'Vídeo do TikTok';
      }
    } catch (_) {
      title = 'Vídeo do TikTok';
    }
    
    thumbnail = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='90'><rect width='120' height='90' rx='10' fill='%231e1e24'/><text x='60' y='50' text-anchor='middle' fill='%23ff0050' font-size='14'>TikTok</text></svg>`;
    
    try {
      const resolved = await resolveUrlRedirects(url);
      const res = await axios.get(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(resolved)}`,
        { timeout: 8000 }
      );
      if (res.data?.title) title = res.data.title;
      if (res.data?.thumbnail_url) thumbnail = res.data.thumbnail_url;
    } catch (error) {
      console.log('TikTok oEmbed falhou, usando fallback:', error.message);
      // Mantém o título extraído da URL e o fallback SVG
    }
  } else if (url.includes('instagram.com')) {
    title = 'Vídeo do Instagram';
    thumbnail = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='90'><rect width='120' height='90' rx='10' fill='%231e1e24'/><text x='60' y='50' text-anchor='middle' fill='%23E1306C' font-size='12'>Instagram</text></svg>`;
    try {
      const res = await axios.get(
        `https://www.instagram.com/oembed?url=${encodeURIComponent(url)}`,
        { timeout: 8000 }
      );
      if (res.data?.title) title = res.data.title;
      if (res.data?.thumbnail_url) thumbnail = res.data.thumbnail_url;
    } catch (error) {
      console.log('Instagram oEmbed falhou, usando fallback:', error.message);
      // Mantém o fallback SVG se oEmbed do Instagram falhar
    }
  } else {
    try {
      const urlObj = new URL(url);
      const parts = urlObj.pathname.split('/').filter(Boolean);
      if (parts.length) {
        const lastPart = parts.pop();
        title = decodeURIComponent(lastPart).replace(/[-_]/g, ' ');
        // Capitaliza primeira letra
        title = title.charAt(0).toUpperCase() + title.slice(1);
      }
      // Se não conseguir extrair nada da URL, usa o hostname
      if (!title || title === url) {
        title = `Vídeo de ${urlObj.hostname}`;
      }
    } catch (error) {
      title = 'Vídeo';
    }
    thumbnail = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='90'><rect width='120' height='90' rx='10' fill='%231e1e24'/><text x='60' y='50' text-anchor='middle' fill='%2300f2ea' font-size='12'>Vídeo</text></svg>`;
  }

  return { title, thumbnail: thumbnail.replace(/"/g, "'") };
}

module.exports = {
  extractYoutubeId,
  extractRealUrl,
  resolveUrlRedirects,
  normalizeUrl,
  resolveVideoMetadata,
  extractInstagramShortcode,
  getInstagramDirectUrl
};
