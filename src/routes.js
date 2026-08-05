const axios = require('axios');
const db = require('./db');
const { isOnline } = require('./config');
const { extractRealUrl, resolveVideoMetadata, getInstagramDirectUrl } = require('./video-utils');

const FALLBACK_GIFS = [
  { id: '1', title: 'Pipoca', url: 'https://media.giphy.com/media/l0HlPystfePnAI3G8/giphy.gif' },
  { id: '2', title: 'Minions', url: 'https://media.giphy.com/media/143v0Z4767T15e/giphy.gif' },
  { id: '3', title: 'Chocado', url: 'https://media.giphy.com/media/3o7527pa7qs9kCG78A/giphy.gif' },
  { id: '4', title: 'Festa', url: 'https://media.giphy.com/media/l1J9yTfqwY7WI2fcQ/giphy.gif' },
  { id: '5', title: 'Palmas', url: 'https://media.giphy.com/media/26u4cxtv7vPq52Pfi/giphy.gif' },
  { id: '6', title: 'Rindo', url: 'https://media.giphy.com/media/3o7TKSjRrfIPjei1fG/giphy.gif' },
  { id: '7', title: 'Gato', url: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif' },
  { id: '8', title: 'Tédio', url: 'https://media.giphy.com/media/tHvx53QkPMXh6/giphy.gif' }
];

function mountRoutes(app) {
  app.get('/env.js', (req, res) => {
    res.type('application/javascript');
    res.send(`window.ENV = ${JSON.stringify({
      APP_MODE: isOnline ? 'online' : 'offline'
    })};`);
  });

  app.post('/api/register', async (req, res) => {
    const { name, email, password, avatar } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Preencha nome, e-mail e senha.' });
    }
    try {
      const user = await db.register({ name, email, password, avatar });
      res.status(201).json({ success: true, user });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Preencha e-mail e senha.' });
    }
    try {
      const user = await db.login({ email, password });
      res.json({ success: true, user });
    } catch (err) {
      res.status(401).json({ error: err.message });
    }
  });

  app.get('/api/profile', async (req, res) => {
    const auth = await db.parseAuth(req);
    if (!auth) return res.status(401).json({ error: 'Sessão inválida.' });
    try {
      const user = await db.loadFullUser(auth, auth.token);
      res.json({ success: true, user });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/profile', async (req, res) => {
    const auth = await db.parseAuth(req);
    if (!auth) return res.status(401).json({ error: 'Sessão inválida.' });
    const { name, avatar, bg_color } = req.body || {};
    const result = await db.updateProfile(auth, { name, avatar, bg_color });
    if (!result.ok) return res.status(400).json({ error: result.error });
    try {
      const user = await db.loadFullUser(auth, auth.token);
      res.json({ success: true, user });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/acervo', async (req, res) => {
    const auth = await db.parseAuth(req);
    if (!auth) return res.status(401).json({ error: 'Sessão inválida.' });
    const list = await db.listAcervo(auth.id, auth.token);
    
    // Atualiza metadados de vídeos com títulos genéricos
    const updatedList = await Promise.all(list.map(async (item) => {
      // Se o título for genérico ("Vídeo do YouTube", "Vídeo do TikTok", etc), tenta atualizar
      if (item.title && (
        item.title.startsWith('Vídeo do YouTube') ||
        item.title.startsWith('Vídeo do TikTok') ||
        item.title.startsWith('Vídeo do Instagram') ||
        item.title.startsWith('Vídeo (') ||
        item.title === 'Vídeo'
      )) {
        try {
          const meta = await resolveVideoMetadata(item.url);
          // Atualiza no banco de dados
          await db.updateAcervoItem(auth.id, item.url, { 
            title: meta.title, 
            thumbnail: meta.thumbnail 
          }, auth.token);
          return { ...item, title: meta.title, thumbnail: meta.thumbnail };
        } catch (error) {
          console.log('Erro ao atualizar metadados:', error.message);
          return item;
        }
      }
      return item;
    }));
    
    res.json({ success: true, list: updatedList });
  });

  app.post('/api/acervo', async (req, res) => {
    const auth = await db.parseAuth(req);
    if (!auth) return res.status(401).json({ error: 'Sessão inválida.' });
    const rawUrl = req.body?.url;
    if (!rawUrl) return res.status(400).json({ error: 'Envie a URL do vídeo.' });

    try {
      const url = extractRealUrl(rawUrl);

      // Verifica se é YouTube ou TikTok
      const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
      const isTiktok = url.includes('tiktok.com');

      if (!isYoutube && !isTiktok) {
        return res.status(400).json({ error: 'Por favor, use apenas links do YouTube ou TikTok!' });
      }

      const meta = await resolveVideoMetadata(url);
      const list = await db.addToAcervo(auth.id, { url, title: meta.title, thumbnail: meta.thumbnail }, auth.token);
      res.status(201).json({ success: true, list });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/acervo', async (req, res) => {
    const auth = await db.parseAuth(req);
    if (!auth) return res.status(401).json({ error: 'Sessão inválida.' });
    const url = extractRealUrl(req.body?.url || '');
    if (!url) return res.status(400).json({ error: 'URL obrigatória.' });

    try {
      const list = await db.removeFromAcervo(auth.id, url, auth.token);
      res.json({ success: true, list });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/instagram-direct-url', async (req, res) => {
    const url = req.query.url;
    if (!url || !url.includes('instagram.com')) {
      return res.status(400).json({ error: 'URL do Instagram obrigatória.' });
    }

    try {
      const directUrl = await getInstagramDirectUrl(url);
      if (directUrl) {
        res.json({ success: true, directUrl });
      } else {
        res.status(404).json({ error: 'Não foi possível obter URL direta do vídeo.' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/gifs', async (req, res) => {
    const q = req.query.q || '';
    const apiKey = process.env.GIPHY_API_KEY;
    if (!apiKey) {
      const gifs = q
        ? FALLBACK_GIFS.filter((g) => g.title.toLowerCase().includes(q.toLowerCase()))
        : FALLBACK_GIFS;
      return res.json({ success: true, gifs, isFallback: true });
    }
    try {
      const url = q
        ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=15`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=15`;
      const response = await axios.get(url);
      const gifs = (response.data?.data || []).map((item) => ({
        id: item.id,
        title: item.title,
        url: item.images.fixed_height.url
      }));
      res.json({ success: true, gifs, isFallback: false });
    } catch (_) {
      res.json({ success: true, gifs: FALLBACK_GIFS, isFallback: true });
    }
  });
}

module.exports = { mountRoutes };
