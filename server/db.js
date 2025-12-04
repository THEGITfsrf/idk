import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = '/tmp'; // Vercel writable folder
const dbPath = path.join(dbDir, 'users.db');

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

async function createDb() {
  const sqlite = await open({ filename: dbPath, driver: sqlite3.Database });

  // Enable WAL
  await sqlite.exec('PRAGMA journal_mode = WAL;');

  // Drop-in prepare wrapper
  const db = {
    prepare(sql) {
      return {
        get: async (...params) => await sqlite.get(sql, params),
        all: async (...params) => await sqlite.all(sql, params),
        run: async (...params) => await sqlite.run(sql, params),
      };
    },
    exec: async (sql) => await sqlite.exec(sql),
    raw: sqlite,
  };

  // ===== SCHEMA CREATION =====
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      username TEXT,
      bio TEXT,
      avatar_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // ===== MIGRATIONS =====
  try {
    const tableInfo = await db.prepare("PRAGMA table_info(users)").all();
    const columnNames = tableInfo.map(col => col.name);
    const result = await db.prepare('SELECT COUNT(*) as count FROM users').get();
    const hasExistingUsers = result.count > 0;

    if (!columnNames.includes('email_verified')) {
      await db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0');
      if (hasExistingUsers) {
        await db.exec('UPDATE users SET email_verified = 1');
      }
    }
    if (!columnNames.includes('verification_token')) {
      await db.exec('ALTER TABLE users ADD COLUMN verification_token TEXT');
    }
    if (!columnNames.includes('is_admin')) {
      await db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
    }
    if (!columnNames.includes('school')) {
      await db.exec('ALTER TABLE users ADD COLUMN school TEXT');
    }
    if (!columnNames.includes('age')) {
      await db.exec('ALTER TABLE users ADD COLUMN age INTEGER');
    }
    if (!columnNames.includes('ip')) {
      await db.exec('ALTER TABLE users ADD COLUMN ip TEXT');
    }
  } catch (error) {
    console.error('Migration error:', error);
  }

  // ===== OTHER TABLES =====
  await db.exec(`
    CREATE TABLE IF NOT EXISTS changelog (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (author_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      localstorage_data TEXT,
      theme TEXT DEFAULT 'dark',
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      session_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS likes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(type, target_id, user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
  `);

  return db;
}

const db = await createDb();
export default db;
