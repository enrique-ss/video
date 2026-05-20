const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const Database = require('better-sqlite3');
const { createClient } = require('@supabase/supabase-js');
const { applySchema, dbPath } = require('./setup');

dotenv.config({ quiet: true });

const PORT = process.env.PORT || 3002;
const DEFAULT_BG = '#0a0a0c';

const isOnline =
  (process.env.APP_MODE || 'offline').toLowerCase() === 'online' &&
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  isOnline && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

const supabase = isOnline
  ? createClient(supabaseUrl, serviceRoleKey || supabaseAnonKey)
  : null;

function tableClient(token) {
  if (!isOnline) return null;
  if (supabaseAdmin) return supabaseAdmin;
  if (!token) return supabase;
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}

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
  hasServiceRole: Boolean(serviceRoleKey),
  tableClient,
  sqlite,
  dbPath,
  PREDEFINED_COLORS,
  publicPath: path.resolve(__dirname, '..', 'public')
};
