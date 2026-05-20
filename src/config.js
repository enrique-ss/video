const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const Database = require('better-sqlite3');
const { createClient } = require('@supabase/supabase-js');
const { applySchema, dbPath } = require('./setup');

dotenv.config({ quiet: true });

const PORT = process.env.PORT || 3002;
const DEFAULT_BG = '#0a0a0c';

// offline = SQLite em data/video.sqlite (sem internet, sem Supabase)
// online  = Supabase (só se APP_MODE=online E as chaves estiverem preenchidas)
const requestedMode = (process.env.APP_MODE || 'offline').toLowerCase();
const hasSupabase = Boolean(
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_ANON_KEY &&
  process.env.SUPABASE_URL !== 'seu_projeto' // evita .env de exemplo
);
const isOnline = requestedMode === 'online' && hasSupabase;

const supabase = isOnline
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    )
  : null;

let sqlite = null;
try {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  sqlite = new Database(dbPath);
  applySchema(sqlite);
} catch (err) {
  console.error('SQLite indisponível:', err.message);
}

const PREDEFINED_COLORS = [
  '#ff0050', '#00f2ea', '#ffd700', '#00ff66', '#7000ff',
  '#ff7700', '#ff00ff', '#0099ff', '#ff3333', '#33cc33',
  '#9933ff', '#ff9900', '#00ffd8', '#ff00a0', '#ffea00'
];

module.exports = {
  PORT,
  DEFAULT_BG,
  isOnline,
  isOffline: !isOnline,
  supabase,
  sqlite,
  dbPath,
  PREDEFINED_COLORS,
  publicPath: path.resolve(__dirname, '..', 'public')
};
