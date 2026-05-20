const { sqlite } = require('./config');

const cinemaState = {
  status: 'LOBBY',
  gameMode: 'PALPITAR',
  users: {},
  playlist: [],
  currentVideo: null,
  chatHistory: [],
  scores: {},
  videoAuthorsInRound: new Set(),
  voting: { active: false, timer: 15, votesTrack: {}, correctUserId: null }
};

const timers = { voting: null, podium: null };

function getVotingOptions() {
  const options = [];
  cinemaState.videoAuthorsInRound.forEach((userId) => {
    const user = cinemaState.users[userId];
    if (user) options.push({ id: user.id, name: user.name });
  });
  return options;
}

function getClientState() {
  return {
    status: cinemaState.status,
    gameMode: cinemaState.gameMode,
    users: Object.values(cinemaState.users),
    playlist: cinemaState.playlist.map((v) => ({ id: v.id, url: v.url, played: v.played })),
    currentVideo: cinemaState.currentVideo
      ? { id: cinemaState.currentVideo.id, url: cinemaState.currentVideo.url, played: cinemaState.currentVideo.played }
      : null,
    chatHistory: cinemaState.chatHistory,
    scores: cinemaState.scores,
    voting: {
      active: cinemaState.voting.active,
      timer: cinemaState.voting.timer,
      votedUsers: Object.keys(cinemaState.voting.votesTrack),
      options: getVotingOptions()
    }
  };
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function saveRankingToDb(sortedRank) {
  if (!sqlite) return;
  const now = new Date().toISOString();
  const stmt = sqlite.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  sortedRank.forEach((p) => stmt.run(p.id, p.name, `rank@${p.id}`, `points:${p.points}`, now, now));
}

function clearTimers() {
  if (timers.voting) clearInterval(timers.voting);
  if (timers.podium) clearInterval(timers.podium);
  timers.voting = null;
  timers.podium = null;
}

module.exports = {
  cinemaState,
  getClientState,
  getVotingOptions,
  shuffleArray,
  saveRankingToDb,
  timers,
  clearTimers
};
