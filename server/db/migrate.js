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

  const paymentCols = db.prepare('PRAGMA table_info(payment_records)').all().map(c => c.name);
  if (!paymentCols.includes('credit_applied')) {
    db.exec('ALTER TABLE payment_records ADD COLUMN credit_applied REAL DEFAULT 0 NOT NULL');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      source TEXT NOT NULL,
      medium TEXT NOT NULL,
      campaign TEXT NOT NULL,
      content TEXT,
      destination TEXT DEFAULT '/' NOT NULL,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL CHECK(event_type IN ('page_view','application_submitted','registration','bot_crawl')),
      visitor_id TEXT,
      session_id TEXT,
      user_id INTEGER,
      path TEXT NOT NULL,
      referrer_origin TEXT,
      source TEXT,
      medium TEXT,
      campaign TEXT,
      content TEXT,
      term TEXT,
      campaign_code TEXT,
      bot_name TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_campaign ON analytics_events(campaign_code, created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_visitor ON analytics_events(visitor_id, created_at);

    CREATE TABLE IF NOT EXISTS analytics_daily_aggregates (
      day TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN ('page_view','click','application_submitted','registration','login','page_duration','bot_crawl')),
      path TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      medium TEXT NOT NULL DEFAULT '',
      campaign TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      campaign_code TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      bot_name TEXT NOT NULL DEFAULT '',
      count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0),
      PRIMARY KEY (day, event_type, path, source, medium, campaign, content, campaign_code, detail, bot_name)
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_daily_day_type ON analytics_daily_aggregates(day, event_type);
    CREATE INDEX IF NOT EXISTS idx_analytics_daily_campaign ON analytics_daily_aggregates(campaign_code, event_type);

    CREATE TABLE IF NOT EXISTS access_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      event_type TEXT NOT NULL,
      ip TEXT NOT NULL DEFAULT '',
      device TEXT NOT NULL DEFAULT 'other',
      os TEXT NOT NULL DEFAULT '',
      browser TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      medium TEXT NOT NULL DEFAULT '',
      campaign TEXT NOT NULL DEFAULT '',
      referrer_host TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_access_log_created ON access_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_access_log_ip ON access_log(ip);

    INSERT INTO analytics_daily_aggregates (
      day, event_type, path, source, medium, campaign, content, campaign_code, detail, bot_name, count
    )
    SELECT day, event_type, path, source, medium, campaign, content, campaign_code, '', bot_name, COUNT(*)
    FROM (
      SELECT COALESCE(date(created_at), date('now')) AS day, event_type,
        CASE WHEN path IN ('/', '/index.html', '/course.html', '/login.html', '/register.html')
          THEN path ELSE '/other' END AS path,
        CASE WHEN COALESCE(source, '') NOT GLOB '*[^A-Za-z0-9._:-]*'
          THEN substr(COALESCE(source, ''), 1, 100) ELSE '' END AS source,
        CASE WHEN COALESCE(medium, '') NOT GLOB '*[^A-Za-z0-9._:-]*'
          THEN substr(COALESCE(medium, ''), 1, 100) ELSE '' END AS medium,
        CASE WHEN COALESCE(campaign, '') NOT GLOB '*[^A-Za-z0-9._:-]*'
          THEN substr(COALESCE(campaign, ''), 1, 120) ELSE '' END AS campaign,
        CASE WHEN COALESCE(content, '') NOT GLOB '*[^A-Za-z0-9._:-]*'
          THEN substr(COALESCE(content, ''), 1, 120) ELSE '' END AS content,
        CASE WHEN COALESCE(campaign_code, '') NOT GLOB '*[^A-Za-z0-9._:-]*'
          THEN substr(COALESCE(campaign_code, ''), 1, 32) ELSE '' END AS campaign_code,
        CASE WHEN COALESCE(bot_name, '') NOT GLOB '*[^A-Za-z0-9._:-]*'
          THEN substr(COALESCE(bot_name, ''), 1, 100) ELSE '' END AS bot_name
      FROM analytics_events
    )
    GROUP BY day, event_type, path, source, medium, campaign, content, campaign_code, bot_name
    ON CONFLICT(day, event_type, path, source, medium, campaign, content, campaign_code, detail, bot_name)
    DO UPDATE SET count = count + excluded.count;
    DELETE FROM analytics_events;

    CREATE TABLE IF NOT EXISTS referral_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS referral_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      enabled INTEGER DEFAULT 0 NOT NULL,
      reward_points INTEGER DEFAULT 0 NOT NULL,
      credit_amount REAL DEFAULT 0 NOT NULL,
      max_rewards_per_user INTEGER DEFAULT 0 NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL
    );
    INSERT OR IGNORE INTO referral_settings (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS referral_programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '' NOT NULL,
      reward_points INTEGER DEFAULT 0 NOT NULL,
      credit_amount REAL DEFAULT 0 NOT NULL,
      max_rewards_per_user INTEGER DEFAULT 0 NOT NULL,
      is_active INTEGER DEFAULT 1 NOT NULL,
      apply_to_all INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS referral_program_assignments (
      program_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      PRIMARY KEY(program_id, user_id),
      FOREIGN KEY (program_id) REFERENCES referral_programs(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_referral_program_assignments_user
      ON referral_program_assignments(user_id, program_id);

    CREATE TABLE IF NOT EXISTS referral_program_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      code TEXT NOT NULL UNIQUE,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      UNIQUE(program_id, user_id),
      FOREIGN KEY (program_id) REFERENCES referral_programs(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS referral_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL UNIQUE,
      referrer_id INTEGER NOT NULL,
      referred_user_id INTEGER,
      points_awarded INTEGER DEFAULT 0 NOT NULL,
      credit_awarded REAL DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
      FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS referral_credits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      reward_id INTEGER NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      remaining REAL NOT NULL CHECK(remaining >= 0),
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reward_id) REFERENCES referral_rewards(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_referral_credits_user ON referral_credits(user_id, remaining);

    CREATE TABLE IF NOT EXISTS payment_credit_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL,
      credit_id INTEGER NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      FOREIGN KEY (payment_id) REFERENCES payment_records(id) ON DELETE CASCADE,
      FOREIGN KEY (credit_id) REFERENCES referral_credits(id) ON DELETE CASCADE,
      UNIQUE(payment_id, credit_id)
    );
    CREATE INDEX IF NOT EXISTS idx_payment_credit_allocations_payment ON payment_credit_allocations(payment_id);

    CREATE TABLE IF NOT EXISTS support_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      status TEXT DEFAULT 'open' NOT NULL CHECK(status IN ('open','waiting','closed')),
      unread_owner INTEGER DEFAULT 1 NOT NULL,
      unread_user INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_support_threads_status ON support_threads(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_support_threads_user ON support_threads(user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL,
      sender_role TEXT NOT NULL CHECK(sender_role IN ('user','owner')),
      body TEXT NOT NULL,
      email_sent INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES support_threads(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_support_messages_thread ON support_messages(thread_id, created_at);

    CREATE TABLE IF NOT EXISTS support_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL
    );

    INSERT INTO support_templates (title, body)
    SELECT 'Отримали ваше звернення', 'Дякуємо за повідомлення! Ми отримали ваше звернення та скоро відповімо.'
    WHERE NOT EXISTS (SELECT 1 FROM support_templates);
    INSERT INTO support_templates (title, body)
    SELECT 'Потрібні додаткові дані', 'Щоб краще допомогти, будь ласка, надішліть додаткову інформацію у відповідь на це повідомлення.'
    WHERE NOT EXISTS (SELECT 1 FROM support_templates WHERE title = 'Потрібні додаткові дані');
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS manuals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      category TEXT,
      sort_order INTEGER DEFAULT 0 NOT NULL,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_manuals_sort ON manuals(sort_order);
  `);

  // SQLite CHECK constraints can't be altered in place — same rebuild dance
  // as the 'program' target_type addition above, this time adding 'manual'.
  const contentPagesSql2 = db.prepare(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'content_pages'
  `).get()?.sql || '';
  if (contentPagesSql2 && !contentPagesSql2.includes(`'manual'`)) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE content_pages_new2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_type TEXT NOT NULL CHECK(target_type IN ('direction','group','program','manual')),
        target_id INTEGER NOT NULL,
        title TEXT,
        subtitle TEXT,
        cover_gradient TEXT DEFAULT 'accent',
        is_published INTEGER DEFAULT 0 NOT NULL,
        created_at TEXT DEFAULT (datetime('now')) NOT NULL,
        updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
        UNIQUE(target_type, target_id)
      );
      INSERT INTO content_pages_new2 SELECT * FROM content_pages;
      DROP TABLE content_pages;
      ALTER TABLE content_pages_new2 RENAME TO content_pages;
      CREATE INDEX IF NOT EXISTS idx_content_pages_target ON content_pages(target_type, target_id);
    `);
    db.pragma('foreign_keys = ON');
  }

  // Manuals: direction tag (so a manual auto-surfaces on groups of that
  // direction) + review_status (self-service authors submit for staff
  // review; is_published in content_pages remains the sole "live" gate).
  const manualCols = db.prepare('PRAGMA table_info(manuals)').all().map(c => c.name);
  if (!manualCols.includes('direction_id')) {
    db.exec('ALTER TABLE manuals ADD COLUMN direction_id INTEGER REFERENCES directions(id) ON DELETE SET NULL');
    db.exec('CREATE INDEX IF NOT EXISTS idx_manuals_direction ON manuals(direction_id)');
  }
  if (!manualCols.includes('review_status')) {
    db.exec(`ALTER TABLE manuals ADD COLUMN review_status TEXT DEFAULT 'draft' NOT NULL`);
  }
  // Group-scoping, mirroring quizzes.group_id — when set, a manual is only
  // visible to that group's members instead of the broader direction match.
  if (!manualCols.includes('group_id')) {
    db.exec('ALTER TABLE manuals ADD COLUMN group_id INTEGER REFERENCES study_groups(id) ON DELETE SET NULL');
    db.exec('CREATE INDEX IF NOT EXISTS idx_manuals_group ON manuals(group_id)');
  }

  // Directions: tag which ones are "programming" directions — gates the
  // code-editor/sandbox feature to relevant groups only.
  const directionCols = db.prepare('PRAGMA table_info(directions)').all().map(c => c.name);
  if (!directionCols.includes('is_programming')) {
    db.exec('ALTER TABLE directions ADD COLUMN is_programming INTEGER DEFAULT 0 NOT NULL');
  }

  // Users: freeze (block login/access without destroying data) as a safer
  // alternative to hard delete.
  const userColsFreeze = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userColsFreeze.includes('is_frozen')) {
    db.exec('ALTER TABLE users ADD COLUMN is_frozen INTEGER DEFAULT 0 NOT NULL');
  }

  // Self-registered accounts start restricted (application-only cabinet)
  // until an admin approves their course application.
  const userColsRestrict = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userColsRestrict.includes('is_restricted')) {
    db.exec('ALTER TABLE users ADD COLUMN is_restricted INTEGER DEFAULT 0 NOT NULL');
  }
  const userColsProfile = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userColsProfile.includes('profile_public')) {
    db.exec('ALTER TABLE users ADD COLUMN profile_public INTEGER DEFAULT 1 NOT NULL');
  }
  if (!userColsProfile.includes('profile_bio')) {
    db.exec("ALTER TABLE users ADD COLUMN profile_bio TEXT DEFAULT '' NOT NULL");
  }
  if (!userColsProfile.includes('profile_hidden_awards')) {
    db.exec("ALTER TABLE users ADD COLUMN profile_hidden_awards TEXT DEFAULT '[]' NOT NULL");
  }
  if (!userColsProfile.includes('profile_share_solutions')) {
    db.exec('ALTER TABLE users ADD COLUMN profile_share_solutions INTEGER DEFAULT 0 NOT NULL');
  }
  if (!userColsProfile.includes('google_sub')) {
    db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub)');
  if (!userColsProfile.includes('referred_by_user_id')) {
    db.exec('ALTER TABLE users ADD COLUMN referred_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
  }
  if (!userColsProfile.includes('referred_by_program_id')) {
    db.exec('ALTER TABLE users ADD COLUMN referred_by_program_id INTEGER REFERENCES referral_programs(id) ON DELETE SET NULL');
  }

  const applicationCols = db.prepare('PRAGMA table_info(applications)').all().map(c => c.name);
  for (const [column, sql] of [
    ['referral_program_id', 'ALTER TABLE applications ADD COLUMN referral_program_id INTEGER REFERENCES referral_programs(id) ON DELETE SET NULL'],
    ['callback_phone', 'ALTER TABLE applications ADD COLUMN callback_phone TEXT'],
    ['referral_code', 'ALTER TABLE applications ADD COLUMN referral_code TEXT'],
    ['referrer_id', 'ALTER TABLE applications ADD COLUMN referrer_id INTEGER REFERENCES users(id) ON DELETE SET NULL'],
    ['analytics_visitor_id', 'ALTER TABLE applications ADD COLUMN analytics_visitor_id TEXT'],
    ['analytics_source', 'ALTER TABLE applications ADD COLUMN analytics_source TEXT'],
    ['analytics_medium', 'ALTER TABLE applications ADD COLUMN analytics_medium TEXT'],
    ['analytics_campaign', 'ALTER TABLE applications ADD COLUMN analytics_campaign TEXT'],
    ['analytics_campaign_code', 'ALTER TABLE applications ADD COLUMN analytics_campaign_code TEXT'],
  ]) {
    if (!applicationCols.includes(column)) db.exec(sql);
  }

  const referralRewardCols = db.prepare('PRAGMA table_info(referral_rewards)').all().map(c => c.name);
  if (!referralRewardCols.includes('program_id')) {
    db.exec('ALTER TABLE referral_rewards ADD COLUMN program_id INTEGER REFERENCES referral_programs(id) ON DELETE SET NULL');
  }

  db.exec(`
    UPDATE applications SET
      analytics_visitor_id = NULL,
      analytics_source = NULL,
      analytics_medium = NULL,
      analytics_campaign = NULL,
      analytics_campaign_code = NULL;
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS code_workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      group_id INTEGER,
      name TEXT NOT NULL,
      language TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS code_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      path TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES code_workspaces(id) ON DELETE CASCADE,
      UNIQUE(workspace_id, path)
    );

    CREATE TABLE IF NOT EXISTS code_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      stdout TEXT,
      stderr TEXT,
      exit_code INTEGER,
      target_url TEXT,
      container_name TEXT,
      host_port INTEGER,
      work_dir TEXT,
      started_at TEXT DEFAULT (datetime('now')) NOT NULL,
      finished_at TEXT,
      FOREIGN KEY (workspace_id) REFERENCES code_workspaces(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_code_workspaces_user ON code_workspaces(user_id);
    CREATE INDEX IF NOT EXISTS idx_code_files_workspace ON code_files(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_code_runs_workspace ON code_runs(workspace_id);
  `);

  // Groups: a direct direction tag, independent of program_id — a group
  // doesn't have to be tied to a specific course to be organized under a
  // broad direction (e.g. a pure "Cybersecurity" cohort with no program
  // assigned yet). Falls back to the program's direction when unset.
  const groupCols = db.prepare('PRAGMA table_info(study_groups)').all().map(c => c.name);
  if (!groupCols.includes('direction_id')) {
    db.exec('ALTER TABLE study_groups ADD COLUMN direction_id INTEGER REFERENCES directions(id) ON DELETE SET NULL');
    db.exec('CREATE INDEX IF NOT EXISTS idx_study_groups_direction ON study_groups(direction_id)');
  }

  // Attendance: append-only presence event log for conferences (join/leave/
  // tab-switch) — unlike conference_participants.joined_at/left_at, this is
  // never overwritten, so full multi-session/focus-change history survives.
  db.exec(`
    CREATE TABLE IF NOT EXISTS conference_attendance_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conference_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN ('join','leave','tab_hidden','tab_visible')),
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_attendance_events_conf ON conference_attendance_events(conference_id);

    CREATE TABLE IF NOT EXISTS recording_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recording_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      max_position_seconds INTEGER DEFAULT 0 NOT NULL,
      watched_seconds INTEGER DEFAULT 0 NOT NULL,
      completed INTEGER DEFAULT 0 NOT NULL,
      first_watched_at TEXT DEFAULT (datetime('now')) NOT NULL,
      last_watched_at TEXT DEFAULT (datetime('now')) NOT NULL,
      UNIQUE(recording_id, user_id),
      FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL CHECK(source IN ('server', 'client')),
      level TEXT NOT NULL DEFAULT 'error',
      message TEXT NOT NULL,
      stack TEXT,
      method TEXT,
      path TEXT,
      status_code INTEGER,
      user_id INTEGER,
      user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);

    CREATE TABLE IF NOT EXISTS user_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      author_id INTEGER,
      body TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_notes_user ON user_notes(user_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'ctftime')),
      external_id TEXT,
      audience_type TEXT NOT NULL DEFAULT 'all' CHECK(audience_type IN ('all', 'group', 'student')),
      audience_id INTEGER,
      title TEXT NOT NULL,
      description TEXT DEFAULT '' NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      url TEXT,
      source_url TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_source_external
      ON calendar_events(source, external_id) WHERE external_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_calendar_events_starts_at ON calendar_events(starts_at);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_audience ON calendar_events(audience_type, audience_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS manual_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manual_id INTEGER NOT NULL,
      user_id INTEGER,
      body TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (manual_id) REFERENCES manuals(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_manual_comments_manual_created
      ON manual_comments(manual_id, created_at, id);
  `);

  const lessonCols = db.prepare('PRAGMA table_info(lessons)').all().map((column) => column.name);
  if (!lessonCols.includes('series_id')) db.exec('ALTER TABLE lessons ADD COLUMN series_id TEXT');
  if (!lessonCols.includes('original_lesson_at')) db.exec('ALTER TABLE lessons ADD COLUMN original_lesson_at TEXT');
  if (!lessonCols.includes('is_exception')) {
    db.exec('ALTER TABLE lessons ADD COLUMN is_exception INTEGER DEFAULT 0 NOT NULL');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_lessons_series ON lessons(series_id, lesson_at)');
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
