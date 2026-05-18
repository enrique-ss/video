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
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || 'MOCK_KEY';
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || 'MOCK_SECRET';
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/auth/tiktok/callback`;

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
const supabase = supabaseEnabled 
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : null;

// Máquina de Estados Global - TikTok Cinema (Estilo Gartic Phone)
let cinemaState = {
  status: 'LOBBY', // LOBBY, PLAYING, VOTING, PODIUM
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
      INSERT OR REPLACE INTO users (id, email, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `);

    sortedRank.forEach((player) => {
      insertUser.run(player.id, null, `points:${player.points}`, createdAt);
    });

    console.log('Pontuações da rodada salvas no banco de dados SQLite.');
  } catch (err) {
    console.error('Falha ao gravar no SQLite:', err.message);
  }
}

// API de Registro de Usuários no Banco de Dados SQLite (ou Supabase no futuro)
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios!' });
  }

  const userId = 'usr_' + Math.random().toString(36).substr(2, 9);
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  const createdAt = new Date().toISOString();

  if (!offlineDb) {
    return res.status(500).json({ error: 'Banco de dados não configurado!' });
  }

  try {
    const insert = offlineDb.prepare(`
      INSERT INTO users (id, name, email, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    insert.run(userId, name, email.toLowerCase(), passwordHash, createdAt);
    
    return res.status(201).json({
      success: true,
      user: { id: userId, name, email: email.toLowerCase() }
    });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Este e-mail já está em uso!' });
    }
    console.error('Erro no registro SQLite:', err);
    return res.status(500).json({ error: 'Falha interna ao registrar usuário.' });
  }
});

// API de Login de Usuários no Banco de Dados
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Preencha e-mail e senha!' });
  }

  if (!offlineDb) {
    return res.status(500).json({ error: 'Banco de dados não configurado!' });
  }

  try {
    const user = offlineDb.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos!' });
    }

    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    if (user.password_hash !== passwordHash) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos!' });
    }

    return res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('Erro no login SQLite:', err);
    return res.status(500).json({ error: 'Falha interna ao realizar login.' });
  }
});

// Servir variáveis de ambiente para o frontend
app.get('/env.js', (req, res) => {
  const publicConfig = {
    APP_MODE: runtimeMode,
    SUPABASE_URL: supabaseEnabled ? process.env.SUPABASE_URL : '',
    SUPABASE_ANON_KEY: supabaseEnabled ? process.env.SUPABASE_ANON_KEY : '',
    TIKTOK_LOGIN_ENABLED: false
  };

  res.type('application/javascript');
  res.send(`window.ENV = ${JSON.stringify(publicConfig)};`);
});

// Rotas de Autenticação TikTok
app.get('/auth/tiktok', (req, res) => {
  if (TIKTOK_CLIENT_KEY === 'MOCK_KEY') {
    const mockCode = 'mock_auth_code_' + Math.random().toString(36).substring(7);
    return res.redirect(`/auth/tiktok/callback?code=${mockCode}`);
  }

  const csrfState = crypto.randomBytes(16).toString('hex');
  res.cookie('csrfState', csrfState, { httpOnly: true });

  let url = 'https://www.tiktok.com/v2/auth/authorize/';
  url += `?client_key=${TIKTOK_CLIENT_KEY}`;
  url += '&scope=user.info.basic,video.list';
  url += '&response_type=code';
  url += `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  url += `&state=${csrfState}`;

  res.redirect(url);
});

app.get('/auth/tiktok/callback', async (req, res) => {
  const { code } = req.query;

  if (TIKTOK_CLIENT_KEY === 'MOCK_KEY') {
    const mockUser = {
      open_id: 'tiktok_' + Math.random().toString(36).substring(7),
      display_name: 'TikTok Fan ' + Math.floor(Math.random() * 900 + 100),
      avatar_url: 'https://placehold.co/100x100?text=TK'
    };
    return res.send(`
      <script>
        window.opener.postMessage({ type: 'tiktok_login', user: ${JSON.stringify(mockUser)} }, '*');
        window.close();
      </script>
    `);
  }

  try {
    const tokenResponse = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', 
      new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token } = tokenResponse.data;

    const userResponse = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
      params: { fields: 'open_id,display_name,avatar_url' },
      headers: { 'Authorization': `Bearer ${access_token}` }
    });

    const userData = userResponse.data.data.user;

    res.send(`
      <script>
        window.opener.postMessage({ type: 'tiktok_login', user: ${JSON.stringify(userData)} }, '*');
        window.close();
      </script>
    `);
  } catch (error) {
    console.error('Erro no Login TikTok:', error.response?.data || error.message);
    res.status(500).send('Falha na autenticação com o TikTok.');
  }
});

app.get('/api/tiktok/liked-videos', (req, res) => {
  const sampleVideos = [
    { url: 'https://www.tiktok.com/@khaby.lame/video/7123456789012345678', title: 'Khaby Lame funny' },
    { url: 'https://www.tiktok.com/@zachking/video/7234567890123456789', title: 'Zach King Magic' },
    { url: 'https://www.tiktok.com/@bellapoarch/video/7345678901234567890', title: 'Bella Poarch M to the B' },
    { url: 'https://www.tiktok.com/@charlidamelio/video/7456789012345678901', title: 'Charli Dance' }
  ];
  const shuffled = sampleVideos.sort(() => 0.5 - Math.random());
  res.json(shuffled.slice(0, 3));
});

// Socket.io Logic - TikTok Cinema
io.on('connection', (socket) => {
  // Limitação de Conexão - Máximo 20 usuários
  const activeUserCount = Object.keys(cinemaState.users).length;
  if (activeUserCount >= 20) {
    socket.emit('errorMsg', 'A sala está cheia (máximo de 20 usuários)!');
    socket.disconnect(true);
    return;
  }

  console.log('User conectado no socket:', socket.id);

  // Registro/Join do Usuário
  socket.on('join', (userData) => {
    let user = Object.values(cinemaState.users).find(u => u.id === userData.id);

    if (user) {
      // Reconexão de usuário existente
      user.socketId = socket.id;
      console.log(`Usuário ${user.name} reconectou sob socket ${socket.id}`);
    } else {
      // Criação de novo usuário
      const isFirst = Object.keys(cinemaState.users).length === 0;
      user = {
        id: userData.id || crypto.randomUUID(),
        name: userData.name || 'Convidado ' + Math.floor(Math.random() * 900 + 100),
        socketId: socket.id,
        isHost: isFirst,
        authMethod: userData.authMethod || 'guest',
        tiktokHandle: userData.tiktokHandle || '',
        color: userData.color || `#${Math.floor(Math.random()*16777215).toString(16)}`
      };

      cinemaState.users[user.id] = user;
      cinemaState.scores[user.id] = cinemaState.scores[user.id] || 0;
      
      console.log(`Novo usuário registrado: ${user.name} (${user.id})`);
    }

    // Emitir atualizações
    io.emit('updateUsers', Object.values(cinemaState.users));
    socket.emit('syncState', getClientState());
  });

  // Host inicia a partida
  socket.on('startGame', () => {
    const user = Object.values(cinemaState.users).find(u => u.socketId === socket.id);
    if (!user || !user.isHost) return;

    if (cinemaState.status !== 'LOBBY') return;
    if (cinemaState.playlist.length === 0) {
      return socket.emit('errorMsg', 'Adicione pelo menos um vídeo para iniciar o cinema!');
    }

    cinemaState.status = 'PLAYING';
    cinemaState.currentVideo = cinemaState.playlist.shift();

    io.emit('stateChange', getClientState());
    io.emit('playVideo', {
      currentVideo: { id: cinemaState.currentVideo.id, url: cinemaState.currentVideo.url }
    });
  });

  // Adição de vídeos à Fila (LOBBY apenas, limite de 5 vídeos por usuário)
  socket.on('addVideo', (url) => {
    if (cinemaState.status !== 'LOBBY') {
      return socket.emit('errorMsg', 'O jogo já começou! Novos vídeos são bloqueados.');
    }

    const user = Object.values(cinemaState.users).find(u => u.socketId === socket.id);
    if (!user) return;

    // Contar vídeos do usuário na playlist
    const userVideos = cinemaState.playlist.filter(v => v.addedBy === user.id).length;
    if (userVideos >= 5) {
      return socket.emit('errorMsg', 'Você já adicionou o limite máximo de 5 vídeos!');
    }

    // Validar se o link é duplicado
    const isDuplicate = cinemaState.playlist.some(v => v.url === url);
    if (isDuplicate) {
      return socket.emit('errorMsg', 'Este link de vídeo já está na fila!');
    }

    const videoEntry = {
      id: crypto.randomUUID(),
      url: url,
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
      startVoting();
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
    if (!trimmedText || trimmedText.length > 200) return;

    const message = {
      user: user.name,
      color: user.color || '#ff0050',
      text: trimmedText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    cinemaState.chatHistory.push(message);
    if (cinemaState.chatHistory.length > 50) {
      cinemaState.chatHistory.shift();
    }

    io.emit('newMessage', message);
  });

  // Reiniciar jogo (Só Host pode resetar em PODIUM)
  socket.on('resetGame', () => {
    const user = Object.values(cinemaState.users).find(u => u.socketId === socket.id);
    if (!user || !user.isHost) return;

    if (cinemaState.status !== 'PODIUM') return;

    // Limpar estados
    cinemaState.status = 'LOBBY';
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
  console.log(`TikTok Cinema rodando em http://localhost:${PORT} (${runtimeMode})`);
});
