const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');
const Database = require('better-sqlite3');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ quiet: true });

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3002;


// Supabase Config
const requestedMode = (process.env.APP_MODE || 'offline').toLowerCase();
const hasSupabaseConfig = Boolean(
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_ANON_KEY
);
const runtimeMode = requestedMode === 'online' && hasSupabaseConfig ? 'online' : 'offline';
const supabaseEnabled = runtimeMode === 'online';

const { applySchema, dbPath } = require('./setup');

// Middleware
const publicPath = path.resolve(__dirname, '..', 'public');
console.log('Servindo arquivos estáticos de:', publicPath);
app.use(express.static(publicPath));
app.use(express.json());
app.use(cookieParser());

// Evita erro 404 de favicon.ico no console do navegador
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Banco de Dados SQLite (Sempre inicializado para autenticação estável e histórico local)
let offlineDb = null;
try {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  offlineDb = new Database(dbPath);
  applySchema(offlineDb);
  console.log('Banco de dados SQLite carregado com sucesso.');
} catch (err) {
  console.error('Erro ao inicializar SQLite:', err.message);
}

// Supabase Client
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseEnabled 
  ? createClient(process.env.SUPABASE_URL, supabaseKey)
  : null;

// 15 Cores exclusivas e vibrantes para os usuários (garante alta visibilidade em ambos os temas)
const PREDEFINED_COLORS = [
  '#ff0050', // Rosa Neon
  '#00f2ea', // Ciano Elétrico
  '#ffd700', // Ouro / Amarelo
  '#00ff66', // Verde Primavera
  '#7000ff', // Roxo Violeta
  '#ff7700', // Laranja Pôr do Sol
  '#ff00ff', // Magenta
  '#0099ff', // Azul Céu
  '#ff3333', // Vermelho Coral
  '#33cc33', // Verde Limão
  '#9933ff', // Lilás
  '#ff9900', // Laranja Âmbar
  '#00ffd8', // Turquesa
  '#ff00a0', // Rosa Escuro
  '#ffea00'  // Amarelo Limão
];

// Máquina de Estados Global - Cinema das Guria (Estilo Gartic Phone)
let cinemaState = {
  status: 'LOBBY', // LOBBY, PLAYING, VOTING, PODIUM
  gameMode: 'PALPITAR', // PALPITAR, ASSISTIR
  users: {}, // { userId: User }
  playlist: [], // [Video]
  currentVideo: null, // Video
  chatHistory: [], // [ChatMessage] - limit 50
  scores: {}, // { userId: points }
  videoAuthorsInRound: new Set(), // Set of userIds who added videos this round
  voting: {
    active: false,
    timer: 15,
    votesTrack: {}, // { votingUserId: votedForUserId }
    correctUserId: null
  }
};

let votingInterval = null;

// Função auxiliar para expurgar dados sensíveis antes de emitir para o cliente
function getClientState() {
  // Strip addedBy properties to ensure anonymity
  const safePlaylist = cinemaState.playlist.map(v => ({
    id: v.id,
    url: v.url,
    played: v.played
  }));

  const safeCurrentVideo = cinemaState.currentVideo ? {
    id: cinemaState.currentVideo.id,
    url: cinemaState.currentVideo.url,
    played: cinemaState.currentVideo.played
  } : null;

  return {
    status: cinemaState.status,
    gameMode: cinemaState.gameMode,
    users: Object.values(cinemaState.users),
    playlist: safePlaylist,
    currentVideo: safeCurrentVideo,
    chatHistory: cinemaState.chatHistory,
    scores: cinemaState.scores,
    voting: {
      active: cinemaState.voting.active,
      timer: cinemaState.voting.timer,
      votedUsers: Object.keys(cinemaState.voting.votesTrack), // Quem já votou (sem revelar o voto)
      options: getVotingOptions()
    }
  };
}

// Retorna todos os usuários no lobby que de fato enviaram pelo menos um vídeo para a rodada
function getVotingOptions() {
  const options = [];
  cinemaState.videoAuthorsInRound.forEach(userId => {
    const user = cinemaState.users[userId];
    if (user) {
      options.push({ id: user.id, name: user.name });
    }
  });
  return options;
}

// Salva classificação de pontuação final no SQLite local
function saveRankingToDb(sortedRank) {
  if (!offlineDb) return;
  try {
    const createdAt = new Date().toISOString();
    const insertHistory = offlineDb.prepare(`
      INSERT INTO history (id, room_id, video_url, added_by_user_id, added_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertUser = offlineDb.prepare(`
      INSERT OR IGNORE INTO users (id, name, email, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    sortedRank.forEach((player) => {
      insertUser.run(player.id, player.name, null, `points:${player.points}`, createdAt);
    });

    console.log('Pontuações da rodada salvas no banco de dados SQLite.');
  } catch (err) {
    console.error('Falha ao gravar no SQLite:', err.message);
  }
}

// API de Registro de Usuários
app.post('/api/register', async (req, res) => {
  const { name, email, password, avatar } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios!' });
  }

  const userId = 'usr_' + Math.random().toString(36).substr(2, 9);
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  const createdAt = new Date().toISOString();

  // Modo Online: Supabase
  if (supabaseEnabled && supabase) {
    try {
      // 1. Criar usuário no Supabase Auth nativo (Painel de Authentication)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.toLowerCase(),
        password: password,
        options: {
          data: { name: name } // Salva o nome nos metadados do Auth
        }
      });

      if (authError) {
        console.error('Supabase Auth error:', authError);
        return res.status(400).json({ error: 'Erro no Supabase Auth: ' + authError.message });
      }

      // Pega o ID seguro e nativo gerado pelo Supabase Auth (UUID)
      const finalUserId = (authData.user && authData.user.id) ? authData.user.id : userId;

      // 2. Inserir os dados visíveis no banco de dados público (Tabela users)
      const { error: insertError } = await supabase.from('users').insert({
        id: finalUserId,
        name,
        email: email.toLowerCase(),
        password_hash: passwordHash, // Mantido por compatibilidade de fallback
        avatar: avatar || null,
        bg_color: '#0a0a0c',
        created_at: createdAt
      });

      if (insertError) {
        console.error('Supabase public user insert error:', insertError);
        // Se der erro ao salvar os dados públicos, avisamos mas a conta Auth já existe
      }

      console.log(`Novo usuário registrado via Supabase Auth: ${name} (${email.toLowerCase()})`);
      return res.status(201).json({
        success: true,
        user: { id: finalUserId, name, email: email.toLowerCase(), avatar: avatar || null, bg_color: '#0a0a0c' }
      });
    } catch (err) {
      console.error('Erro inesperado no registro Supabase:', err.message);
      return res.status(500).json({ error: 'Falha ao registrar usuário.' });
    }
  }

  // Modo Offline: SQLite
  if (!offlineDb) {
    return res.status(500).json({ error: `Banco não configurado. Supabase ativo: ${supabaseEnabled}. Verifique se você fez o Deploy Manual no Render após salvar as variáveis.` });
  }
  try {
    const insert = offlineDb.prepare(`
      INSERT INTO users (id, name, email, password_hash, avatar, bg_color, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(userId, name, email.toLowerCase(), passwordHash, avatar || null, '#0a0a0c', createdAt);
    return res.status(201).json({
      success: true,
      user: { id: userId, name, email: email.toLowerCase(), avatar: avatar || null, bg_color: '#0a0a0c' }
    });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Este e-mail já está em uso!' });
    }
    console.error('Erro no registro SQLite:', err);
    return res.status(500).json({ error: 'Falha interna ao registrar usuário.' });
  }
});

// API de Login de Usuários
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Preencha e-mail e senha!' });
  }

  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

  // Modo Online: Supabase
  if (supabaseEnabled && supabase) {
    try {
      // 1. Tentar login oficial via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password: password
      });

      // Se falhar no Auth Oficial, tenta fallback para contas criadas antes desta atualização
      if (authError) {
        const { data: legacyUser } = await supabase
          .from('users')
          .select('*')
          .eq('email', email.toLowerCase())
          .maybeSingle();

        if (!legacyUser || legacyUser.password_hash !== passwordHash) {
          return res.status(401).json({ error: 'E-mail ou senha incorretos!' });
        }
        
        // Login com conta legada aprovado
        return res.json({
          success: true,
          user: { id: legacyUser.id, name: legacyUser.name, email: legacyUser.email, avatar: legacyUser.avatar || null, bg_color: legacyUser.bg_color || '#0a0a0c' }
        });
      }

      // 2. Login Auth oficial aprovado -> buscar dados públicos da conta
      const { data: user, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (!user) {
        // Fallback caso a tabela users não tenha o registro (sync error no momento da criação)
        // Garante a auto-criação na tabela pública para permitir que edições e fotos funcionem perfeitamente!
        try {
          const { error: autoInsertError } = await supabase.from('users').insert({
            id: authData.user.id,
            name: authData.user.user_metadata.name || 'Usuário',
            email: authData.user.email,
            password_hash: passwordHash, // Compatibilidade com fallback
            avatar: null,
            bg_color: '#0a0a0c',
            created_at: new Date().toISOString()
          });
          if (autoInsertError) {
            console.error('Erro ao auto-criar perfil público no Supabase durante login:', autoInsertError);
          }
        } catch (insertErr) {
          console.error('Exceção ao auto-criar perfil público no Supabase:', insertErr.message);
        }

        return res.json({
          success: true,
          user: { id: authData.user.id, name: authData.user.user_metadata.name || 'Usuário', email: authData.user.email, avatar: null, bg_color: '#0a0a0c' }
        });
      }

      return res.json({
        success: true,
        user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar || null, bg_color: user.bg_color || '#0a0a0c' }
      });
    } catch (err) {
      console.error('Erro no login Supabase:', err.message);
      return res.status(500).json({ error: 'Falha interna ao realizar login.' });
    }
  }

  // Modo Offline: SQLite
  if (!offlineDb) return res.status(500).json({ error: 'Banco de dados não configurado!' });
  try {
    const user = offlineDb.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user || user.password_hash !== passwordHash) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos!' });
    }
    return res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar || null, bg_color: user.bg_color || '#0a0a0c' }
    });
  } catch (err) {
    console.error('Erro no login SQLite:', err);
    return res.status(500).json({ error: 'Falha interna ao realizar login.' });
  }
});

// Lista de GIFs padrão/fallback (utilizada quando não há GIPHY_API_KEY no .env)
const FALLBACK_GIFS = [
  { id: '1', title: 'Pipoca Popcorn', url: 'https://media.giphy.com/media/l0HlPystfePnAI3G8/giphy.gif' },
  { id: '2', title: 'Cinema Minions', url: 'https://media.giphy.com/media/143v0Z4767T15e/giphy.gif' },
  { id: '3', title: 'Chocado Shocked', url: 'https://media.giphy.com/media/3o7527pa7qs9kCG78A/giphy.gif' },
  { id: '4', title: 'Festa Celebrate', url: 'https://media.giphy.com/media/l1J9yTfqwY7WI2fcQ/giphy.gif' },
  { id: '5', title: 'Palmas Applause', url: 'https://media.giphy.com/media/26u4cxtv7vPq52Pfi/giphy.gif' },
  { id: '6', title: 'Rindo Laughing', url: 'https://media.giphy.com/media/3o7TKSjRrfIPjei1fG/giphy.gif' },
  { id: '7', title: 'Gato Cat', url: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif' },
  { id: '8', title: 'Tédio Bored', url: 'https://media.giphy.com/media/tHvx53QkPMXh6/giphy.gif' }
];

// API de Busca e Trending de GIFs do Giphy
app.get('/api/gifs', async (req, res) => {
  const query = req.query.q || '';
  const apiKey = process.env.GIPHY_API_KEY;

  if (!apiKey) {
    if (query) {
      const filtered = FALLBACK_GIFS.filter(gif => 
        gif.title.toLowerCase().includes(query.toLowerCase())
      );
      return res.json({ success: true, gifs: filtered, isFallback: true });
    }
    return res.json({ success: true, gifs: FALLBACK_GIFS, isFallback: true });
  }

  try {
    const url = query 
      ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=15`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=15`;

    const response = await axios.get(url);
    if (response.data && response.data.data) {
      const gifs = response.data.data.map(item => ({
        id: item.id,
        title: item.title,
        url: item.images.fixed_height.url
      }));
      return res.json({ success: true, gifs, isFallback: false });
    }
    return res.json({ success: true, gifs: FALLBACK_GIFS, isFallback: true });
  } catch (error) {
    console.error('Erro ao buscar GIFs no Giphy:', error.message);
    return res.json({ success: true, gifs: FALLBACK_GIFS, isFallback: true });
  }
});

// --- ENDPOINTS DO ACERVO DE VÍDEOS (SQLite / Supabase) ---

// Obter acervo do usuário
app.get('/api/acervo', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ error: 'Parâmetro user_id obrigatório!' });
  }

  // Modo Online: Supabase
  if (supabaseEnabled && supabase) {
    try {
      const { data: list, error } = await supabase
        .from('acervo')
        .select('*')
        .eq('user_id', user_id)
        .order('id', { ascending: false });

      if (error) {
        console.error('Erro ao buscar acervo Supabase:', error.message || error);
        return res.status(500).json({ error: 'Erro ao buscar no Supabase: ' + (error.message || error) });
      }
      return res.json({ success: true, list: list || [] });
    } catch (err) {
      console.error('Exceção ao buscar acervo Supabase:', err.message);
      return res.status(500).json({ error: 'Falha interna ao buscar acervo.' });
    }
  }

  // Modo Offline: SQLite
  if (!offlineDb) {
    return res.status(500).json({ error: 'Banco de dados não configurado!' });
  }

  try {
    const list = offlineDb.prepare('SELECT * FROM acervo WHERE user_id = ? ORDER BY id DESC').all(user_id);
    return res.json({ success: true, list });
  } catch (err) {
    console.error('Erro ao buscar acervo SQLite:', err);
    return res.status(500).json({ error: 'Falha interna ao buscar acervo.' });
  }
});

// Adicionar vídeo ao acervo do usuário
app.post('/api/acervo', async (req, res) => {
  const { user_id, url, title, thumbnail } = req.body;
  if (!user_id || !url || !title || !thumbnail) {
    return res.status(400).json({ error: 'Dados incompletos!' });
  }

  const cleanedUrl = extractRealUrl(url);

  // Modo Online: Supabase
  if (supabaseEnabled && supabase) {
    try {
      const { error } = await supabase
        .from('acervo')
        .insert({
          user_id,
          url: cleanedUrl,
          title,
          thumbnail,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Erro ao salvar acervo Supabase:', error.message || error);
        return res.status(500).json({ error: 'Erro ao salvar no Supabase: ' + (error.message || error) });
      }
      return res.status(201).json({ success: true });
    } catch (err) {
      console.error('Exceção ao salvar acervo Supabase:', err.message);
      return res.status(500).json({ error: 'Falha interna ao salvar no acervo.' });
    }
  }

  // Modo Offline: SQLite
  if (!offlineDb) {
    return res.status(500).json({ error: 'Banco de dados não configurado!' });
  }

  try {
    const insert = offlineDb.prepare(`
      INSERT INTO acervo (user_id, url, title, thumbnail, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    insert.run(user_id, cleanedUrl, title, thumbnail, new Date().toISOString());

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('Erro ao salvar no acervo SQLite:', err);
    return res.status(500).json({ error: 'Falha interna ao salvar no acervo.' });
  }
});

// Remover vídeo do acervo do usuário
app.delete('/api/acervo', async (req, res) => {
  const { user_id, url } = req.body;
  if (!user_id || !url) {
    return res.status(400).json({ error: 'user_id e url são obrigatórios!' });
  }

  const cleanedUrl = extractRealUrl(url);

  // Modo Online: Supabase
  if (supabaseEnabled && supabase) {
    try {
      const { error } = await supabase
        .from('acervo')
        .delete()
        .eq('user_id', user_id)
        .eq('url', cleanedUrl);

      if (error) {
        console.error('Erro ao deletar acervo Supabase:', error.message || error);
        return res.status(500).json({ error: 'Erro ao deletar no Supabase: ' + (error.message || error) });
      }
      return res.json({ success: true });
    } catch (err) {
      console.error('Exceção ao deletar acervo Supabase:', err.message);
      return res.status(500).json({ error: 'Falha interna ao deletar vídeo.' });
    }
  }

  // Modo Offline: SQLite
  if (!offlineDb) {
    return res.status(500).json({ error: 'Banco de dados não configurado!' });
  }

  try {
    const del = offlineDb.prepare('DELETE FROM acervo WHERE user_id = ? AND url = ?');
    del.run(user_id, cleanedUrl);

    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao deletar no acervo SQLite:', err);
    return res.status(500).json({ error: 'Falha interna ao deletar vídeo.' });
  }
});

// Servir variáveis de ambiente para o frontend
app.get('/env.js', (req, res) => {
  const publicConfig = {
    APP_MODE: runtimeMode,
    SUPABASE_URL: supabaseEnabled ? process.env.SUPABASE_URL : '',
    SUPABASE_ANON_KEY: supabaseEnabled ? process.env.SUPABASE_ANON_KEY : ''
  };

  res.type('application/javascript');
  res.send(`window.ENV = ${JSON.stringify(publicConfig)};`);
});

// Helper Functions for Video URL Normalization
function extractYoutubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

async function resolveUrlRedirects(url, depth = 0) {
  if (depth > 5) return url;
  if (!url || typeof url !== 'string') return '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) return url;
  
  const isShortTiktok = url.includes('tiktok.com') && (
    url.includes('/t/') || 
    url.includes('vm.tiktok.com') || 
    url.includes('vt.tiktok.com') || 
    url.includes('v.tiktok.com')
  );
  if (!isShortTiktok) return url;

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      maxRedirects: 0,
      validateStatus: (status) => status >= 300 && status < 400,
      timeout: 4000
    });
    const location = response.headers.location;
    if (location) {
      const nextUrl = new URL(location, url).toString();
      return resolveUrlRedirects(nextUrl, depth + 1);
    }
  } catch (err) {
    // Fallback if request fails
  }
  return url;
}

function extractRealUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.hostname.includes('google.com') && parsed.pathname === '/url') {
      const target = parsed.searchParams.get('url') || parsed.searchParams.get('q');
      if (target && (target.startsWith('http://') || target.startsWith('https://'))) {
        return target;
      }
    }
    if (parsed.searchParams.has('url')) {
      const target = parsed.searchParams.get('url');
      if (target && (target.startsWith('http://') || target.startsWith('https://'))) {
        return target;
      }
    }
  } catch (e) {
  }
  return urlString;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function normalizeUrl(url) {
  if (!url) return '';
  const ytId = extractYoutubeId(url);
  if (ytId) {
    return `https://www.youtube.com/watch?v=${ytId}`;
  }
  return url.trim();
}

// Socket.io Logic - TikTok Cinema
io.on('connection', (socket) => {
  // Limitação de Conexão - Máximo 15 usuários
  const activeUserCount = Object.keys(cinemaState.users).length;
  if (activeUserCount >= 15) {
    socket.emit('errorMsg', 'A sala está cheia (máximo de 15 usuários)!');
    socket.disconnect(true);
    return;
  }

  console.log('User conectado no socket:', socket.id);

  // Registro/Join do Usuário
  socket.on('join', async (userData) => {
    if (!userData || !userData.id) return;

    // Verificar se o usuário ainda existe no banco de dados (Supabase/SQLite)
    if (supabaseEnabled && supabase) {
      try {
        const { data: dbUser, error } = await supabase
          .from('users')
          .select('id')
          .eq('id', userData.id)
          .maybeSingle();

        if (error || !dbUser) {
          console.log(`Usuário não encontrado ou deletado no Supabase: ${userData.id}. Forçando deslogar.`);
          socket.emit('forceLogout', 'Sua conta não existe mais ou foi excluída. Você foi deslogado.');
          // Remove da lista de usuários ativos caso estivesse lá
          delete cinemaState.users[userData.id];
          io.emit('updateUsers', Object.values(cinemaState.users));
          return;
        }
      } catch (err) {
        console.error('Erro ao verificar existência de usuário no Supabase:', err.message);
      }
    } else if (offlineDb) {
      try {
        const dbUser = offlineDb.prepare('SELECT id FROM users WHERE id = ?').get(userData.id);
        if (!dbUser) {
          console.log(`Usuário não encontrado ou deletado no SQLite: ${userData.id}. Forçando deslogar.`);
          socket.emit('forceLogout', 'Sua conta não existe mais ou foi excluída. Você foi deslogado.');
          // Remove da lista de usuários ativos caso estivesse lá
          delete cinemaState.users[userData.id];
          io.emit('updateUsers', Object.values(cinemaState.users));
          return;
        }
      } catch (err) {
        console.error('Erro ao verificar existência de usuário no SQLite:', err);
      }
    }

    let user = Object.values(cinemaState.users).find(u => u.id === userData.id);

    if (user) {
      // Reconexão de usuário existente
      user.socketId = socket.id;
      user.name = userData.name || user.name;
      if (userData.avatar) user.avatar = userData.avatar;
      if (userData.bg_color) user.bg_color = userData.bg_color;
      console.log(`Usuário ${user.name} reconectou sob socket ${socket.id}`);
    } else {
      // Criação de novo usuário ativo
      const isFirst = Object.keys(cinemaState.users).length === 0;

      // Distribuição de cores exclusivas sem repetição (máximo de 15 usuários)
      const activeColors = Object.values(cinemaState.users).map(u => u.color);
      const availableColors = PREDEFINED_COLORS.filter(c => !activeColors.includes(c));
      const assignedColor = availableColors.length > 0
        ? availableColors[Math.floor(Math.random() * availableColors.length)]
        : `#${Math.floor(Math.random()*16777215).toString(16)}`;

      user = {
        id: userData.id,
        name: userData.name || 'Convidado ' + Math.floor(Math.random() * 900 + 100),
        socketId: socket.id,
        isHost: isFirst,
        authMethod: userData.authMethod || 'email',
        color: assignedColor,
        avatar: userData.avatar || null,
        bg_color: userData.bg_color || '#0a0a0c'
      };

      cinemaState.users[user.id] = user;
      cinemaState.scores[user.id] = cinemaState.scores[user.id] || 0;
      
      console.log(`Usuário conectado com cor única ${assignedColor}: ${user.name} (${user.id})`);
    }

    // Emitir atualizações
    io.emit('updateUsers', Object.values(cinemaState.users));
    socket.emit('syncState', getClientState());
  });

  // Host inicia a partida
  socket.on('startGame', (data) => {
    const user = Object.values(cinemaState.users).find(u => u.socketId === socket.id);
    if (!user || !user.isHost) return;

    if (cinemaState.status !== 'LOBBY') return;
    if (cinemaState.playlist.length === 0) {
      return socket.emit('errorMsg', 'Adicione pelo menos um vídeo para iniciar o cinema!');
    }

    // Define o modo de jogo
    cinemaState.gameMode = (data && data.mode === 'ASSISTIR') ? 'ASSISTIR' : 'PALPITAR';

    // Embaralha os vídeos para rodar em ordem aleatória
    shuffleArray(cinemaState.playlist);

    cinemaState.status = 'PLAYING';
    cinemaState.currentVideo = cinemaState.playlist.shift();

    io.emit('stateChange', getClientState());
    io.emit('playVideo', {
      currentVideo: { id: cinemaState.currentVideo.id, url: cinemaState.currentVideo.url }
    });
  });

  // Adição de vídeos à Fila (LOBBY ou PLAYING no modo ASSISTIR)
  socket.on('addVideo', async (url) => {
    const isAssistirPlaying = cinemaState.status === 'PLAYING' && cinemaState.gameMode === 'ASSISTIR';
    if (cinemaState.status !== 'LOBBY' && !isAssistirPlaying) {
      return socket.emit('errorMsg', 'O jogo já começou! Novos vídeos são bloqueados.');
    }

    const user = Object.values(cinemaState.users).find(u => u.socketId === socket.id);
    if (!user) return;

    // Contar vídeos do usuário na playlist
    const userVideos = cinemaState.playlist.filter(v => v.addedBy === user.id).length;
    if (userVideos >= 5) {
      return socket.emit('errorMsg', 'Você já adicionou o limite máximo de 5 vídeos!');
    }

    const cleanedUrl = extractRealUrl(url);
    const resolvedUrl = await resolveUrlRedirects(cleanedUrl);
    const normalizedUrl = normalizeUrl(resolvedUrl);

    // Validar se o link é duplicado (compara formatos normalizados de todos os vídeos da fila)
    const isDuplicate = cinemaState.playlist.some(v => normalizeUrl(v.url) === normalizedUrl);
    if (isDuplicate) {
      return socket.emit('errorMsg', 'Este link de vídeo já está na fila!');
    }

    const videoEntry = {
      id: crypto.randomUUID(),
      url: normalizedUrl, // Salva o link já em formato consistente normalizado
      addedBy: user.id,
      played: false
    };

    cinemaState.playlist.push(videoEntry);
    cinemaState.videoAuthorsInRound.add(user.id);

    io.emit('updatePlaylist', cinemaState.playlist.map(v => ({ id: v.id })));
    io.emit('stateChange', getClientState());
  });

  // Fim natural ou manual do vídeo (Apenas o Host pode pular/terminar no backend)
  socket.on('videoEnded', () => {
    const user = Object.values(cinemaState.users).find(u => u.socketId === socket.id);
    if (!user) return;

    // Regra de segurança TK-02: Apenas o Host pode acionar o fim do vídeo
    if (!user.isHost) {
      return socket.emit('errorMsg', 'Apenas o Host tem permissão para pular ou encerrar vídeos.');
    }

    if (cinemaState.status === 'PLAYING' && cinemaState.currentVideo) {
      if (cinemaState.gameMode === 'ASSISTIR') {
        cinemaState.currentVideo.played = true;

        if (cinemaState.playlist.length > 0) {
          cinemaState.status = 'PLAYING';
          cinemaState.currentVideo = cinemaState.playlist.shift();

          io.emit('playVideo', {
            currentVideo: { id: cinemaState.currentVideo.id, url: cinemaState.currentVideo.url }
          });
          io.emit('stateChange', getClientState());
        } else {
          // Fila encerrada -> Retorna ao Lobby
          cinemaState.status = 'LOBBY';
          cinemaState.currentVideo = null;
          cinemaState.playlist = [];
          cinemaState.videoAuthorsInRound.clear();

          io.emit('newMessage', {
            user: 'Sistema',
            color: '#ff0050',
            text: 'Fila de reprodução finalizada! Retornando ao Lobby.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
          io.emit('stateChange', getClientState());
        }
      } else {
        startVoting();
      }
    }
  });

  // Cadastro de Votos
  socket.on('castVote', (votedUserId) => {
    if (cinemaState.status !== 'VOTING' || !cinemaState.voting.active) return;

    const user = Object.values(cinemaState.users).find(u => u.socketId === socket.id);
    if (!user) return;

    // Impedir voto duplo
    if (cinemaState.voting.votesTrack[user.id]) {
      return socket.emit('errorMsg', 'Você já registrou seu voto nesta rodada!');
    }

    // Impedir votação em si mesmo (Autor do vídeo fica bloqueado)
    if (user.id === cinemaState.currentVideo.addedBy) {
      return socket.emit('errorMsg', 'Você não pode votar no seu próprio vídeo!');
    }

    // Registrar o palpite
    cinemaState.voting.votesTrack[user.id] = votedUserId;

    // Notificar progresso de votos sem revelar em quem votou
    checkVotingCompletion();
    io.emit('stateChange', getClientState());
  });

  // Módulo de Chat
  socket.on('sendMessage', (text) => {
    const user = Object.values(cinemaState.users).find(u => u.socketId === socket.id);
    if (!user) return;

    const trimmedText = text.trim();
    if (!trimmedText || trimmedText.length > 350) return;

    const message = {
      userId: user.id,
      user: user.name,
      color: user.color || '#ff0050',
      avatar: user.avatar || null,
      text: trimmedText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    cinemaState.chatHistory.push(message);
    if (cinemaState.chatHistory.length > 50) {
      cinemaState.chatHistory.shift();
    }

    io.emit('newMessage', message);
  });

  // Disparo de Reação Flutuante no Chat
  socket.on('sendReaction', (emoji) => {
    io.emit('newReaction', emoji);
  });

  // Módulo de Atualização de Perfil (Nome, Avatar e Cor de Fundo)
  socket.on('updateProfile', async (data) => {
    const user = Object.values(cinemaState.users).find(u => u.socketId === socket.id);
    if (!user) return;

    if (data.name && data.name.trim()) {
      user.name = data.name.trim();
    }
    user.avatar = data.avatar || null;
    user.bg_color = data.bg_color || '#0a0a0c';

    // Persistir: Supabase (online) ou SQLite (offline)
    if (supabaseEnabled && supabase) {
      try {
        const { error } = await supabase
          .from('users')
          .upsert({ 
            id: user.id, 
            name: user.name, 
            avatar: user.avatar, 
            bg_color: data.bg_color || '#0a0a0c',
            created_at: new Date().toISOString()
          });
        
        if (error) {
          console.error('Erro de banco ao atualizar/salvar perfil no Supabase:', error.message || error);
        }
      } catch (err) {
        console.error('Erro inesperado ao atualizar perfil no Supabase:', err.message);
      }
    } else if (offlineDb) {
      try {
        const update = offlineDb.prepare('UPDATE users SET name = ?, avatar = ?, bg_color = ? WHERE id = ?');
        update.run(user.name, user.avatar, data.bg_color || '#0a0a0c', user.id);
      } catch (err) {
        console.error('Erro ao atualizar usuário no SQLite:', err);
      }
    }

    // Atualizar avatares do chat histórico pelo ID do usuário
    cinemaState.chatHistory.forEach(msg => {
      if (msg.userId === user.id) {
        msg.avatar = user.avatar;
        msg.user = user.name;
      }
    });

    const loggedAvatar = (user.avatar && user.avatar.length > 60)
      ? `${user.avatar.substring(0, 30)}... [Base64 Cortado]`
      : user.avatar;
    console.log(`Usuário ${user.id} atualizou perfil: Nome = ${user.name}, Avatar = ${loggedAvatar}, Cor = ${data.bg_color || '#0a0a0c'}`);

    io.emit('updateUsers', Object.values(cinemaState.users));
    io.emit('stateChange', getClientState());
  });

  // Reiniciar jogo (Só Host pode resetar em PODIUM)
  socket.on('resetGame', () => {
    const user = Object.values(cinemaState.users).find(u => u.socketId === socket.id);
    if (!user || !user.isHost) return;

    if (cinemaState.status !== 'PODIUM') return;

    // Limpar estados
    cinemaState.status = 'LOBBY';
    cinemaState.gameMode = 'PALPITAR';
    cinemaState.playlist = [];
    cinemaState.currentVideo = null;
    cinemaState.videoAuthorsInRound.clear();
    cinemaState.chatHistory = [];
    cinemaState.voting = {
      active: false,
      timer: 15,
      votesTrack: {},
      correctUserId: null
    };

    // Zerar pontuação de todos
    Object.keys(cinemaState.scores).forEach(userId => {
      cinemaState.scores[userId] = 0;
    });

    io.emit('gameReset');
    io.emit('stateChange', getClientState());
  });

  // Desconexão do Socket
  socket.on('disconnect', () => {
    console.log('User desconectou:', socket.id);

    const disconnectedUser = Object.values(cinemaState.users).find(u => u.socketId === socket.id);
    if (disconnectedUser) {
      const wasHost = disconnectedUser.isHost;
      
      // Remover dos usuários ativos
      delete cinemaState.users[disconnectedUser.id];

      // Passar Host se aplicável (TK-05)
      if (wasHost) {
        const remainingUsers = Object.values(cinemaState.users);
        if (remainingUsers.length > 0) {
          const nextHost = remainingUsers[0];
          nextHost.isHost = true;
          io.emit('newMessage', {
            user: 'Sistema',
            color: '#ff0050',
            text: `${nextHost.name} assumiu a liderança da sala como Host!`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
        }
      }

      // Reavaliar se todos votaram
      checkVotingCompletion();

      io.emit('updateUsers', Object.values(cinemaState.users));
      io.emit('stateChange', getClientState());
    }
  });

  // Função interna para iniciar cronômetro e fase de votação
  function startVoting() {
    cinemaState.status = 'VOTING';
    cinemaState.voting = {
      active: true,
      timer: 15,
      votesTrack: {},
      correctUserId: cinemaState.currentVideo.addedBy
    };

    io.emit('stateChange', getClientState());
    io.emit('startVoting', {
      timer: 15,
      authorId: cinemaState.currentVideo.addedBy,
      options: getVotingOptions()
    });

    if (votingInterval) clearInterval(votingInterval);
    votingInterval = setInterval(() => {
      cinemaState.voting.timer--;
      io.emit('votingTick', cinemaState.voting.timer);

      if (cinemaState.voting.timer <= 0) {
        clearInterval(votingInterval);
        votingInterval = null;
        endVoting();
      }
    }, 1000);
  }

  // Função interna para contabilizar e ir para o próximo estado
  function endVoting() {
    if (votingInterval) {
      clearInterval(votingInterval);
      votingInterval = null;
    }

    cinemaState.voting.active = false;

    // Contabilização de Pontuação Secreta (TK-04)
    const authorId = cinemaState.currentVideo.addedBy;
    let wrongGuessesCount = 0;

    for (const voterId in cinemaState.voting.votesTrack) {
      const votedForId = cinemaState.voting.votesTrack[voterId];
      if (voterId === authorId) continue; // Autor não vota

      if (votedForId === authorId) {
        // Acerto de palpite
        cinemaState.scores[voterId] = (cinemaState.scores[voterId] || 0) + 1;
      } else {
        // Erro
        wrongGuessesCount++;
      }
    }

    // Bônus de Blefe para o Autor (+1 por erro dos amigos)
    if (wrongGuessesCount > 0) {
      cinemaState.scores[authorId] = (cinemaState.scores[authorId] || 0) + wrongGuessesCount;
    }

    cinemaState.currentVideo.played = true;

    // Avançar
    if (cinemaState.playlist.length > 0) {
      cinemaState.status = 'PLAYING';
      cinemaState.currentVideo = cinemaState.playlist.shift();

      io.emit('playVideo', {
        currentVideo: { id: cinemaState.currentVideo.id, url: cinemaState.currentVideo.url }
      });
      io.emit('stateChange', getClientState());
    } else {
      // Fim do Cinema -> Ir para PODIUM
      cinemaState.status = 'PODIUM';
      cinemaState.currentVideo = null;

      // Ordenar ranking final
      const sortedRanking = Object.values(cinemaState.users).map(u => ({
        id: u.id,
        name: u.name,
        points: cinemaState.scores[u.id] || 0
      })).sort((a, b) => b.points - a.points);

      saveRankingToDb(sortedRanking);

      io.emit('gameFinished', sortedRanking);
      io.emit('stateChange', getClientState());
    }
  }

  // Função interna para verificar se todos votaram
  function checkVotingCompletion() {
    if (!cinemaState.voting.active || !cinemaState.currentVideo) return;

    const authorId = cinemaState.currentVideo.addedBy;
    const activeUsers = Object.values(cinemaState.users);
    
    // Eleitores elegíveis (Todos menos o dono do vídeo)
    const eligibleVoters = activeUsers.filter(u => u.id !== authorId);
    const eligibleCount = eligibleVoters.length;

    // Votos recebidos dos eleitores elegíveis e conectados
    const votesCount = Object.keys(cinemaState.voting.votesTrack).filter(voterId => 
      cinemaState.users[voterId] && voterId !== authorId
    ).length;

    if (eligibleCount === 0 || votesCount >= eligibleCount) {
      endVoting();
    } else {
      io.emit('votingProgress', {
        votesReceived: votesCount,
        totalUsers: eligibleCount
      });
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Cinema das Guria rodando em http://localhost:${PORT} (${runtimeMode})`);
});
