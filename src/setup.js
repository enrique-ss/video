const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');
const dbPath = path.join(dataDir, 'video.sqlite');

/** Schema local — espelha supabase/schema.sql (com senha para modo offline). */
function applySchema(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      avatar TEXT,
      bg_color TEXT NOT NULL DEFAULT '#0a0a0c',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS acervo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      thumbnail TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, url),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_acervo_user_id ON acervo(user_id);
  `);

  for (const sql of [
    "ALTER TABLE users ADD COLUMN updated_at TEXT",
    "ALTER TABLE users ADD COLUMN bg_color TEXT DEFAULT '#0a0a0c'"
  ]) {
    try { db.prepare(sql).run(); } catch (_) {}
  }
}

function recreateDatabase() {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(dbPath);
  db.exec('DROP TABLE IF EXISTS acervo; DROP TABLE IF EXISTS users;');
  applySchema(db);
  db.close();
  console.log(`SQLite recriado em ${dbPath}`);
}

if (require.main === module) {
  recreateDatabase();
}

module.exports = { applySchema, dbPath, recreateDatabase };
