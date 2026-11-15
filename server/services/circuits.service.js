import db from '../db/index.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';

const STAFF_ROLES = new Set(['owner', 'developer', 'teacher']);

const WOKWI_TEMPLATES = {
  blink: {
    title: 'Blink LED',
    external_id: 'blink',
    embed_url: 'https://wokwi.com/projects/new/arduino-uno',
    metadata: {
      sketch: `void setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(500);\n  digitalWrite(13, LOW);\n  delay(500);\n}\n`,
      diagram: {
        version: 1,
        author: 'laboratorium',
        editor: 'wokwi',
        parts: [
          { type: 'wokwi-arduino-uno', id: 'uno', top: 0, left: 0, attrs: {} },
          { type: 'wokwi-led', id: 'led1', top: 100, left: 200, attrs: { color: 'red' } },
          { type: 'wokwi-resistor', id: 'r1', top: 140, left: 140, attrs: { value: '220' } },
        ],
        connections: [
          ['uno:13', 'r1:1', 'green', []],
          ['r1:2', 'led1:A', 'green', []],
          ['led1:C', 'uno:GND.1', 'black', []],
        ],
      },
      hints: [
        { id: 'has_led', label: 'Є LED', check: 'led' },
        { id: 'has_resistor', label: 'Є резистор на LED', check: 'resistor' },
        { id: 'gpio_wired', label: 'GPIO підключено до LED', check: 'gpio_led' },
      ],
    },
  },
  button: {
    title: 'LED + кнопка',
    external_id: 'button-led',
    embed_url: 'https://wokwi.com/projects/new/arduino-uno',
    metadata: {
      sketch: `const int LED = 13;\nconst int BTN = 2;\n\nvoid setup() {\n  pinMode(LED, OUTPUT);\n  pinMode(BTN, INPUT_PULLUP);\n}\n\nvoid loop() {\n  digitalWrite(LED, digitalRead(BTN) == LOW ? HIGH : LOW);\n}\n`,
      diagram: {
        version: 1,
        parts: [
          { type: 'wokwi-arduino-uno', id: 'uno', top: 0, left: 0, attrs: {} },
          { type: 'wokwi-led', id: 'led1', top: 80, left: 220, attrs: { color: 'green' } },
          { type: 'wokwi-resistor', id: 'r1', top: 120, left: 160, attrs: { value: '220' } },
          { type: 'wokwi-pushbutton', id: 'btn1', top: 200, left: 200, attrs: {} },
        ],
        connections: [
          ['uno:13', 'r1:1', 'green', []],
          ['r1:2', 'led1:A', 'green', []],
          ['led1:C', 'uno:GND.1', 'black', []],
          ['uno:2', 'btn1:1.l', 'blue', []],
          ['btn1:2.r', 'uno:GND.2', 'black', []],
        ],
      },
      hints: [
        { id: 'has_led', label: 'Є LED', check: 'led' },
        { id: 'has_button', label: 'Є кнопка', check: 'button' },
        { id: 'has_resistor', label: 'Є резистор', check: 'resistor' },
      ],
    },
  },
  uart: {
    title: 'UART Serial',
    external_id: 'uart',
    embed_url: 'https://wokwi.com/projects/new/arduino-uno',
    metadata: {
      sketch: `void setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  Serial.println("ping");\n  delay(1000);\n}\n`,
      diagram: {
        version: 1,
        parts: [{ type: 'wokwi-arduino-uno', id: 'uno', top: 0, left: 0, attrs: {} }],
        connections: [],
      },
      hints: [{ id: 'has_mcu', label: 'Є Arduino', check: 'mcu' }],
    },
  },
  i2c: {
    title: 'I2C sensor mock',
    external_id: 'i2c',
    embed_url: 'https://wokwi.com/projects/new/arduino-uno',
    metadata: {
      sketch: `#include <Wire.h>\n\nvoid setup() {\n  Wire.begin();\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  Wire.requestFrom(0x48, 2);\n  while (Wire.available()) Serial.write(Wire.read());\n  delay(500);\n}\n`,
      diagram: {
        version: 1,
        parts: [
          { type: 'wokwi-arduino-uno', id: 'uno', top: 0, left: 0, attrs: {} },
          { type: 'wokwi-mpu6050', id: 'imu1', top: 120, left: 240, attrs: {} },
        ],
        connections: [
          ['uno:A4', 'imu1:SDA', 'blue', []],
          ['uno:A5', 'imu1:SCL', 'green', []],
          ['uno:5V', 'imu1:VCC', 'red', []],
          ['uno:GND.1', 'imu1:GND', 'black', []],
        ],
      },
      hints: [
        { id: 'has_mcu', label: 'Є Arduino', check: 'mcu' },
        { id: 'has_i2c', label: 'Є I2C пристрій', check: 'i2c' },
      ],
    },
  },
};

function canUseCircuits(userId, role) {
  if (STAFF_ROLES.has(role)) return true;
  const row = db.prepare(`
    SELECT 1 FROM study_group_members gm
    JOIN study_groups g ON g.id = gm.group_id AND g.is_active = 1
    JOIN programs p ON p.id = g.program_id
    JOIN directions d ON d.id = p.direction_id AND d.is_programming = 1
    WHERE gm.user_id = ?
    LIMIT 1
  `).get(userId);
  return !!row;
}

function assertCanUse(userId, role) {
  if (!canUseCircuits(userId, role)) {
    throw new ForbiddenError('Circuits доступні учасникам програмістських напрямків');
  }
}

function mapProject(row) {
  if (!row) return null;
  let metadata = null;
  try { metadata = row.metadata ? JSON.parse(row.metadata) : null; } catch { metadata = null; }
  return {
    id: row.id,
    user_id: row.user_id,
    kind: row.kind,
    title: row.title,
    external_id: row.external_id,
    embed_url: row.embed_url,
    workspace_id: row.workspace_id,
    metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function getInfo(userId, role) {
  return {
    canUse: canUseCircuits(userId, role),
    templates: Object.entries(WOKWI_TEMPLATES).map(([id, t]) => ({ id, title: t.title, kind: 'wokwi' })),
  };
}

export function listMine(userId) {
  return db.prepare(`
    SELECT * FROM circuit_projects WHERE user_id = ? ORDER BY updated_at DESC
  `).all(userId).map(mapProject);
}

function getOwned(userId, id, role) {
  const row = db.prepare('SELECT * FROM circuit_projects WHERE id = ?').get(id);
  if (!row) throw new NotFoundError('Проєкт схеми не знайдено');
  if (row.user_id !== userId && !STAFF_ROLES.has(role)) {
    throw new ForbiddenError('Це не ваш проєкт');
  }
  return row;
}

export function getOne(userId, id, role) {
  return mapProject(getOwned(userId, id, role));
}

export function createFromTemplate(userId, role, { template, title }) {
  assertCanUse(userId, role);
  const tpl = WOKWI_TEMPLATES[template];
  if (!tpl) throw new ValidationError('Невідомий шаблон');
  const result = db.prepare(`
    INSERT INTO circuit_projects (user_id, kind, title, external_id, embed_url, metadata)
    VALUES (?, 'wokwi', ?, ?, ?, ?)
  `).run(
    userId,
    String(title || tpl.title).trim().slice(0, 120),
    tpl.external_id,
    tpl.embed_url,
    JSON.stringify(tpl.metadata),
  );
  return getOne(userId, Number(result.lastInsertRowid), role);
}

export function create(userId, role, body) {
  assertCanUse(userId, role);
  const kind = body.kind === 'easyeda' ? 'easyeda' : 'wokwi';
  const title = String(body.title || '').trim().slice(0, 120);
  if (!title) throw new ValidationError('Вкажіть назву');

  let embed_url = String(body.embed_url || '').trim();
  let external_id = String(body.external_id || '').trim().slice(0, 120) || null;

  if (kind === 'wokwi') {
    if (external_id && /^\d+$/.test(external_id)) {
      embed_url = `https://wokwi.com/projects/${external_id}`;
    } else if (embed_url) {
      try {
        const u = new URL(embed_url);
        if (!u.hostname.endsWith('wokwi.com')) throw new Error('host');
      } catch {
        throw new ValidationError('Embed URL має бути з wokwi.com');
      }
    } else {
      embed_url = 'https://wokwi.com/projects/new/arduino-uno';
    }
  } else {
    if (!embed_url) throw new ValidationError('Для EasyEDA потрібне посилання на проєкт');
    try {
      const u = new URL(embed_url);
      if (!u.hostname.includes('easyeda') && !u.hostname.includes('oshwlab')) {
        throw new Error('host');
      }
    } catch {
      throw new ValidationError('EasyEDA URL має бути з easyeda.com / oshwlab.com');
    }
  }

  const metadata = body.metadata && typeof body.metadata === 'object'
    ? JSON.stringify(body.metadata)
    : (body.metadata ? String(body.metadata).slice(0, 100_000) : null);

  const result = db.prepare(`
    INSERT INTO circuit_projects (user_id, kind, title, external_id, embed_url, workspace_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    kind,
    title,
    external_id,
    embed_url,
    body.workspace_id ? parseInt(body.workspace_id, 10) : null,
    metadata,
  );
  return getOne(userId, Number(result.lastInsertRowid), role);
}

export function update(userId, id, body, role) {
  const row = getOwned(userId, id, role);
  const title = body.title != null ? String(body.title).trim().slice(0, 120) : row.title;
  const embed_url = body.embed_url != null ? String(body.embed_url).trim() : row.embed_url;
  const external_id = body.external_id != null ? String(body.external_id).trim().slice(0, 120) : row.external_id;
  let metadata = row.metadata;
  if (body.metadata !== undefined) {
    metadata = typeof body.metadata === 'object' ? JSON.stringify(body.metadata) : String(body.metadata || '');
  }
  db.prepare(`
    UPDATE circuit_projects
    SET title = ?, embed_url = ?, external_id = ?, metadata = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(title, embed_url, external_id, metadata, id);
  return getOne(userId, id, role);
}

export function remove(userId, id, role) {
  getOwned(userId, id, role);
  db.prepare('DELETE FROM circuit_projects WHERE id = ?').run(id);
  return { ok: true };
}

/** Rule-based lesson diagnostics from diagram.json — not SPICE. */
export function diagnose(userId, id, role) {
  const project = getOne(userId, id, role);
  const diagram = project.metadata?.diagram;
  const hintDefs = project.metadata?.hints || [];
  if (!diagram?.parts) {
    return { ok: true, checks: [], tips: ['Немає diagram.json — відкрийте Wokwi і збережіть схему, або створіть з шаблону.'] };
  }
  const types = (diagram.parts || []).map((p) => String(p.type || '').toLowerCase());
  const conns = diagram.connections || [];
  const has = (needle) => types.some((t) => t.includes(needle));

  const runners = {
    led: () => has('led'),
    resistor: () => has('resistor'),
    button: () => has('pushbutton') || has('button'),
    mcu: () => has('arduino') || has('esp32') || has('pico'),
    i2c: () => has('mpu') || has('ssd1306') || has('bmp') || has('aht') || conns.some((c) => String(c).includes('SDA')),
    gpio_led: () => {
      if (!has('led')) return false;
      return conns.some((c) => {
        const s = JSON.stringify(c).toLowerCase();
        return s.includes('led') && (s.includes(':13') || s.includes(':12') || s.includes(':11') || s.includes('gpio'));
      });
    },
  };

  const checks = hintDefs.map((h) => {
    const fn = runners[h.check];
    const pass = fn ? !!fn() : false;
    return { id: h.id, label: h.label, pass };
  });

  const tips = [];
  if (!has('resistor') && has('led')) {
    tips.push('Немає резистора на LED — додайте ~220Ω послідовно з діодом.');
  }
  if (has('led') && !runners.gpio_led()) {
    tips.push('GPIO не підключено до LED — проведіть дріт від цифрового піна Arduino до анода через резистор.');
  }
  if (!has('arduino') && !has('esp')) {
    tips.push('У схемі немає мікроконтролера.');
  }

  return {
    ok: checks.every((c) => c.pass),
    checks,
    tips,
  };
}

export function staffGet(projectId) {
  const row = db.prepare('SELECT * FROM circuit_projects WHERE id = ?').get(projectId);
  if (!row) throw new NotFoundError('Проєкт схеми не знайдено');
  return mapProject(row);
}
