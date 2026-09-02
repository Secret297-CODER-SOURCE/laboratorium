export function runMigrations(db) {
  const cols = db.prepare('PRAGMA table_info(programs)').all().map(c => c.name);

  if (!cols.includes('direction_id')) {
    db.exec('ALTER TABLE programs ADD COLUMN direction_id INTEGER REFERENCES directions(id) ON DELETE SET NULL');
  }
  if (!cols.includes('sort_order')) {
    db.exec('ALTER TABLE programs ADD COLUMN sort_order INTEGER DEFAULT 0 NOT NULL');
  }
  if (!cols.includes('is_featured')) {
    db.exec('ALTER TABLE programs ADD COLUMN is_featured INTEGER DEFAULT 0 NOT NULL');
  }
  if (!cols.includes('updated_at')) {
    db.exec('ALTER TABLE programs ADD COLUMN updated_at TEXT');
    db.exec(`UPDATE programs SET updated_at = datetime('now') WHERE updated_at IS NULL`);
  }

  const appCols = db.prepare('PRAGMA table_info(applications)').all().map(c => c.name);
  if (!appCols.includes('direction_id')) {
    db.exec('ALTER TABLE applications ADD COLUMN direction_id INTEGER REFERENCES directions(id) ON DELETE SET NULL');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS directions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      sort_order INTEGER DEFAULT 0 NOT NULL,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_directions_active ON directions(is_active, sort_order);
    CREATE INDEX IF NOT EXISTS idx_programs_direction ON programs(direction_id);
    CREATE INDEX IF NOT EXISTS idx_reset_tokens_hash ON password_reset_tokens(token_hash);

    CREATE TABLE IF NOT EXISTS study_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      teacher_id INTEGER NOT NULL,
      program_id INTEGER,
      color TEXT,
      sort_order INTEGER DEFAULT 0 NOT NULL,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS study_group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      added_by INTEGER,
      joined_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE(group_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_study_groups_teacher ON study_groups(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_study_group_members_group ON study_group_members(group_id);
    CREATE INDEX IF NOT EXISTS idx_study_group_members_user ON study_group_members(user_id);

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      created_by INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      bounty_reward INTEGER DEFAULT 0 NOT NULL,
      due_at TEXT,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','taken','review','completed')),
      taken_at TEXT,
      submitted_at TEXT,
      completed_at TEXT,
      submission_note TEXT,
      reviewer_id INTEGER,
      UNIQUE(task_id, user_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_group ON tasks(group_id);
    CREATE INDEX IF NOT EXISTS idx_task_assignments_user ON task_assignments(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_task_assignments_task ON task_assignments(task_id);

    CREATE TABLE IF NOT EXISTS task_submission_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (assignment_id) REFERENCES task_assignments(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_task_submission_files_assignment ON task_submission_files(assignment_id);
  `);

  const memberCols = db.prepare('PRAGMA table_info(study_group_members)').all().map(c => c.name);
  if (!memberCols.includes('member_role')) {
    db.exec(`ALTER TABLE study_group_members ADD COLUMN member_role TEXT DEFAULT 'student' NOT NULL`);
    db.exec(`UPDATE study_group_members SET member_role = 'student' WHERE member_role IS NULL OR member_role = ''`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      group_id INTEGER,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','published')),
      submitted_at TEXT,
      published_at TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_articles_user ON articles(user_id);
    CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
  `);

  const confCols = db.prepare('PRAGMA table_info(conferences)').all().map(c => c.name);
  if (!confCols.includes('group_id')) {
    db.exec('ALTER TABLE conferences ADD COLUMN group_id INTEGER REFERENCES study_groups(id) ON DELETE SET NULL');
    db.exec('CREATE INDEX IF NOT EXISTS idx_conferences_group ON conferences(group_id)');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('group','dm')),
      group_id INTEGER UNIQUE,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_channel_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      last_read_at TEXT,
      joined_at TEXT DEFAULT (datetime('now')) NOT NULL,
      UNIQUE(channel_id, user_id),
      FOREIGN KEY (channel_id) REFERENCES chat_channels(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_dm_pairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL UNIQUE,
      user_a_id INTEGER NOT NULL,
      user_b_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      UNIQUE(user_a_id, user_b_id),
      FOREIGN KEY (channel_id) REFERENCES chat_channels(id) ON DELETE CASCADE,
      FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      user_id INTEGER,
      body TEXT,
      msg_type TEXT NOT NULL DEFAULT 'text' CHECK(msg_type IN ('text','sticker','gif','video','image','system')),
      attachment_url TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (channel_id) REFERENCES chat_channels(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_channels_group ON chat_channels(group_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_channel_members_user ON chat_channel_members(user_id);
  `);

  const chCols = db.prepare('PRAGMA table_info(challenges)').all().map(c => c.name);
  if (!chCols.includes('flag_hash')) {
    db.exec(`ALTER TABLE challenges ADD COLUMN flag_hash TEXT`);
  }
  if (!chCols.includes('docker_image')) {
    db.exec(`ALTER TABLE challenges ADD COLUMN docker_image TEXT`);
  }
  if (!chCols.includes('target_port')) {
    db.exec(`ALTER TABLE challenges ADD COLUMN target_port INTEGER DEFAULT 80`);
  }
  if (!chCols.includes('ctf_enabled')) {
    db.exec(`ALTER TABLE challenges ADD COLUMN ctf_enabled INTEGER DEFAULT 1 NOT NULL`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_labs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      proxmox_vmid INTEGER,
      node TEXT,
      hostname TEXT,
      ip TEXT,
      status TEXT NOT NULL DEFAULT 'none' CHECK(status IN ('none','provisioning','running','stopped','error')),
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ctf_deployments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      challenge_id INTEGER NOT NULL,
      container_id TEXT,
      target_url TEXT,
      host_port INTEGER,
      status TEXT NOT NULL DEFAULT 'deploying' CHECK(status IN ('deploying','running','stopped','error')),
      error_message TEXT,
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      UNIQUE(user_id, challenge_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS docker_deployments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      image TEXT NOT NULL,
      container_id TEXT,
      target_url TEXT,
      host_port INTEGER,
      status TEXT NOT NULL DEFAULT 'deploying' CHECK(status IN ('deploying','running','stopped','error')),
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ctf_deployments_user ON ctf_deployments(user_id);
    CREATE INDEX IF NOT EXISTS idx_docker_deployments_user ON docker_deployments(user_id);

    CREATE TABLE IF NOT EXISTS vm_backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      resource_type TEXT NOT NULL CHECK(resource_type IN ('vm','docker')),
      resource_id INTEGER,
      label TEXT,
      ref TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','auto')),
      status TEXT NOT NULL DEFAULT 'creating' CHECK(status IN ('creating','ready','error')),
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_vm_backups_user ON vm_backups(user_id, resource_type);

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      data TEXT,
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, id DESC);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

    CREATE TABLE IF NOT EXISTS vm_exposed_ports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      port INTEGER NOT NULL,
      label TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, port)
    );

    CREATE INDEX IF NOT EXISTS idx_vm_exposed_ports_user ON vm_exposed_ports(user_id);
  `);

  const ctfDepCols = db.prepare('PRAGMA table_info(ctf_deployments)').all().map(c => c.name);
  if (!ctfDepCols.includes('extra_ports')) {
    db.exec(`ALTER TABLE ctf_deployments ADD COLUMN extra_ports TEXT`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS content_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL CHECK(target_type IN ('direction','group','program')),
      target_id INTEGER NOT NULL,
      title TEXT,
      subtitle TEXT,
      cover_gradient TEXT DEFAULT 'accent',
      is_published INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
      UNIQUE(target_type, target_id)
    );

    CREATE TABLE IF NOT EXISTS content_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      icon TEXT,
      sort_order INTEGER DEFAULT 0 NOT NULL,
      FOREIGN KEY (page_id) REFERENCES content_pages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS content_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL,
      block_type TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER DEFAULT 0 NOT NULL,
      FOREIGN KEY (section_id) REFERENCES content_sections(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_content_pages_target ON content_pages(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_content_sections_page ON content_sections(page_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_content_blocks_section ON content_blocks(section_id, sort_order);

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      teacher_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      lesson_at TEXT NOT NULL,
      duration_minutes INTEGER DEFAULT 90 NOT NULL,
      topic TEXT,
      location TEXT,
      is_cancelled INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lesson_absences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'reported' CHECK(status IN ('reported','acknowledged')),
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      acknowledged_by INTEGER,
      acknowledged_at TEXT,
      UNIQUE(lesson_id, user_id),
      FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_lessons_group_at ON lessons(group_id, lesson_at);
    CREATE INDEX IF NOT EXISTS idx_lesson_absences_lesson ON lesson_absences(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_lesson_absences_user ON lesson_absences(user_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS lab_tunnel_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      target_host TEXT NOT NULL,
      target_port INTEGER NOT NULL,
      via_agent INTEGER DEFAULT 0 NOT NULL,
      resource_type TEXT,
      resource_id INTEGER,
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_lab_tunnel_tokens_user ON lab_tunnel_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_lab_tunnel_resource ON lab_tunnel_tokens(resource_type, resource_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER,
      program_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      pass_percent INTEGER DEFAULT 70 NOT NULL,
      bounty_reward INTEGER DEFAULT 50 NOT NULL,
      time_limit_minutes INTEGER,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS quiz_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      sort_order INTEGER DEFAULT 0 NOT NULL,
      question_text TEXT NOT NULL,
      options_json TEXT NOT NULL,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      score_percent INTEGER,
      passed INTEGER DEFAULT 0 NOT NULL,
      answers_json TEXT,
      started_at TEXT DEFAULT (datetime('now')) NOT NULL,
      submitted_at TEXT,
      UNIQUE(quiz_id, user_id),
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_quizzes_group ON quizzes(group_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON quiz_attempts(user_id);
  `);

  const taskCols = db.prepare('PRAGMA table_info(tasks)').all().map(c => c.name);
  if (!taskCols.includes('time_limit_minutes')) {
    db.exec('ALTER TABLE tasks ADD COLUMN time_limit_minutes INTEGER');
  }

  const challengeTimeCols = db.prepare('PRAGMA table_info(challenges)').all().map(c => c.name);
  if (!challengeTimeCols.includes('time_limit_minutes')) {
    db.exec('ALTER TABLE challenges ADD COLUMN time_limit_minutes INTEGER');
  }

  const ccCols = db.prepare('PRAGMA table_info(challenge_completions)').all().map(c => c.name);
  if (!ccCols.includes('started_at')) {
    db.exec('ALTER TABLE challenge_completions ADD COLUMN started_at TEXT');
  }
  if (!ccCols.includes('duration_seconds')) {
    db.exec('ALTER TABLE challenge_completions ADD COLUMN duration_seconds INTEGER');
  }

  const taCols = db.prepare('PRAGMA table_info(task_assignments)').all().map(c => c.name);
  if (!taCols.includes('duration_seconds')) {
    db.exec('ALTER TABLE task_assignments ADD COLUMN duration_seconds INTEGER');
  }
  if (!taCols.includes('work_duration_seconds')) {
    db.exec('ALTER TABLE task_assignments ADD COLUMN work_duration_seconds INTEGER');
  }

  const qaCols = db.prepare('PRAGMA table_info(quiz_attempts)').all().map(c => c.name);
  if (!qaCols.includes('duration_seconds')) {
    db.exec('ALTER TABLE quiz_attempts ADD COLUMN duration_seconds INTEGER');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS challenge_starts (
      user_id INTEGER NOT NULL,
      challenge_id INTEGER NOT NULL,
      started_at TEXT DEFAULT (datetime('now')) NOT NULL,
      PRIMARY KEY (user_id, challenge_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS storage_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      root_path TEXT NOT NULL,
      is_default INTEGER DEFAULT 0 NOT NULL,
      is_active INTEGER DEFAULT 1 NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS storage_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL,
      asset_type TEXT NOT NULL CHECK(asset_type IN ('recording', 'chat')),
      ref_id INTEGER,
      filename TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      size_bytes INTEGER DEFAULT 0 NOT NULL,
      label TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (server_id) REFERENCES storage_servers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_storage_assets_server ON storage_assets(server_id);
    CREATE INDEX IF NOT EXISTS idx_storage_assets_type ON storage_assets(asset_type, ref_id);
  `);

  const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userCols.includes('billing_day')) {
    db.exec('ALTER TABLE users ADD COLUMN billing_day INTEGER DEFAULT 1 NOT NULL');
  }
  if (!userCols.includes('billing_exempt')) {
    db.exec('ALTER TABLE users ADD COLUMN billing_exempt INTEGER DEFAULT 0 NOT NULL');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      period_year INTEGER NOT NULL,
      period_month INTEGER NOT NULL CHECK(period_month BETWEEN 1 AND 12),
      paid_at TEXT DEFAULT (datetime('now')) NOT NULL,
      amount REAL,
      note TEXT,
      recorded_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE(user_id, period_year, period_month)
    );

    CREATE INDEX IF NOT EXISTS idx_payment_records_period ON payment_records(period_year, period_month);
    CREATE INDEX IF NOT EXISTS idx_payment_records_user ON payment_records(user_id);
  `);

  bootstrapCurrentMonthPayments(db);

  const chCols2 = db.prepare('PRAGMA table_info(challenges)').all().map(c => c.name);
  if (!chCols2.includes('category')) {
    db.exec(`ALTER TABLE challenges ADD COLUMN category TEXT DEFAULT 'misc' NOT NULL`);
  }
  if (!chCols2.includes('author_id')) {
    db.exec(`ALTER TABLE challenges ADD COLUMN author_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS challenge_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id INTEGER NOT NULL,
      sort_order INTEGER DEFAULT 0 NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      flag_hash TEXT,
      points INTEGER DEFAULT 0 NOT NULL,
      hint_text TEXT,
      hint_cost INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS challenge_stage_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      stage_id INTEGER NOT NULL,
      challenge_id INTEGER NOT NULL,
      completed_at TEXT,
      points_awarded INTEGER,
      hint_used INTEGER DEFAULT 0 NOT NULL,
      hint_used_at TEXT,
      UNIQUE(user_id, stage_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (stage_id) REFERENCES challenge_stages(id) ON DELETE CASCADE,
      FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ctf_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('solve','first_blood','published')),
      user_id INTEGER,
      challenge_id INTEGER,
      stage_id INTEGER,
      message TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE,
      FOREIGN KEY (stage_id) REFERENCES challenge_stages(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_challenge_stages_challenge ON challenge_stages(challenge_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_stage_progress_user ON challenge_stage_progress(user_id);
    CREATE INDEX IF NOT EXISTS idx_stage_progress_stage ON challenge_stage_progress(stage_id);
    CREATE INDEX IF NOT EXISTS idx_ctf_activity_created ON ctf_activity(created_at DESC);

    CREATE TABLE IF NOT EXISTS challenge_stage_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stage_id INTEGER NOT NULL,
      challenge_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (stage_id) REFERENCES challenge_stages(id) ON DELETE CASCADE,
      FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_stage_attachments_stage ON challenge_stage_attachments(stage_id);
  `);

  const contentPagesSql = db.prepare(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'content_pages'
  `).get()?.sql || '';
  if (contentPagesSql && !contentPagesSql.includes(`'program'`)) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE content_pages_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_type TEXT NOT NULL CHECK(target_type IN ('direction','group','program')),
        target_id INTEGER NOT NULL,
        title TEXT,
        subtitle TEXT,
        cover_gradient TEXT DEFAULT 'accent',
        is_published INTEGER DEFAULT 0 NOT NULL,
        created_at TEXT DEFAULT (datetime('now')) NOT NULL,
        updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
        UNIQUE(target_type, target_id)
      );
      INSERT INTO content_pages_new SELECT * FROM content_pages;
      DROP TABLE content_pages;
      ALTER TABLE content_pages_new RENAME TO content_pages;
      CREATE INDEX IF NOT EXISTS idx_content_pages_target ON content_pages(target_type, target_id);
    `);
    db.pragma('foreign_keys = ON');
  }
}

function bootstrapCurrentMonthPayments(db) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const students = db.prepare(`SELECT id FROM users WHERE role = 'student'`).all();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO payment_records (user_id, period_year, period_month, note)
    VALUES (?, ?, ?, 'Початкова міграція')
  `);
  for (const s of students) insert.run(s.id, year, month);
}
