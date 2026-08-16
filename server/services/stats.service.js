import db from '../db/index.js';
import * as groupService from './group.service.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import { formatDuration, secondsBetween } from '../utils/time.js';

function getScope(actorId, actorRole) {
  const groups = groupService.listGroups(actorId, actorRole);
  const groupIds = groups.map(g => g.id);
  if (!groupIds.length) {
    return { groups, groupIds, studentIds: [], students: [] };
  }

  const placeholders = groupIds.map(() => '?').join(',');
  const students = db.prepare(`
    SELECT DISTINCT u.id, u.name, u.handle, u.bounty_points
    FROM users u
    JOIN study_group_members gm ON gm.user_id = u.id
    WHERE gm.group_id IN (${placeholders})
    ORDER BY u.name COLLATE NOCASE
  `).all(...groupIds);

  return {
    groups,
    groupIds,
    studentIds: students.map(s => s.id),
    students,
  };
}

function assertStudentInScope(scope, studentId) {
  if (!scope.studentIds.includes(studentId)) {
    throw new ForbiddenError('Немає доступу до цього учня');
  }
}

function assertTaskInScope(scope, taskId) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND is_active = 1').get(taskId);
  if (!task) throw new NotFoundError('Задачу не знайдено');
  if (!scope.groupIds.includes(task.group_id)) throw new ForbiddenError('Немає доступу');
  return task;
}

function assertQuizInScope(scope, quizId) {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ? AND is_active = 1').get(quizId);
  if (!quiz) throw new NotFoundError('Тест не знайдено');
  if (!quiz.group_id || !scope.groupIds.includes(quiz.group_id)) {
    throw new ForbiddenError('Немає доступу');
  }
  return quiz;
}

function mapTaskAssignmentRow(row) {
  const work = row.work_duration_seconds
    ?? secondsBetween(row.taken_at, row.submitted_at);
  const total = row.duration_seconds
    ?? secondsBetween(row.taken_at, row.completed_at);
  return {
    id: row.assignment_id ?? row.id,
    task_id: row.task_id,
    title: row.title,
    group_name: row.group_name,
    status: row.status,
    taken_at: row.taken_at,
    submitted_at: row.submitted_at,
    completed_at: row.completed_at,
    work_duration_seconds: work,
    duration_seconds: total,
    work_duration_label: formatDuration(work),
    duration_label: formatDuration(total),
    time_limit_minutes: row.time_limit_minutes,
    student_name: row.student_name,
    student_handle: row.student_handle,
    user_id: row.user_id,
  };
}

export function getOverview(actorId, actorRole) {
  const scope = getScope(actorId, actorRole);
  if (!scope.groupIds.length) {
    return {
      summary: {
        students: 0,
        tasks_completed: 0,
        quizzes_passed: 0,
        challenges_completed: 0,
        avg_duration_seconds: null,
      },
      leaderboard: [],
      tasks: [],
      quizzes: [],
    };
  }

  const ph = scope.groupIds.map(() => '?').join(',');

  const taskRows = db.prepare(`
    SELECT t.id, t.title, t.group_id, g.name as group_name, t.time_limit_minutes,
      (SELECT COUNT(*) FROM task_assignments ta WHERE ta.task_id = t.id) as total_assignments,
      (SELECT COUNT(*) FROM task_assignments ta WHERE ta.task_id = t.id AND ta.status = 'completed') as completed_count,
      (SELECT AVG(ta.duration_seconds) FROM task_assignments ta
        WHERE ta.task_id = t.id AND ta.status = 'completed' AND ta.duration_seconds IS NOT NULL) as avg_duration_seconds,
      (SELECT AVG(ta.work_duration_seconds) FROM task_assignments ta
        WHERE ta.task_id = t.id AND ta.work_duration_seconds IS NOT NULL) as avg_work_seconds
    FROM tasks t
    JOIN study_groups g ON g.id = t.group_id
    WHERE t.group_id IN (${ph}) AND t.is_active = 1
    ORDER BY t.created_at DESC
  `).all(...scope.groupIds);

  const quizRows = db.prepare(`
    SELECT q.id, q.title, q.group_id, g.name as group_name, q.time_limit_minutes,
      (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.submitted_at IS NOT NULL) as attempts_count,
      (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.passed = 1) as passed_count,
      (SELECT AVG(qa.duration_seconds) FROM quiz_attempts qa
        WHERE qa.quiz_id = q.id AND qa.duration_seconds IS NOT NULL) as avg_duration_seconds,
      (SELECT AVG(qa.score_percent) FROM quiz_attempts qa
        WHERE qa.quiz_id = q.id AND qa.submitted_at IS NOT NULL) as avg_score_percent
    FROM quizzes q
    LEFT JOIN study_groups g ON g.id = q.group_id
    WHERE q.group_id IN (${ph}) AND q.is_active = 1
    ORDER BY q.created_at DESC
  `).all(...scope.groupIds);

  const leaderboard = scope.students.map(student => {
    const tasksCompleted = db.prepare(`
      SELECT COUNT(*) as c FROM task_assignments ta
      JOIN tasks t ON t.id = ta.task_id
      WHERE ta.user_id = ? AND ta.status = 'completed' AND t.group_id IN (${ph})
    `).get(student.id, ...scope.groupIds).c;

    const quizzesPassed = db.prepare(`
      SELECT COUNT(*) as c FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.user_id = ? AND qa.passed = 1 AND q.group_id IN (${ph})
    `).get(student.id, ...scope.groupIds).c;

    const challengesCompleted = db.prepare(`
      SELECT COUNT(*) as c FROM challenge_completions cc
      WHERE cc.user_id = ?
    `).get(student.id).c;

    const avgTask = db.prepare(`
      SELECT AVG(ta.duration_seconds) as avg FROM task_assignments ta
      JOIN tasks t ON t.id = ta.task_id
      WHERE ta.user_id = ? AND ta.status = 'completed'
        AND ta.duration_seconds IS NOT NULL AND t.group_id IN (${ph})
    `).get(student.id, ...scope.groupIds).avg;

    const avgQuiz = db.prepare(`
      SELECT AVG(qa.duration_seconds) as avg FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.user_id = ? AND qa.duration_seconds IS NOT NULL AND q.group_id IN (${ph})
    `).get(student.id, ...scope.groupIds).avg;

    const durations = [avgTask, avgQuiz].filter(v => v != null);
    const avgDuration = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

    return {
      user_id: student.id,
      name: student.name,
      handle: student.handle,
      bounty_points: student.bounty_points,
      tasks_completed: tasksCompleted,
      quizzes_passed: quizzesPassed,
      challenges_completed: challengesCompleted,
      total_completions: tasksCompleted + quizzesPassed + challengesCompleted,
      avg_duration_seconds: avgDuration,
      avg_duration_label: formatDuration(avgDuration),
    };
  }).sort((a, b) => {
    if (b.total_completions !== a.total_completions) {
      return b.total_completions - a.total_completions;
    }
    if ((a.avg_duration_seconds ?? Infinity) !== (b.avg_duration_seconds ?? Infinity)) {
      return (a.avg_duration_seconds ?? Infinity) - (b.avg_duration_seconds ?? Infinity);
    }
    return b.bounty_points - a.bounty_points;
  }).map((row, i) => ({ rank: i + 1, ...row }));

  const summaryTasks = leaderboard.reduce((s, r) => s + r.tasks_completed, 0);
  const summaryQuizzes = leaderboard.reduce((s, r) => s + r.quizzes_passed, 0);
  const summaryChallenges = leaderboard.reduce((s, r) => s + r.challenges_completed, 0);
  const avgAll = leaderboard
    .map(r => r.avg_duration_seconds)
    .filter(v => v != null);
  const summaryAvg = avgAll.length
    ? Math.round(avgAll.reduce((a, b) => a + b, 0) / avgAll.length)
    : null;

  return {
    summary: {
      students: scope.students.length,
      tasks_completed: summaryTasks,
      quizzes_passed: summaryQuizzes,
      challenges_completed: summaryChallenges,
      avg_duration_seconds: summaryAvg,
      avg_duration_label: formatDuration(summaryAvg),
    },
    leaderboard,
    tasks: taskRows.map(t => ({
      ...t,
      avg_duration_label: formatDuration(t.avg_duration_seconds != null ? Math.round(t.avg_duration_seconds) : null),
      avg_work_label: formatDuration(t.avg_work_seconds != null ? Math.round(t.avg_work_seconds) : null),
      completion_rate: t.total_assignments
        ? Math.round((t.completed_count / t.total_assignments) * 100)
        : 0,
    })),
    quizzes: quizRows.map(q => ({
      ...q,
      avg_duration_label: formatDuration(q.avg_duration_seconds != null ? Math.round(q.avg_duration_seconds) : null),
      avg_score_percent: q.avg_score_percent != null ? Math.round(q.avg_score_percent) : null,
      pass_rate: q.attempts_count
        ? Math.round((q.passed_count / q.attempts_count) * 100)
        : 0,
    })),
  };
}

export function getStudentDetail(actorId, actorRole, studentId) {
  const scope = getScope(actorId, actorRole);
  assertStudentInScope(scope, studentId);
  const ph = scope.groupIds.map(() => '?').join(',');

  const student = db.prepare('SELECT id, name, handle, bounty_points, email FROM users WHERE id = ?')
    .get(studentId);

  const tasks = db.prepare(`
    SELECT ta.id as assignment_id, ta.*, t.title, t.time_limit_minutes, g.name as group_name
    FROM task_assignments ta
    JOIN tasks t ON t.id = ta.task_id
    JOIN study_groups g ON g.id = t.group_id
    WHERE ta.user_id = ? AND t.group_id IN (${ph}) AND t.is_active = 1
    ORDER BY COALESCE(ta.completed_at, ta.submitted_at, ta.taken_at, t.created_at) DESC
  `).all(studentId, ...scope.groupIds).map(mapTaskAssignmentRow);

  const quizzes = db.prepare(`
    SELECT qa.*, q.title, q.pass_percent, q.time_limit_minutes, g.name as group_name
    FROM quiz_attempts qa
    JOIN quizzes q ON q.id = qa.quiz_id
    WHERE qa.user_id = ? AND q.group_id IN (${ph}) AND qa.submitted_at IS NOT NULL
    ORDER BY qa.submitted_at DESC
  `).all(studentId, ...scope.groupIds).map(q => ({
    quiz_id: q.quiz_id,
    title: q.title,
    group_name: q.group_name,
    score_percent: q.score_percent,
    passed: !!q.passed,
    started_at: q.started_at,
    submitted_at: q.submitted_at,
    duration_seconds: q.duration_seconds,
    duration_label: formatDuration(q.duration_seconds),
    time_limit_minutes: q.time_limit_minutes,
  }));

  const challenges = db.prepare(`
    SELECT cc.*, c.title, c.difficulty, c.bounty_reward
    FROM challenge_completions cc
    JOIN challenges c ON c.id = cc.challenge_id
    WHERE cc.user_id = ?
    ORDER BY cc.completed_at DESC
  `).all(studentId).map(c => ({
    challenge_id: c.challenge_id,
    title: c.title,
    difficulty: c.difficulty,
    bounty_reward: c.bounty_reward,
    started_at: c.started_at,
    completed_at: c.completed_at,
    duration_seconds: c.duration_seconds,
    duration_label: formatDuration(c.duration_seconds),
  }));

  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const passedQuizzes = quizzes.filter(q => q.passed).length;

  return {
    student,
    summary: {
      tasks_completed: completedTasks,
      quizzes_passed: passedQuizzes,
      challenges_completed: challenges.length,
      total_completions: completedTasks + passedQuizzes + challenges.length,
    },
    tasks,
    quizzes,
    challenges,
  };
}

export function getTaskDetail(actorId, actorRole, taskId) {
  const scope = getScope(actorId, actorRole);
  const task = assertTaskInScope(scope, taskId);

  const group = db.prepare('SELECT name FROM study_groups WHERE id = ?').get(task.group_id);

  const assignments = db.prepare(`
    SELECT ta.id as assignment_id, ta.*, u.name as student_name, u.handle as student_handle
    FROM task_assignments ta
    JOIN users u ON u.id = ta.user_id
    WHERE ta.task_id = ?
    ORDER BY
      CASE ta.status WHEN 'completed' THEN 0 WHEN 'review' THEN 1 WHEN 'taken' THEN 2 ELSE 3 END,
      ta.completed_at DESC, ta.submitted_at DESC
  `).all(taskId).map(row => mapTaskAssignmentRow({
    ...row,
    title: task.title,
    group_name: group?.name,
    time_limit_minutes: task.time_limit_minutes,
  }));

  const completed = assignments.filter(a => a.status === 'completed');
  const avgDuration = completed.length
    ? Math.round(completed.reduce((s, a) => s + (a.duration_seconds || 0), 0) / completed.length)
    : null;

  return {
    task: {
      ...task,
      group_name: group?.name,
      time_limit_minutes: task.time_limit_minutes,
    },
    summary: {
      total: assignments.length,
      completed: completed.length,
      in_review: assignments.filter(a => a.status === 'review').length,
      in_progress: assignments.filter(a => a.status === 'taken').length,
      avg_duration_seconds: avgDuration,
      avg_duration_label: formatDuration(avgDuration),
    },
    assignments,
  };
}

export function getQuizDetail(actorId, actorRole, quizId) {
  const scope = getScope(actorId, actorRole);
  const quiz = assertQuizInScope(scope, quizId);
  const group = quiz.group_id
    ? db.prepare('SELECT name FROM study_groups WHERE id = ?').get(quiz.group_id)
    : null;

  const attempts = db.prepare(`
    SELECT qa.*, u.name as student_name, u.handle as student_handle
    FROM quiz_attempts qa
    JOIN users u ON u.id = qa.user_id
    WHERE qa.quiz_id = ? AND qa.submitted_at IS NOT NULL
    ORDER BY qa.score_percent DESC, qa.duration_seconds ASC
  `).all(quizId).map(a => ({
    user_id: a.user_id,
    student_name: a.student_name,
    student_handle: a.student_handle,
    score_percent: a.score_percent,
    passed: !!a.passed,
    started_at: a.started_at,
    submitted_at: a.submitted_at,
    duration_seconds: a.duration_seconds,
    duration_label: formatDuration(a.duration_seconds),
  }));

  const passed = attempts.filter(a => a.passed);
  const avgDuration = attempts.length
    ? Math.round(attempts.reduce((s, a) => s + (a.duration_seconds || 0), 0) / attempts.length)
    : null;
  const avgScore = attempts.length
    ? Math.round(attempts.reduce((s, a) => s + (a.score_percent || 0), 0) / attempts.length)
    : null;

  return {
    quiz: { ...quiz, group_name: group?.name },
    summary: {
      attempts: attempts.length,
      passed: passed.length,
      pass_rate: attempts.length ? Math.round((passed.length / attempts.length) * 100) : 0,
      avg_score_percent: avgScore,
      avg_duration_seconds: avgDuration,
      avg_duration_label: formatDuration(avgDuration),
    },
    attempts,
  };
}
