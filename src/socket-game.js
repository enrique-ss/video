const crypto = require('crypto');
const db = require('./db');
const { isOnline, isOffline, PREDEFINED_COLORS } = require('./config');
const { extractRealUrl, resolveUrlRedirects, normalizeUrl } = require('./video-utils');
const {
  cinemaState,
  getClientState,
  getVotingOptions,
  shuffleArray,
  saveRankingToDb,
  timers,
  clearTimers
} = require('./game-state');

function findSocketUser(socketId) {
  return Object.values(cinemaState.users).find((u) => u.socketId === socketId);
}

function mountSocketGame(io) {
  io.on('connection', (socket) => {
    console.log('Socket conectado:', socket.id);

    socket.on('join', async (userData) => {
      if (!userData?.id) return;

      const alreadyIn = cinemaState.users[userData.id];
      const count = Object.keys(cinemaState.users).length;
      if (!alreadyIn && count >= 15) {
        socket.emit('errorMsg', 'A sala está cheia (máximo 15 usuários)!');
        return socket.disconnect(true);
      }

      let profile = null;
      if (isOnline) {
        if (!userData.token) {
          socket.emit('forceLogout', 'Faça login novamente.');
          return;
        }
        profile = await db.validateOnlineSession(userData.id, userData.token);
        if (!profile) {
          socket.emit('forceLogout', 'Sessão inválida ou expirada.');
          return;
        }
      } else if (isOffline) {
        profile = await db.findUserById(userData.id);
        if (!profile) {
          socket.emit('forceLogout', 'Conta não encontrada.');
          return;
        }
      }

      const name = profile?.name || userData.name || 'Convidado';
      const avatar = profile?.avatar ?? null;
      const bg_color = profile?.bg_color || db.DEFAULT_BG;

      let user = cinemaState.users[userData.id];
      if (user) {
        user.socketId = socket.id;
        user.name = name;
        user.avatar = avatar;
        user.bg_color = bg_color;
        user.token = userData.token || user.token;
      } else {
        const usedColors = Object.values(cinemaState.users).map((u) => u.color);
        const pool = PREDEFINED_COLORS.filter((c) => !usedColors.includes(c));
        const color = pool.length
          ? pool[Math.floor(Math.random() * pool.length)]
          : `#${Math.floor(Math.random() * 16777215).toString(16)}`;

        user = {
          id: userData.id,
          name,
          socketId: socket.id,
          isHost: count === 0,
          color,
          avatar,
          bg_color,
          token: userData.token || null
        };
        cinemaState.users[user.id] = user;
        cinemaState.scores[user.id] = cinemaState.scores[user.id] || 0;
      }

      io.emit('updateUsers', Object.values(cinemaState.users));
      socket.emit('syncState', getClientState());
    });

    socket.on('startGame', (data) => {
      const user = findSocketUser(socket.id);
      if (!user?.isHost || cinemaState.status !== 'LOBBY') return;
      if (!cinemaState.playlist.length) {
        return socket.emit('errorMsg', 'Adicione pelo menos um vídeo!');
      }
      cinemaState.gameMode = data?.mode === 'ASSISTIR' ? 'ASSISTIR' : 'PALPITAR';
      shuffleArray(cinemaState.playlist);
      cinemaState.status = 'PLAYING';
      cinemaState.currentVideo = cinemaState.playlist.shift();
      io.emit('stateChange', getClientState());
      io.emit('playVideo', {
        currentVideo: { id: cinemaState.currentVideo.id, url: cinemaState.currentVideo.url }
      });
    });

    socket.on('addVideo', async (url) => {
      const playingAssistir = cinemaState.status === 'PLAYING' && cinemaState.gameMode === 'ASSISTIR';
      if (cinemaState.status !== 'LOBBY' && !playingAssistir) {
        return socket.emit('errorMsg', 'O jogo já começou!');
      }
      const user = findSocketUser(socket.id);
      if (!user) return;
      if (cinemaState.playlist.filter((v) => v.addedBy === user.id).length >= 5) {
        return socket.emit('errorMsg', 'Limite de 5 vídeos por pessoa!');
      }

      const cleaned = extractRealUrl(url);
      const resolved = await resolveUrlRedirects(cleaned);
      const normalized = normalizeUrl(resolved);
      if (cinemaState.playlist.some((v) => normalizeUrl(v.url) === normalized)) {
        return socket.emit('errorMsg', 'Este vídeo já está na fila!');
      }

      cinemaState.playlist.push({
        id: crypto.randomUUID(),
        url: normalized,
        addedBy: user.id,
        played: false
      });
      cinemaState.videoAuthorsInRound.add(user.id);
      io.emit('updatePlaylist', cinemaState.playlist.map((v) => ({ id: v.id })));
      io.emit('stateChange', getClientState());
    });

    socket.on('videoEnded', () => {
      const user = findSocketUser(socket.id);
      if (!user?.isHost || cinemaState.status !== 'PLAYING' || !cinemaState.currentVideo) return;

      if (cinemaState.gameMode === 'ASSISTIR') {
        cinemaState.currentVideo.played = true;
        if (cinemaState.playlist.length) {
          cinemaState.currentVideo = cinemaState.playlist.shift();
          io.emit('playVideo', {
            currentVideo: { id: cinemaState.currentVideo.id, url: cinemaState.currentVideo.url }
          });
        } else {
          cinemaState.status = 'LOBBY';
          cinemaState.currentVideo = null;
          cinemaState.playlist = [];
          cinemaState.videoAuthorsInRound.clear();
        }
        io.emit('stateChange', getClientState());
      } else {
        startVoting(io);
      }
    });

    socket.on('castVote', (votedUserId) => {
      if (cinemaState.status !== 'VOTING' || !cinemaState.voting.active) return;
      const user = findSocketUser(socket.id);
      if (!user || cinemaState.voting.votesTrack[user.id]) return;
      if (user.id === cinemaState.currentVideo.addedBy) {
        return socket.emit('errorMsg', 'Você não pode votar no seu próprio vídeo!');
      }
      cinemaState.voting.votesTrack[user.id] = votedUserId;
      emitVotingProgress(io);
      io.emit('stateChange', getClientState());
    });

    socket.on('sendMessage', (text) => {
      const user = findSocketUser(socket.id);
      if (!user) return;
      const trimmed = String(text || '').trim();
      if (!trimmed || trimmed.length > 350) return;
      const message = {
        userId: user.id,
        user: user.name,
        color: user.color,
        avatar: user.avatar,
        text: trimmed,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      cinemaState.chatHistory.push(message);
      if (cinemaState.chatHistory.length > 50) cinemaState.chatHistory.shift();
      io.emit('newMessage', message);
    });

    socket.on('sendReaction', (emoji) => io.emit('newReaction', emoji));

    socket.on('updateProfile', async (data) => {
      const user = findSocketUser(socket.id);
      if (!user) {
        return socket.emit('profileError', 'Aguarde a conexão com a sala.');
      }
      const auth = {
        id: user.id,
        token: user.token,
        email: null,
        name: user.name
      };
      const result = await db.updateProfile(auth, {
        name: data?.name ?? user.name,
        avatar: data?.avatar !== undefined ? data.avatar : user.avatar,
        bg_color: data?.bg_color ?? user.bg_color
      });
      if (!result.ok) return socket.emit('profileError', result.error);

      const profile = await db.findUserById(user.id);
      if (profile) {
        user.name = profile.name;
        user.avatar = profile.avatar || null;
        user.bg_color = profile.bg_color || db.DEFAULT_BG;
      }
      cinemaState.chatHistory.forEach((msg) => {
        if (msg.userId === user.id) {
          msg.avatar = user.avatar;
          msg.user = user.name;
        }
      });
      socket.emit('profileUpdated', {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        bg_color: user.bg_color
      });
      io.emit('updateUsers', Object.values(cinemaState.users));
      io.emit('stateChange', getClientState());
    });

    socket.on('resetGame', () => {
      const user = findSocketUser(socket.id);
      if (user?.isHost && cinemaState.status === 'PODIUM') autoResetGame(io);
    });

    socket.on('disconnect', () => {
      const user = findSocketUser(socket.id);
      if (!user) return;
      const wasHost = user.isHost;
      delete cinemaState.users[user.id];
      if (wasHost) {
        const remaining = Object.values(cinemaState.users);
        if (remaining.length) {
          remaining[0].isHost = true;
          io.emit('newMessage', {
            user: 'Sistema',
            color: '#ff0050',
            text: `${remaining[0].name} assumiu a liderança da sala!`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
        }
      }
      emitVotingProgress(io);
      io.emit('updateUsers', Object.values(cinemaState.users));
      io.emit('stateChange', getClientState());
    });
  });

  function autoResetGame(io) {
    clearTimers();
    cinemaState.status = 'LOBBY';
    cinemaState.gameMode = 'PALPITAR';
    cinemaState.playlist = [];
    cinemaState.currentVideo = null;
    cinemaState.videoAuthorsInRound.clear();
    cinemaState.chatHistory = [];
    cinemaState.voting = { active: false, timer: 15, votesTrack: {}, correctUserId: null };
    Object.keys(cinemaState.scores).forEach((id) => { cinemaState.scores[id] = 0; });
    io.emit('gameReset');
    io.emit('stateChange', getClientState());
  }

  function emitVotingProgress(io) {
    if (!cinemaState.voting.active || !cinemaState.currentVideo) return;
    const authorId = cinemaState.currentVideo.addedBy;
    const eligible = Object.values(cinemaState.users).filter((u) => u.id !== authorId);
    const votes = Object.keys(cinemaState.voting.votesTrack).filter(
      (id) => cinemaState.users[id] && id !== authorId
    ).length;
    io.emit('votingProgress', { votesReceived: votes, totalUsers: eligible.length });
  }

  function startVoting(io) {
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
    if (timers.voting) clearInterval(timers.voting);
    timers.voting = setInterval(() => {
      cinemaState.voting.timer--;
      io.emit('votingTick', cinemaState.voting.timer);
      if (cinemaState.voting.timer <= 0) {
        clearInterval(timers.voting);
        timers.voting = null;
        endVoting(io);
      }
    }, 1000);
  }

  function endVoting(io) {
    cinemaState.voting.active = false;
    const authorId = cinemaState.currentVideo.addedBy;
    let wrong = 0;
    for (const voterId in cinemaState.voting.votesTrack) {
      if (voterId === authorId) continue;
      if (cinemaState.voting.votesTrack[voterId] === authorId) {
        cinemaState.scores[voterId] = (cinemaState.scores[voterId] || 0) + 1;
      } else {
        wrong++;
      }
    }
    if (wrong > 0) cinemaState.scores[authorId] = (cinemaState.scores[authorId] || 0) + wrong;
    cinemaState.currentVideo.played = true;

    if (cinemaState.playlist.length) {
      cinemaState.status = 'PLAYING';
      cinemaState.currentVideo = cinemaState.playlist.shift();
      io.emit('playVideo', {
        currentVideo: { id: cinemaState.currentVideo.id, url: cinemaState.currentVideo.url }
      });
      io.emit('stateChange', getClientState());
      return;
    }

    cinemaState.status = 'PODIUM';
    cinemaState.currentVideo = null;
    const ranking = Object.values(cinemaState.users)
      .map((u) => ({ id: u.id, name: u.name, points: cinemaState.scores[u.id] || 0 }))
      .sort((a, b) => b.points - a.points);
    saveRankingToDb(ranking);
    io.emit('gameFinished', ranking);
    io.emit('stateChange', getClientState());

    let t = 15;
    io.emit('podiumTick', t);
    if (timers.podium) clearInterval(timers.podium);
    timers.podium = setInterval(() => {
      t--;
      io.emit('podiumTick', t);
      if (t <= 0) {
        clearInterval(timers.podium);
        timers.podium = null;
        autoResetGame(io);
      }
    }, 1000);
  }
}

module.exports = { mountSocketGame };
