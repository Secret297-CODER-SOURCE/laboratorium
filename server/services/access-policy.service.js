import db from '../db/index.js';
import { ValidationError } from '../utils/errors.js';

const SETTINGS_KEY = 'access_policy';

/** Defaults match the hardened isolation shipped with group pods. */
export const DEFAULT_POLICY = {
  conferences: {
    /** student list/join scope */
    studentScope: 'group_only', // group_only | group_and_ungrouped | all
    /** ungrouped rooms (group_id NULL) visible to students when scope allows */
    ungroupedVisibleToStudents: false,
    /** teachers must select a group when creating */
    teacherRequiresGroup: true,
    /** GET by room code requires membership (not just knowing the code) */
    roomCodeRequiresMembership: true,
  },
  leaderboard: {
    studentMode: 'classmates', // classmates | global | hidden
    guestMode: 'hidden', // hidden | global
    teacherSeesGlobal: true,
  },
  ranking: {
    /** group ranking endpoint still requires membership; this only controls points display hint */
    showGlobalPointsInGroup: true,
  },
  dm: {
    studentMode: 'shared_group_or_follow', // shared_group_or_follow | shared_group_only | disabled | anyone
  },
  individualPods: {
    enabled: true,
    maxMembers: 1,
    allowTeacherCreate: true,
  },
  recordings: {
    /** members of conference group can view even if not participants */
    groupMembersCanView: true,
  },
};

const ENUMS = {
  conferences_studentScope: ['group_only', 'group_and_ungrouped', 'all'],
  leaderboard_studentMode: ['classmates', 'global', 'hidden'],
  leaderboard_guestMode: ['hidden', 'global'],
  dm_studentMode: ['shared_group_or_follow', 'shared_group_only', 'disabled', 'anyone'],
};

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

function loadRaw() {
  const row = db.prepare('SELECT value FROM platform_settings WHERE key = ?').get(SETTINGS_KEY);
  if (!row?.value) return {};
  try {
    return JSON.parse(row.value) || {};
  } catch {
    return {};
  }
}

export function getPolicy() {
  return deepMerge(DEFAULT_POLICY, loadRaw());
}

export function getPolicyMeta() {
  return {
    policy: getPolicy(),
    defaults: DEFAULT_POLICY,
    enums: {
      conferences: { studentScope: ENUMS.conferences_studentScope },
      leaderboard: {
        studentMode: ENUMS.leaderboard_studentMode,
        guestMode: ENUMS.leaderboard_guestMode,
      },
      dm: { studentMode: ENUMS.dm_studentMode },
    },
    labels: {
      conferences: {
        studentScope: {
          group_only: 'Лише свої групи / pods',
          group_and_ungrouped: 'Свої групи + загальні кімнати без групи',
          all: 'Усі конференції (не рекомендується)',
        },
        ungroupedVisibleToStudents: 'Показувати учням кімнати без групи',
        teacherRequiresGroup: 'Викладач зобовʼязаний обрати групу/pod',
        roomCodeRequiresMembership: 'Код кімнати не відкриває доступ стороннім',
      },
      leaderboard: {
        studentMode: {
          classmates: 'Лише одногрупники',
          global: 'Глобальний топ',
          hidden: 'Приховати для учнів',
        },
        guestMode: {
          hidden: 'Приховати для гостей',
          global: 'Публічний глобальний топ',
        },
        teacherSeesGlobal: 'Викладачі бачать глобальний рейтинг',
      },
      dm: {
        studentMode: {
          shared_group_or_follow: 'Спільна група або взаємна підписка',
          shared_group_only: 'Лише спільна група',
          disabled: 'DM між учнями вимкнено',
          anyone: 'Будь-кому (не рекомендується)',
        },
      },
      individualPods: {
        enabled: 'Дозволити індивідуальні pods',
        allowTeacherCreate: 'Викладачі можуть створювати pods',
        maxMembers: 'Макс. учнів у pod',
      },
      recordings: {
        groupMembersCanView: 'Учасники групи бачать записи конференцій групи',
      },
      ranking: {
        showGlobalPointsInGroup: 'У рейтингу групи показувати глобальні bounty-бали',
      },
    },
  };
}

function assertEnum(path, value, allowed) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`Невірне значення ${path}: ${value}`);
  }
}

export function savePolicy(raw) {
  if (!raw || typeof raw !== 'object') throw new ValidationError('policy має бути обʼєктом');
  const current = getPolicy();
  const next = deepMerge(current, raw);

  assertEnum('conferences.studentScope', next.conferences.studentScope, ENUMS.conferences_studentScope);
  assertEnum('leaderboard.studentMode', next.leaderboard.studentMode, ENUMS.leaderboard_studentMode);
  assertEnum('leaderboard.guestMode', next.leaderboard.guestMode, ENUMS.leaderboard_guestMode);
  assertEnum('dm.studentMode', next.dm.studentMode, ENUMS.dm_studentMode);

  next.conferences.ungroupedVisibleToStudents = !!next.conferences.ungroupedVisibleToStudents;
  next.conferences.teacherRequiresGroup = !!next.conferences.teacherRequiresGroup;
  next.conferences.roomCodeRequiresMembership = !!next.conferences.roomCodeRequiresMembership;
  next.leaderboard.teacherSeesGlobal = !!next.leaderboard.teacherSeesGlobal;
  next.ranking.showGlobalPointsInGroup = !!next.ranking.showGlobalPointsInGroup;
  next.individualPods.enabled = !!next.individualPods.enabled;
  next.individualPods.allowTeacherCreate = !!next.individualPods.allowTeacherCreate;
  next.individualPods.maxMembers = Math.max(1, Math.min(5, parseInt(next.individualPods.maxMembers, 10) || 1));
  next.recordings.groupMembersCanView = !!next.recordings.groupMembersCanView;

  // Consistency: if ungrouped visible, bump scope when it was group_only
  if (next.conferences.ungroupedVisibleToStudents && next.conferences.studentScope === 'group_only') {
    next.conferences.studentScope = 'group_and_ungrouped';
  }
  if (!next.conferences.ungroupedVisibleToStudents && next.conferences.studentScope === 'group_and_ungrouped') {
    next.conferences.ungroupedVisibleToStudents = false;
  }

  db.prepare(`
    INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(SETTINGS_KEY, JSON.stringify(next));

  return getPolicyMeta();
}

export function resetPolicy() {
  db.prepare('DELETE FROM platform_settings WHERE key = ?').run(SETTINGS_KEY);
  return getPolicyMeta();
}
