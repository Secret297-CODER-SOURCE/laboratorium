export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    handle TEXT UNIQUE NOT NULL,
    bounty_points INTEGER DEFAULT 0 NOT NULL,
    role TEXT DEFAULT 'student' NOT NULL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    level TEXT NOT NULL,
    duration TEXT NOT NULL,
    bounty_reward INTEGER NOT NULL,
    description TEXT,
    tags TEXT,
    is_active INTEGER DEFAULT 1 NOT NULL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    program_id INTEGER NOT NULL,
    progress INTEGER DEFAULT 0 NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL,
    enrolled_at TEXT DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
    UNIQUE(user_id, program_id)
  );

  CREATE TABLE IF NOT EXISTS challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    bounty_reward INTEGER NOT NULL,
    difficulty TEXT NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard')),
    program_id INTEGER,
    is_active INTEGER DEFAULT 1 NOT NULL,
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS challenge_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    challenge_id INTEGER NOT NULL,
    completed_at TEXT DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE,
    UNIQUE(user_id, challenge_id)
  );

  CREATE TABLE IF NOT EXISTS bounty_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    program TEXT NOT NULL,
    message TEXT,
    status TEXT DEFAULT 'pending' NOT NULL,
    user_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_users_bounty ON users(bounty_points DESC);
  CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);
  CREATE INDEX IF NOT EXISTS idx_bounty_log_user ON bounty_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);

  CREATE TABLE IF NOT EXISTS conferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    host_user_id INTEGER NOT NULL,
    program_id INTEGER,
    scheduled_at TEXT NOT NULL,
    duration_minutes INTEGER DEFAULT 60 NOT NULL,
    status TEXT DEFAULT 'scheduled' NOT NULL CHECK(status IN ('scheduled','live','ended','cancelled')),
    max_participants INTEGER DEFAULT 30 NOT NULL,
    recording_enabled INTEGER DEFAULT 1 NOT NULL,
    started_at TEXT,
    ended_at TEXT,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS conference_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conference_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'participant' NOT NULL CHECK(role IN ('host','moderator','participant')),
    joined_at TEXT,
    left_at TEXT,
    FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(conference_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS conference_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conference_id INTEGER NOT NULL,
    user_id INTEGER,
    handle TEXT,
    message TEXT NOT NULL,
    msg_type TEXT DEFAULT 'text' NOT NULL CHECK(msg_type IN ('text','system')),
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conference_id INTEGER,
    uploaded_by INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    filename TEXT NOT NULL,
    mime_type TEXT DEFAULT 'video/webm' NOT NULL,
    duration_seconds INTEGER DEFAULT 0,
    file_size INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE SET NULL,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS recording_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recording_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    timestamp_seconds REAL,
    is_pinned INTEGER DEFAULT 0 NOT NULL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_conferences_scheduled ON conferences(scheduled_at);
  CREATE INDEX IF NOT EXISTS idx_conferences_status ON conferences(status);
  CREATE INDEX IF NOT EXISTS idx_conference_messages_conf ON conference_messages(conference_id);
  CREATE INDEX IF NOT EXISTS idx_recordings_conf ON recordings(conference_id);
  CREATE INDEX IF NOT EXISTS idx_recording_notes_rec ON recording_notes(recording_id);
`;
