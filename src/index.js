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
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());
app.use(cookieParser());

// Banco de Dados Offline
let offlineDb = null;
if (!supabaseEnabled) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  offlineDb = new Database(dbPath);
  applySchema(offlineDb);
}

// Supabase Client
const supabase = supabaseEnabled 
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : null;

// Estado global do Cinema
let cinemaState = {
  currentVideo: null,
  playlist: [],
  users: {}, // { socketId: { id, name, avatar, color } }
  voting: {
    active: false,
    results: {},
    correctUserId: null,
    votesReceived: 0
  }
};

// Servir variáveis de ambiente para o frontend
app.get('/env.js', (req, res) => {
  const publicConfig = {
    APP_MODE: runtimeMode,
    SUPABASE_URL: supabaseEnabled ? process.env.SUPABASE_URL : '',
    SUPABASE_ANON_KEY: supabaseEnabled ? process.env.SUPABASE_ANON_KEY : '',
    TIKTOK_LOGIN_ENABLED: true
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
      display_name: 'Usuário Simulado',
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

// Socket.io Logic
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (userData) => {
    cinemaState.users[socket.id] = {
      ...userData,
      socketId: socket.id,
      color: userData.color || `#${Math.floor(Math.random()*16777215).toString(16)}`
    };
    io.emit('updateUsers', Object.values(cinemaState.users));
    socket.emit('syncState', cinemaState);
  });

  socket.on('addVideo', (url) => {
    const user = cinemaState.users[socket.id];
    if (!user) return;

    const videoEntry = {
      id: crypto.randomUUID(),
      url: url,
      addedBy: user.id,
      addedByName: user.name,
      addedByAvatar: user.avatar
    };

    if (!cinemaState.currentVideo && !cinemaState.voting.active) {
      cinemaState.currentVideo = videoEntry;
      io.emit('playVideo', cinemaState.currentVideo);
    } else {
      cinemaState.playlist.push(videoEntry);
      io.emit('updatePlaylist', cinemaState.playlist);
    }
  });

  socket.on('videoEnded', () => {
    if (cinemaState.currentVideo && !cinemaState.voting.active) {
      startVoting();
    }
  });

  socket.on('castVote', (votedUserId) => {
    if (!cinemaState.voting.active) return;
    
    cinemaState.voting.results[votedUserId] = (cinemaState.voting.results[votedUserId] || 0) + 1;
    cinemaState.voting.votesReceived++;

    const totalUsers = Object.keys(cinemaState.users).length;
    if (cinemaState.voting.votesReceived >= totalUsers) {
      endVoting();
    } else {
      io.emit('votingProgress', {
        votesReceived: cinemaState.voting.votesReceived,
        totalUsers: totalUsers
      });
    }
  });

  socket.on('sendMessage', (text) => {
    const user = cinemaState.users[socket.id];
    if (!user) return;

    io.emit('newMessage', {
      user: user.name,
      color: user.color,
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  socket.on('disconnect', () => {
    delete cinemaState.users[socket.id];
    io.emit('updateUsers', Object.values(cinemaState.users));
  });

  function startVoting() {
    cinemaState.voting = {
      active: true,
      results: {},
      correctUserId: cinemaState.currentVideo.addedBy,
      votesReceived: 0
    };
    io.emit('startVoting', {
      users: Object.values(cinemaState.users).map(u => ({ id: u.id, name: u.name, avatar: u.avatar }))
    });
  }

  function endVoting() {
    io.emit('revealResult', {
      correctUserId: cinemaState.voting.correctUserId,
      correctUserName: cinemaState.currentVideo.addedByName,
      results: cinemaState.voting.results
    });

    cinemaState.voting.active = false;
    
    setTimeout(() => {
      if (cinemaState.playlist.length > 0) {
        cinemaState.currentVideo = cinemaState.playlist.shift();
        io.emit('playVideo', cinemaState.currentVideo);
        io.emit('updatePlaylist', cinemaState.playlist);
      } else {
        cinemaState.currentVideo = null;
        io.emit('stopVideo');
      }
    }, 5000);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TikTok Cinema rodando em http://localhost:${PORT} (${runtimeMode})`);
});
