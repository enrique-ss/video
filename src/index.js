const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');

const { PORT, isOnline, isOffline, sqlite, dbPath, publicPath } = require('./config');
const { mountRoutes } = require('./routes');
const { mountSocketGame } = require('./socket-game');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(publicPath));
app.use(express.json());
app.use(cookieParser());
app.get('/favicon.ico', (_, res) => res.status(204).end());

mountRoutes(app);
mountSocketGame(io);

if (isOffline && !sqlite) {
  console.error('\n[OFFLINE] SQLite não iniciou. Rode na pasta do projeto:');
  console.error('  npm rebuild better-sqlite3');
  console.error('  npm start\n');
  process.exit(1);
}

server.listen(PORT, '0.0.0.0', () => {
  if (isOnline) {
    console.log(`Cinema das Guria → http://localhost:${PORT} (online / Supabase)`);
  } else {
    console.log(`Cinema das Guria → http://localhost:${PORT} (offline / SQLite)`);
    console.log(`Banco local: ${dbPath}`);
  }
});
