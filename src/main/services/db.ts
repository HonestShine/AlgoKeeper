import { app } from 'electron'
import { join } from 'node:path'
import Database from 'better-sqlite3'

export type Db = Database.Database

let db: Db | null = null

const SCHEMA_V1 = `
CREATE TABLE notes (
  note_id      TEXT PRIMARY KEY,
  source       TEXT NOT NULL,
  id           TEXT NOT NULL,
  title        TEXT NOT NULL,
  difficulty   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active',
  tags_json    TEXT NOT NULL DEFAULT '[]',
  file_path    TEXT NOT NULL,
  mtime        INTEGER NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_notes_source_id ON notes(source, id);

CREATE TABLE tags (
  note_id TEXT NOT NULL REFERENCES notes(note_id),
  tag     TEXT NOT NULL,
  PRIMARY KEY(note_id, tag)
);
CREATE INDEX idx_tags_tag ON tags(tag);

CREATE TABLE cards (
  card_id        TEXT PRIMARY KEY,
  note_id        TEXT NOT NULL REFERENCES notes(note_id),
  kind           TEXT NOT NULL,
  question       TEXT NOT NULL,
  answer_text    TEXT,
  repetitions    INTEGER NOT NULL DEFAULT 0,
  ease_factor    REAL NOT NULL DEFAULT 2.5,
  interval_days  INTEGER NOT NULL DEFAULT 0,
  due            TEXT NOT NULL,
  lapses         INTEGER NOT NULL DEFAULT 0,
  last_reviewed  TEXT,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_cards_due ON cards(due);
CREATE INDEX idx_cards_note ON cards(note_id);

CREATE TABLE review_logs (
  log_id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id         TEXT NOT NULL,
  note_id         TEXT NOT NULL,
  ts              TEXT NOT NULL,
  grade           INTEGER NOT NULL,
  interval_before INTEGER,
  interval_after  INTEGER,
  ease_after      REAL
);
CREATE INDEX idx_logs_note_ts ON review_logs(note_id, ts);
CREATE INDEX idx_logs_ts ON review_logs(ts);
`

/** 惰性单例：userData/algokeeper.db，WAL + 按 user_version 迁移。 */
export function getDb(): Db {
  if (!db) {
    const file = join(app.getPath('userData'), 'algokeeper.db')
    db = new Database(file)
    db.pragma('journal_mode = WAL')
    migrate(db)
  }
  return db
}

function migrate(database: Db): void {
  const version = database.pragma('user_version', { simple: true }) as number
  if (version < 1) {
    database.exec('BEGIN;')
    try {
      database.exec(SCHEMA_V1)
      database.pragma('user_version = 1')
      database.exec('COMMIT;')
    } catch (err) {
      database.exec('ROLLBACK;')
      throw err
    }
  }
}
