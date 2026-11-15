import db from '../db/index.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

export const STAGES = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
export const STAGE_LABELS = {
  lead: 'Заявка',
  qualified: 'Звʼязок',
  proposal: 'Умови',
  negotiation: 'Очікує оплату',
  won: 'Учень',
  lost: 'Відмова',
};

const ACTIVITY_TYPES = ['note', 'call', 'email', 'meeting', 'task'];

function trim(value, max = 255) {
  return String(value || '').trim().slice(0, max);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getCompany(id) {
  return db.prepare('SELECT * FROM crm_companies WHERE id = ?').get(id);
}

function getContact(id) {
  return db.prepare(`
    SELECT c.*, co.name AS company_name
    FROM crm_contacts c
    LEFT JOIN crm_companies co ON co.id = c.company_id
    WHERE c.id = ?
  `).get(id);
}

function getOpportunity(id) {
  return db.prepare(`
    SELECT o.*,
      co.name AS company_name,
      ct.name AS contact_name,
      ct.email AS contact_email,
      u.name AS owner_name
    FROM crm_opportunities o
    LEFT JOIN crm_companies co ON co.id = o.company_id
    LEFT JOIN crm_contacts ct ON ct.id = o.contact_id
    LEFT JOIN users u ON u.id = o.owner_user_id
    WHERE o.id = ?
  `).get(id);
}

export function getBoard() {
  const opportunities = db.prepare(`
    SELECT o.*,
      co.name AS company_name,
      ct.name AS contact_name,
      ct.email AS contact_email,
      ct.phone AS contact_phone
    FROM crm_opportunities o
    LEFT JOIN crm_companies co ON co.id = o.company_id
    LEFT JOIN crm_contacts ct ON ct.id = o.contact_id
    WHERE o.stage NOT IN ('won', 'lost')
    ORDER BY
      CASE o.stage
        WHEN 'lead' THEN 1
        WHEN 'qualified' THEN 2
        WHEN 'proposal' THEN 3
        WHEN 'negotiation' THEN 4
        ELSE 5
      END,
      datetime(o.updated_at) DESC
  `).all();

  const closed = db.prepare(`
    SELECT o.*, co.name AS company_name, ct.name AS contact_name
    FROM crm_opportunities o
    LEFT JOIN crm_companies co ON co.id = o.company_id
    LEFT JOIN crm_contacts ct ON ct.id = o.contact_id
    WHERE o.stage IN ('won', 'lost')
    ORDER BY datetime(o.updated_at) DESC
    LIMIT 40
  `).all();

  const columns = {};
  for (const stage of STAGES.filter((s) => s !== 'won' && s !== 'lost')) {
    columns[stage] = opportunities.filter((o) => o.stage === stage);
  }

  const stats = {
    open: opportunities.length,
    pipeline_value: opportunities.reduce((sum, o) => sum + Number(o.value || 0), 0),
    companies: db.prepare('SELECT COUNT(*) AS c FROM crm_companies').get().c,
    contacts: db.prepare('SELECT COUNT(*) AS c FROM crm_contacts').get().c,
    won_30d: db.prepare(`
      SELECT COUNT(*) AS c FROM crm_opportunities
      WHERE stage = 'won' AND datetime(updated_at) >= datetime('now', '-30 days')
    `).get().c,
  };

  return { stages: STAGES, stageLabels: STAGE_LABELS, columns, closed, stats };
}

export function listCompanies({ q = '' } = {}) {
  const query = trim(q, 80);
  if (query) {
    const like = `%${query}%`;
    return db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM crm_contacts ct WHERE ct.company_id = c.id) AS contacts_count,
        (SELECT COUNT(*) FROM crm_opportunities o WHERE o.company_id = c.id AND o.stage NOT IN ('won','lost')) AS open_deals
      FROM crm_companies c
      WHERE c.name LIKE ? OR IFNULL(c.website,'') LIKE ? OR IFNULL(c.industry,'') LIKE ?
      ORDER BY c.name COLLATE NOCASE
      LIMIT 200
    `).all(like, like, like);
  }
  return db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM crm_contacts ct WHERE ct.company_id = c.id) AS contacts_count,
      (SELECT COUNT(*) FROM crm_opportunities o WHERE o.company_id = c.id AND o.stage NOT IN ('won','lost')) AS open_deals
    FROM crm_companies c
    ORDER BY datetime(c.updated_at) DESC
    LIMIT 200
  `).all();
}

export function createCompany(input = {}) {
  const name = trim(input.name, 160);
  if (!name) throw new ValidationError('Вкажіть назву компанії');
  const result = db.prepare(`
    INSERT INTO crm_companies (name, website, industry, size_band, country, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    name,
    trim(input.website, 200) || null,
    trim(input.industry, 120) || null,
    trim(input.size_band, 40) || null,
    trim(input.country, 80) || null,
    trim(input.notes, 2000) || null,
  );
  return getCompany(result.lastInsertRowid);
}

export function updateCompany(id, input = {}) {
  const existing = getCompany(id);
  if (!existing) throw new NotFoundError('Компанію не знайдено');
  db.prepare(`
    UPDATE crm_companies SET
      name = ?, website = ?, industry = ?, size_band = ?, country = ?, notes = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    trim(input.name, 160) || existing.name,
    input.website !== undefined ? (trim(input.website, 200) || null) : existing.website,
    input.industry !== undefined ? (trim(input.industry, 120) || null) : existing.industry,
    input.size_band !== undefined ? (trim(input.size_band, 40) || null) : existing.size_band,
    input.country !== undefined ? (trim(input.country, 80) || null) : existing.country,
    input.notes !== undefined ? (trim(input.notes, 2000) || null) : existing.notes,
    id,
  );
  return getCompany(id);
}

export function listContacts({ q = '', companyId = null } = {}) {
  const params = [];
  let where = '1=1';
  if (companyId) {
    where += ' AND c.company_id = ?';
    params.push(companyId);
  }
  if (q) {
    const like = `%${trim(q, 80)}%`;
    where += ' AND (c.name LIKE ? OR c.email LIKE ? OR IFNULL(c.job_title,\'\') LIKE ? OR IFNULL(co.name,\'\') LIKE ?)';
    params.push(like, like, like, like);
  }
  return db.prepare(`
    SELECT c.*, co.name AS company_name
    FROM crm_contacts c
    LEFT JOIN crm_companies co ON co.id = c.company_id
    WHERE ${where}
    ORDER BY datetime(c.updated_at) DESC
    LIMIT 300
  `).all(...params);
}

export function createContact(input = {}) {
  const name = trim(input.name, 160);
  const email = normalizeEmail(input.email);
  if (!name) throw new ValidationError('Вкажіть ім\'я контакту');
  if (!email) throw new ValidationError('Вкажіть email контакту');
  const result = db.prepare(`
    INSERT INTO crm_contacts (
      company_id, name, email, phone, job_title, linked_user_id, application_id, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.company_id || null,
    name,
    email,
    trim(input.phone, 40) || null,
    trim(input.job_title, 120) || null,
    input.linked_user_id || null,
    input.application_id || null,
    trim(input.notes, 2000) || null,
  );
  return getContact(result.lastInsertRowid);
}

export function updateContact(id, input = {}) {
  const existing = getContact(id);
  if (!existing) throw new NotFoundError('Контакт не знайдено');
  db.prepare(`
    UPDATE crm_contacts SET
      company_id = ?, name = ?, email = ?, phone = ?, job_title = ?, notes = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    input.company_id !== undefined ? (input.company_id || null) : existing.company_id,
    trim(input.name, 160) || existing.name,
    normalizeEmail(input.email) || existing.email,
    input.phone !== undefined ? (trim(input.phone, 40) || null) : existing.phone,
    input.job_title !== undefined ? (trim(input.job_title, 120) || null) : existing.job_title,
    input.notes !== undefined ? (trim(input.notes, 2000) || null) : existing.notes,
    id,
  );
  return getContact(id);
}

export function createOpportunity(input = {}, actorUserId = null) {
  const title = trim(input.title, 200);
  if (!title) throw new ValidationError('Вкажіть назву угоди');
  const stage = STAGES.includes(input.stage) ? input.stage : 'lead';
  const result = db.prepare(`
    INSERT INTO crm_opportunities (
      company_id, contact_id, title, stage, value, currency, direction_id, program,
      source, intent, team_size, application_id, owner_user_id, expected_close, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.company_id || null,
    input.contact_id || null,
    title,
    stage,
    Number(input.value) || 0,
    trim(input.currency, 8) || 'UAH',
    input.direction_id || null,
    trim(input.program, 160) || null,
    trim(input.source, 80) || 'manual',
    trim(input.intent, 40) || 'individual',
    trim(input.team_size, 40) || null,
    input.application_id || null,
    input.owner_user_id || actorUserId || null,
    trim(input.expected_close, 32) || null,
    trim(input.notes, 2000) || null,
  );
  return getOpportunity(result.lastInsertRowid);
}

export function updateOpportunity(id, input = {}) {
  const existing = getOpportunity(id);
  if (!existing) throw new NotFoundError('Угоду не знайдено');
  if (input.stage && !STAGES.includes(input.stage)) {
    throw new ValidationError('Невірний етап воронки');
  }
  db.prepare(`
    UPDATE crm_opportunities SET
      company_id = ?, contact_id = ?, title = ?, stage = ?, value = ?, currency = ?,
      direction_id = ?, program = ?, source = ?, intent = ?, team_size = ?,
      owner_user_id = ?, expected_close = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    input.company_id !== undefined ? (input.company_id || null) : existing.company_id,
    input.contact_id !== undefined ? (input.contact_id || null) : existing.contact_id,
    trim(input.title, 200) || existing.title,
    input.stage || existing.stage,
    input.value !== undefined ? Number(input.value) || 0 : existing.value,
    input.currency !== undefined ? (trim(input.currency, 8) || 'UAH') : existing.currency,
    input.direction_id !== undefined ? (input.direction_id || null) : existing.direction_id,
    input.program !== undefined ? (trim(input.program, 160) || null) : existing.program,
    input.source !== undefined ? (trim(input.source, 80) || null) : existing.source,
    input.intent !== undefined ? (trim(input.intent, 40) || null) : existing.intent,
    input.team_size !== undefined ? (trim(input.team_size, 40) || null) : existing.team_size,
    input.owner_user_id !== undefined ? (input.owner_user_id || null) : existing.owner_user_id,
    input.expected_close !== undefined ? (trim(input.expected_close, 32) || null) : existing.expected_close,
    input.notes !== undefined ? (trim(input.notes, 2000) || null) : existing.notes,
    id,
  );
  return getOpportunity(id);
}

export function listActivities({ opportunityId = null, companyId = null, limit = 50 } = {}) {
  const params = [];
  let where = '1=1';
  if (opportunityId) {
    where += ' AND a.opportunity_id = ?';
    params.push(opportunityId);
  }
  if (companyId) {
    where += ' AND a.company_id = ?';
    params.push(companyId);
  }
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 200));
  return db.prepare(`
    SELECT a.*, u.name AS author_name
    FROM crm_activities a
    LEFT JOIN users u ON u.id = a.created_by
    WHERE ${where}
    ORDER BY datetime(a.created_at) DESC
    LIMIT ?
  `).all(...params);
}

export function addActivity(input = {}, actorUserId = null) {
  const body = trim(input.body, 4000);
  if (!body) throw new ValidationError('Додайте текст активності');
  const type = ACTIVITY_TYPES.includes(input.type) ? input.type : 'note';
  const result = db.prepare(`
    INSERT INTO crm_activities (
      opportunity_id, company_id, contact_id, type, body, due_at, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.opportunity_id || null,
    input.company_id || null,
    input.contact_id || null,
    type,
    body,
    trim(input.due_at, 32) || null,
    actorUserId || null,
  );
  if (input.opportunity_id) {
    db.prepare(`UPDATE crm_opportunities SET updated_at = datetime('now') WHERE id = ?`)
      .run(input.opportunity_id);
  }
  return db.prepare('SELECT * FROM crm_activities WHERE id = ?').get(result.lastInsertRowid);
}

export function getOpportunityDetail(id) {
  const opportunity = getOpportunity(id);
  if (!opportunity) throw new NotFoundError('Угоду не знайдено');
  return {
    opportunity,
    activities: listActivities({ opportunityId: id, limit: 100 }),
    contact: opportunity.contact_id ? getContact(opportunity.contact_id) : null,
    company: opportunity.company_id ? getCompany(opportunity.company_id) : null,
  };
}

/**
 * Upsert CRM records from a public application (B2B lead capture).
 */
export function ingestApplication(application) {
  if (!application?.email) return null;

  let companyId = null;
  const companyName = trim(application.company_name, 160);
  if (companyName) {
    const existingCompany = db.prepare(`
      SELECT id FROM crm_companies WHERE lower(name) = lower(?) LIMIT 1
    `).get(companyName);
    if (existingCompany) {
      companyId = existingCompany.id;
      db.prepare(`UPDATE crm_companies SET updated_at = datetime('now') WHERE id = ?`).run(companyId);
    } else {
      companyId = createCompany({
        name: companyName,
        size_band: application.team_size || null,
        notes: 'Створено з заявки на сайті',
      }).id;
    }
  }

  const email = normalizeEmail(application.email);
  let contact = db.prepare('SELECT * FROM crm_contacts WHERE email = ? LIMIT 1').get(email);
  if (contact) {
    db.prepare(`
      UPDATE crm_contacts SET
        name = ?, phone = COALESCE(?, phone), job_title = COALESCE(?, job_title),
        company_id = COALESCE(?, company_id), application_id = COALESCE(application_id, ?),
        linked_user_id = COALESCE(linked_user_id, ?),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      trim(application.name, 160) || contact.name,
      trim(application.callback_phone, 40) || null,
      trim(application.job_title, 120) || null,
      companyId,
      application.id || null,
      application.user_id || null,
      contact.id,
    );
    contact = getContact(contact.id);
  } else {
    contact = createContact({
      company_id: companyId,
      name: application.name,
      email,
      phone: application.callback_phone,
      job_title: application.job_title,
      linked_user_id: application.user_id || null,
      application_id: application.id || null,
      notes: application.message || null,
    });
  }

  const existingOpp = application.id
    ? db.prepare('SELECT id FROM crm_opportunities WHERE application_id = ?').get(application.id)
    : null;
  if (existingOpp) return getOpportunity(existingOpp.id);

  const intent = trim(application.intent, 40) || (companyName ? 'corporate' : 'individual');
  const title = companyName
    ? `${companyName} — ${application.program || 'навчання'}`
    : `${application.name} — ${application.program || 'заявка'}`;

  return createOpportunity({
    company_id: companyId,
    contact_id: contact.id,
    title,
    stage: 'lead',
    direction_id: application.direction_id || null,
    program: application.program || null,
    source: 'website',
    intent,
    team_size: application.team_size || null,
    application_id: application.id || null,
    notes: application.message || null,
  });
}

export function syncApplicationStage(applicationId, status) {
  const opp = db.prepare('SELECT id, stage FROM crm_opportunities WHERE application_id = ?')
    .get(applicationId);
  if (!opp) return null;
  let stage = opp.stage;
  if (status === 'approved' && !['won', 'negotiation', 'proposal'].includes(opp.stage)) {
    stage = 'qualified';
  } else if (status === 'rejected') {
    stage = 'lost';
  }
  if (stage !== opp.stage) {
    return updateOpportunity(opp.id, { stage });
  }
  return getOpportunity(opp.id);
}
