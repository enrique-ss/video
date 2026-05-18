const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');
const dbPath = path.join(dataDir, 'video.sqlite');

function applySchema(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      password_hash TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      room_id TEXT,
      video_url TEXT,
      added_by_user_id TEXT,
      added_at TEXT
    );
  `);

  // Migração segura para adicionar a coluna 'name' caso o banco já existisse
  try {
    db.prepare("ALTER TABLE users ADD COLUMN name TEXT").run();
  } catch (err) {
    // Ignora se a coluna já existir
  }
}

function recreateDatabase() {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma('foreign_keys = OFF');
  db.exec(`
    DROP TABLE IF EXISTS history;
    DROP TABLE IF EXISTS rooms;
    DROP TABLE IF EXISTS users;
  `);
  db.pragma('foreign_keys = ON');
  applySchema(db);
  db.exec('VACUUM;');
  db.close();
}

function configurarBanco() {
  recreateDatabase();
  console.log(`Banco de vídeo recriado em ${dbPath}`);
  return true;
}

if (require.main === module) {
  const ok = configurarBanco();
  process.exitCode = ok ? 0 : 1;
}

module.exports = { configurarBanco, applySchema, dbPath };
