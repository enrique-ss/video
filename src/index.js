const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { PORT, isOnline, isOffline, hasServiceRole, sqlite, dbPath, publicPath } = require('./config');
const { mountRoutes } = require('./routes');
const { mountSocketGame } = require('./socket-game');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(publicPath));
app.use(express.json());
app.get('/favicon.ico', (_, res) => res.status(204).end());

mountRoutes(app);
mountSocketGame(io);

if (isOffline && !sqlite) {
  console.error('\n[offline] SQLite falhou. Rode: npm rebuild better-sqlite3\n');
  process.exit(1);
}

server.listen(PORT, '0.0.0.0', () => {
  if (isOnline) {
    console.log(`Cinema das Guria → http://localhost:${PORT} (online)`);
    if (!hasServiceRole) {
      console.warn('Defina SUPABASE_SERVICE_ROLE_KEY ou execute supabase/fix-rls.sql');
    }
  } else {
    console.log(`Cinema das Guria → http://localhost:${PORT} (offline)`);
    console.log(`SQLite: ${dbPath}`);
  }
});
