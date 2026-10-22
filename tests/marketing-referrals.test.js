import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  setTestEnv, startServer, stopServer, api, createUserDirect,
} from '../adversarial-review/helpers/setup.js';
import { runMigrations } from '../server/db/migrate.js';
import { getCtfAwards } from '../server/services/achievement.service.js';
import { renderAchievementCard } from '../public/achievement-cards.js';

let ctx;
let owner;
let referrer;
let referred;
let ownerToken;
let referrerToken;
let referredToken;
let referralService;
let contentService;
let calendarService;

before(async () => {
  const { dbPath } = setTestEnv({
    ALLOW_PUBLIC_REGISTRATION: 'false',
    OWNER_EMAIL: 'seed.owner@lab.dev',
    OWNER_PASSWORD: 'SeedOwnerPassword123!',
  });
  ctx = { ...(await startServer()), dbPath };
  referralService = await import('../server/services/referral.service.js');
  contentService = await import('../server/services/content.service.js');
  calendarService = await import('../server/services/calendar.service.js');
  owner = createUserDirect(ctx.db, {
    email: 'marketing.owner@lab.dev', password: 'Password123!', role: 'owner', handle: 'marketing_owner',
  });
  referrer = createUserDirect(ctx.db, {
    email: 'marketing.student@lab.dev', password: 'Password123!', role: 'student', handle: 'marketing_student',
  });
  referred = createUserDirect(ctx.db, {
    email: 'referred.student@lab.dev', password: 'Password123!', role: 'student', handle: 'referred_student',
  });
  ownerToken = (await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST', body: { login: owner.email, password: 'Password123!' },
  })).data.token;
  referrerToken = (await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST', body: { login: referrer.email, password: 'Password123!' },
  })).data.token;
  referredToken = (await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST', body: { login: referred.email, password: 'Password123!' },
  })).data.token;
});

after(async () => {
  await stopServer(ctx.server, ctx.dbPath);
});

test('campaign analytics stores daily anonymous aggregates and referral rewards/credits are reversible', async () => {
  const settings = await api(ctx.baseUrl, '/api/admin/marketing/referrals', {
    method: 'PATCH',
    token: ownerToken,
    body: { enabled: true, reward_points: 5, credit_amount: 20, max_rewards_per_user: 1 },
  });

  assert.equal(settings.status, 200, JSON.stringify(settings.data));

  const referralResponse = await api(ctx.baseUrl, '/api/referrals/me', { token: referrerToken });
  assert.equal(referralResponse.status, 200);
  const referralCode = referralResponse.data.referral.code;
  referralService.assignReferrerToUser(referred.id, referralCode);

  const marketingOverview = await api(ctx.baseUrl, '/api/admin/marketing?year=2030&month=1', {
    token: ownerToken,
  });
  assert.equal(marketingOverview.status, 200, JSON.stringify(marketingOverview.data));
  const initialReferralStats = marketingOverview.data.referrals.find(row => row.code === referralCode);
  assert.equal(initialReferralStats.registered_students, 1);

  const campaignResponse = await api(ctx.baseUrl, '/api/admin/marketing/campaigns', {
    method: 'POST',
    token: ownerToken,
    body: {
      label: 'Course landing',
      source: 'instagram',
      medium: 'social',
      campaign: 'course-launch',
      destination: '/course.html?id=1',
    },
  });
  assert.equal(campaignResponse.status, 201, JSON.stringify(campaignResponse.data));
  const campaign = campaignResponse.data.campaign;
  assert.match(campaign.url, /course\.html\?id=1&/);
  assert.match(campaign.url, new RegExp(`campaign_code=${campaign.code}`));

  const deniedAnalytics = await api(ctx.baseUrl, '/api/analytics/events', {
    method: 'POST',
    body: { event_type: 'page_view', path: '/', consent: false },
  });
  assert.equal(deniedAnalytics.status, 204);
  assert.equal((await api(ctx.baseUrl, '/api/analytics/events', {
    method: 'POST',
    body: { event_type: 'page_view', path: '/', consent: false },
  })).status, 204);
  assert.equal(ctx.db.prepare(`
    SELECT count FROM analytics_daily_aggregates
    WHERE event_type = 'page_view' AND path = '/' AND source = ''
  `).get().count, 2);

  const analytics = await api(ctx.baseUrl, '/api/analytics/events', {
    method: 'POST',
    body: {
      event_type: 'page_view', path: '/', consent: true, source: 'instagram',
      medium: 'social', campaign: 'course-launch', campaign_code: campaign.code,
    },
  });
  assert.equal(analytics.status, 204);

  for (const event of [
    { event_type: 'click', path: '/course.html?id=1', detail: '/login.html', source: 'instagram', medium: 'social', campaign: 'course-launch', campaign_code: campaign.code },
    { event_type: 'page_duration', path: '/course.html?id=1', detail: '30-120s' },
    { event_type: 'login', path: '/login.html', source: 'instagram', campaign_code: campaign.code },
    { event_type: 'application_submitted', path: '/', source: 'instagram', campaign: 'course-launch', campaign_code: campaign.code },
  ]) {
    assert.equal((await api(ctx.baseUrl, '/api/analytics/events', { method: 'POST', body: event })).status, 204);
  }
  const now = new Date();
  const anonymousOverview = await api(ctx.baseUrl, `/api/admin/marketing?year=${now.getFullYear()}&month=${now.getMonth() + 1}`, {
    token: ownerToken,
  });
  assert.equal(anonymousOverview.data.analytics.logins, 1);
  assert.equal(anonymousOverview.data.analytics.clicks, 1);
  assert.equal(anonymousOverview.data.analytics.pages.some(row => row.path === '/course.html?id=1'), true);
  assert.equal(anonymousOverview.data.analytics.durations[0].bucket, '30-120s');
  assert.equal(anonymousOverview.data.analytics.click_targets[0].target, '/login.html');
  const aggregateColumns = ctx.db.prepare('PRAGMA table_info(analytics_daily_aggregates)').all()
    .map(column => column.name);
  assert.equal(aggregateColumns.some(column => ['visitor_id', 'session_id', 'user_id', 'created_at'].includes(column)), false);
  assert.equal(ctx.db.prepare(`
    SELECT count FROM analytics_daily_aggregates
    WHERE event_type = 'page_duration' AND path = '/course.html?id=1' AND detail = '30-120s'
  `).get().count, 1);

  const application = await api(ctx.baseUrl, '/api/applications', {
    method: 'POST',
    body: {
      name: referred.name,
      email: referred.email,
      phone: '+380 67 123 45 67',
      program: 'Introduction to security',
      referral_code: referralCode,
      campaign_code: campaign.code,
      analytics_consent: true,
    },
  });
  assert.equal(application.status, 201, JSON.stringify(application.data));
  const app = ctx.db.prepare('SELECT * FROM applications WHERE email = ?').get(referred.email);
  assert.equal(app.referrer_id, referrer.id);
  assert.equal(app.analytics_campaign_code, null, 'campaign attribution is aggregated, never attached to an individual application');
  const linkedReferral = await api(ctx.baseUrl, '/api/admin/marketing?year=2030&month=1', {
    token: ownerToken,
  });
  const referrerStats = linkedReferral.data.referrals.find(row => row.code === referralCode);
  assert.equal(referrerStats.application_count, 1);

  const approve = () => api(ctx.baseUrl, `/api/admin/applications/${app.id}`, {
    method: 'PATCH', token: ownerToken, body: { status: 'approved' },
  });
  assert.equal((await approve()).status, 200);
  assert.equal((await approve()).status, 200);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS count FROM referral_rewards WHERE application_id = ?')
    .get(app.id).count, 1);

  const summary = await api(ctx.baseUrl, '/api/referrals/me', { token: referrerToken });
  assert.equal(summary.data.referral.referrals, 1);
  assert.equal(summary.data.referral.credits.available, 20);
  const approvedReferral = await api(ctx.baseUrl, '/api/admin/marketing?year=2030&month=1', {
    token: ownerToken,
  });
  const approvedStats = approvedReferral.data.referrals.find(row => row.code === referralCode);
  assert.equal(approvedStats.accepted_count, 1);
  assert.equal(approvedStats.reward_count, 1);

  const payment = await api(ctx.baseUrl, `/api/admin/billing/users/${referrer.id}/payments`, {
    method: 'POST',
    token: ownerToken,
    body: { year: 2030, month: 1, amount: 100, creditApplied: 7 },
  });
  assert.equal(payment.status, 201, JSON.stringify(payment.data));
  assert.equal(payment.data.payment.credit_applied, 7);
  const afterPayment = await api(ctx.baseUrl, '/api/referrals/me', { token: referrerToken });
  assert.equal(afterPayment.data.referral.credits.available, 13);

  const deleted = await api(ctx.baseUrl, `/api/admin/billing/payments/${payment.data.payment.id}`, {
    method: 'DELETE', token: ownerToken,
  });
  assert.equal(deleted.status, 200);
  const afterDelete = await api(ctx.baseUrl, '/api/referrals/me', { token: referrerToken });
  assert.equal(afterDelete.data.referral.credits.available, 20, 'deleting payment restores consumed credit');
});

test('published manual comments can be posted and removed only by their author or staff', async () => {
  const created = await api(ctx.baseUrl, '/api/manuals', {
    method: 'POST',
    token: ownerToken,
    body: { title: 'Test manual discussion' },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const manualId = created.data.manual.id;
  const unpublishedComments = await api(ctx.baseUrl, `/api/manuals/${manualId}/comments`, {
    token: referrerToken,
  });
  assert.equal(unpublishedComments.status, 404);
  ctx.db.prepare(`
    INSERT INTO content_pages (target_type, target_id, title, is_published)
    VALUES ('manual', ?, 'Test manual discussion', 1)
  `).run(manualId);

  const firstComment = await api(ctx.baseUrl, `/api/manuals/${manualId}/comments`, {
    method: 'POST',
    token: referrerToken,
    body: { body: 'Практичне запитання до мануала' },
  });
  assert.equal(firstComment.status, 201, JSON.stringify(firstComment.data));
  assert.equal(firstComment.data.comment.body, 'Практичне запитання до мануала');

  const emptyComment = await api(ctx.baseUrl, `/api/manuals/${manualId}/comments`, {
    method: 'POST',
    token: referrerToken,
    body: { body: '   ' },
  });
  assert.equal(emptyComment.status, 400);

  const comments = await api(ctx.baseUrl, `/api/manuals/${manualId}/comments`, { token: ownerToken });
  assert.equal(comments.status, 200);
  assert.equal(comments.data.comments.length, 1);
  assert.equal(comments.data.comments[0].handle, 'marketing_student');

  const deniedDelete = await api(ctx.baseUrl, `/api/manual-comments/${firstComment.data.comment.id}`, {
    method: 'DELETE',
    token: referredToken,
  });
  assert.equal(deniedDelete.status, 403);
  const authorDelete = await api(ctx.baseUrl, `/api/manual-comments/${firstComment.data.comment.id}`, {
    method: 'DELETE',
    token: referrerToken,
  });
  assert.equal(authorDelete.status, 200);
});

test('training programs export with curricula and JSON import merges by slug', async () => {
  const directionResponse = await api(ctx.baseUrl, '/api/admin/directions', {
    method: 'POST',
    token: ownerToken,
    body: { name: 'JSON Transfer QA Direction' },
  });
  assert.equal(directionResponse.status, 201, JSON.stringify(directionResponse.data));
  const transferDirectionSlug = directionResponse.data.direction.slug;
  const payload = {
    format: 'laboratorium-training-programs',
    version: 1,
    programs: [{
      slug: 'qa-json-course',
      name: 'QA JSON Course',
      level: 'Foundation',
      duration: '2 months',
      bounty_reward: 0,
      description: 'Imported course description',
      tags: ['JSON', 'Tests'],
      direction_slug: transferDirectionSlug,
      sort_order: 810,
      is_featured: true,
      is_active: true,
      content: {
        title: 'QA JSON Course',
        subtitle: 'Course overview',
        cover_gradient: 'accent',
        is_published: true,
        sections: [{
          title: 'Getting started',
          icon: 'book',
          blocks: [{ block_type: 'text', data: { text: 'Initial course content' } }],
        }],
      },
    }],
  };
  const imported = await api(ctx.baseUrl, '/api/admin/programs/import', {
    method: 'POST',
    token: ownerToken,
    body: payload,
  });
  assert.equal(imported.status, 200, JSON.stringify(imported.data));
  assert.equal(imported.data.created, 1);

  const exported = await api(ctx.baseUrl, '/api/admin/programs/export', { token: ownerToken });
  assert.equal(exported.status, 200);
  const course = exported.data.programs.find((program) => program.slug === 'qa-json-course');
  assert.equal(course.direction_slug, transferDirectionSlug);
  assert.equal(course.content.sections[0].blocks[0].data.text, 'Initial course content');

  const updatedPayload = structuredClone(payload);
  updatedPayload.programs[0].name = 'QA JSON Course Updated';
  updatedPayload.programs[0].description = 'Updated without replacing the curriculum';
  delete updatedPayload.programs[0].content;
  delete updatedPayload.programs[0].direction_slug;
  const updated = await api(ctx.baseUrl, '/api/admin/programs/import', {
    method: 'POST',
    token: ownerToken,
    body: updatedPayload,
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal(updated.data.updated, 1);
  const exportedAgain = await api(ctx.baseUrl, '/api/admin/programs/export', { token: ownerToken });
  const updatedCourse = exportedAgain.data.programs.find((program) => program.slug === 'qa-json-course');
  assert.equal(updatedCourse.name, 'QA JSON Course Updated');
  assert.equal(updatedCourse.direction_slug, transferDirectionSlug);
  assert.equal(updatedCourse.content.sections[0].blocks[0].data.text, 'Initial course content');

  const invalid = await api(ctx.baseUrl, '/api/admin/programs/import', {
    method: 'POST',
    token: ownerToken,
    body: { ...payload, programs: [{ ...payload.programs[0], direction_slug: 'missing-track' }] },
  });
  assert.equal(invalid.status, 400);
  assert.equal(ctx.db.prepare('SELECT name FROM programs WHERE slug = ?').get('qa-json-course').name, 'QA JSON Course Updated');
});

test('Google sign-in controls stay visible and explain when server OAuth is not configured', async () => {
  const [loginPage, registerPage, statusResponse] = await Promise.all([
    fetch(`${ctx.baseUrl}/login.html`).then((response) => response.text()),
    fetch(`${ctx.baseUrl}/register.html`).then((response) => response.text()),
    api(ctx.baseUrl, '/api/auth/google/status'),
  ]);
  assert.match(loginPage, /id="google-login"[^>]*disabled/);
  assert.doesNotMatch(loginPage, /id="google-login"[^>]*hidden/);
  assert.match(loginPage, /Вхід через Google ще не налаштовано на сервері/);
  assert.match(registerPage, /id="google-register"[^>]*disabled/);
  assert.doesNotMatch(registerPage, /id="google-register"[^>]*hidden/);
  assert.equal(statusResponse.data.enabled, false);
});

test('owner can create student-specific referral programs that award program-specific benefits', async () => {
  const created = await api(ctx.baseUrl, '/api/admin/marketing/referral-programs', {
    method: 'POST',
    token: ownerToken,
    body: {
      name: 'Знижка для друга',
      description: 'Запросіть друга та отримайте кредит на навчання.',
      reward_points: 12,
      credit_amount: 50,
      max_rewards_per_user: 1,
      apply_to_all: false,
      user_ids: [referrer.id],
      is_active: true,
    },
  });

  assert.equal(created.status, 201, JSON.stringify(created.data));
  const program = created.data.program;
  const listing = await api(ctx.baseUrl, '/api/admin/marketing?year=2030&month=1', { token: ownerToken });
  assert.equal(listing.data.referralPrograms.programs.some(item => item.id === program.id), true);
  assert.deepEqual(listing.data.referralPrograms.programs.find(item => item.id === program.id).user_ids, [referrer.id]);

  const referrerSummary = await api(ctx.baseUrl, '/api/referrals/me', { token: referrerToken });
  const customInvite = referrerSummary.data.referral.programs.find(item => item.id === program.id);
  assert.ok(customInvite);
  const otherToken = (await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST', body: { login: referred.email, password: 'Password123!' },
  })).data.token;
  const otherSummary = await api(ctx.baseUrl, '/api/referrals/me', { token: otherToken });
  assert.equal(otherSummary.data.referral.programs.some(item => item.id === program.id), false);

  const application = await api(ctx.baseUrl, '/api/applications', {
    method: 'POST',
    body: {
      name: 'Program invite',
      email: 'program-invite@lab.dev',
      phone: '+380 67 123 45 67',
      program: 'Introduction to security',
      referral_code: new URL(customInvite.link).searchParams.get('ref'),
    },
  });
  assert.equal(application.status, 201, JSON.stringify(application.data));
  const stored = ctx.db.prepare('SELECT * FROM applications WHERE email = ?').get('program-invite@lab.dev');
  assert.equal(stored.referrer_id, referrer.id);
  assert.equal(stored.referral_program_id, program.id);
  const approval = await api(ctx.baseUrl, `/api/admin/applications/${stored.id}`, {
    method: 'PATCH', token: ownerToken, body: { status: 'approved' },
  });
  assert.equal(approval.status, 200, JSON.stringify(approval.data));
  const reward = ctx.db.prepare('SELECT * FROM referral_rewards WHERE application_id = ?').get(stored.id);
  assert.equal(reward.program_id, program.id);
  assert.equal(reward.points_awarded, 12);
  assert.equal(reward.credit_awarded, 50);
  assert.equal(referralService.getAvailableCredit(referrer.id), 70);

  const registeredInvitee = createUserDirect(ctx.db, {
    email: 'registered-program-invite@lab.dev',
    password: 'Password123!',
    role: 'student',
    handle: 'registered_program_invite',
  });
  referralService.assignReferrerToUser(registeredInvitee.id, new URL(customInvite.link).searchParams.get('ref'));
  const inviteeToken = (await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { login: registeredInvitee.email, password: 'Password123!' },
  })).data.token;
  const registeredApplication = await api(ctx.baseUrl, '/api/applications', {
    method: 'POST',
    token: inviteeToken,
    body: { phone: '+380 67 123 45 67', program: 'Introduction to security' },
  });
  assert.equal(registeredApplication.status, 201, JSON.stringify(registeredApplication.data));
  const registeredApplicationRow = ctx.db.prepare('SELECT referrer_id, referral_program_id FROM applications WHERE email = ?')
    .get(registeredInvitee.email);
  assert.equal(registeredApplicationRow.referrer_id, referrer.id);
  assert.equal(registeredApplicationRow.referral_program_id, program.id);

  const updated = await api(ctx.baseUrl, `/api/admin/marketing/referral-programs/${program.id}`, {
    method: 'PATCH',
    token: ownerToken,
    body: {
      ...program,
      name: 'Знижка для друга',
      description: 'Оновлені умови.',
      reward_points: 12,
      credit_amount: 50,
      max_rewards_per_user: 1,
      apply_to_all: false,
      user_ids: [referrer.id],
      is_active: false,
    },
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal(updated.data.program.is_active, 0);
});

test('public learning tracks publish four ordered levels, including a multi-year cybersecurity path', async () => {
  const response = await api(ctx.baseUrl, '/api/directions');
  assert.equal(response.status, 200, JSON.stringify(response.data));

  const expectedLevels = ['Початковий', 'Середній', 'Спеціалізований', 'Просунутий'];
  for (const slug of ['cybersecurity', 'cpp', 'python', 'csharp', 'sysadmin', 'embedded']) {
    const direction = response.data.directions.find(item => item.slug === slug);
    assert.ok(direction, `Missing public direction: ${slug}`);
    assert.deepEqual(direction.programs.map(program => program.level), expectedLevels, slug);
    assert.ok(direction.programs.every(program => program.description && program.tags.length === 4), slug);
  }
  assert.ok(response.data.directions.flatMap(direction => direction.programs)
    .filter(program => !['web', 'defensive', 'reverse', 'offensive', 'python', 'systems', 'csharp', 'sysadmin'].includes(program.slug))
    .every(program => program.bounty_reward === 0), 'New programs must not advertise unverified rewards');

  const cybersecurity = response.data.directions.find(item => item.slug === 'cybersecurity');
  const durationMonths = cybersecurity.programs.reduce((sum, program) => {
    const months = Number(program.duration.match(/\d+/)?.[0]);
    return sum + (program.duration.includes('рік') ? months * 12 : months);
  }, 0);
  assert.equal(durationMonths, 42);
  assert.match(cybersecurity.description, /3–4 роки/);

  const embedded = response.data.directions.find(item => item.slug === 'embedded');
  assert.match(embedded.description, /мікроконтролерів/);
  assert.equal(embedded.programs.length, 4);
  assert.ok(embedded.programs.every(program => program.description && program.tags.length === 4));
  assert.equal(ctx.db.prepare('SELECT is_programming FROM directions WHERE slug = ?').get('embedded').is_programming, 1);
});

test('course pages server-render published curriculum, direction applications and unique SEO metadata', async () => {
  const program = ctx.db.prepare("SELECT id FROM programs WHERE slug = 'offensive'").get();
  const direction = ctx.db.prepare("SELECT id FROM directions WHERE slug = 'cybersecurity'").get();
  contentService.savePage('program', program.id, owner.id, 'owner', {
    title: 'Curriculum test',
    is_published: true,
    sections: [{
      title: 'Зміст курсу',
      blocks: [
        { block_type: 'text', data: { text: 'Захищений опис <модуля>' } },
        { block_type: 'callout', data: { title: 'Практична робота', text: 'Лабораторія з дозволеними даними' } },
        { block_type: 'link', data: { label: 'Офіційна документація', url: 'https://docs.zephyrproject.org/latest/', style: 'outline' } },
        { block_type: 'link', data: { label: 'Небезпечне посилання', url: 'javascript:alert(1)', style: 'outline' } },
      ],
    }],
  });

  const response = await fetch(`${ctx.baseUrl}/course.html?id=${program.id}`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<title>Offensive Security — laboratorium\.<\/title>/);
  assert.match(html, new RegExp(`<link rel="canonical" href="https://laboratorium\\.club/course\\.html\\?id=${program.id}">`));
  assert.match(html, /<meta property="og:title" content="Offensive Security — laboratorium\.">/);
  assert.match(html, /href="\/\?direction=cybersecurity#contact"/);
  assert.match(html, /Захищений опис &lt;модуля&gt;/);
  assert.match(html, /Практична робота/);
  assert.match(html, /href="https:\/\/docs\.zephyrproject\.org\/latest\/"/);
  assert.doesNotMatch(html, /javascript:alert/);
  assert.equal(ctx.db.prepare('SELECT direction_id FROM programs WHERE id = ?').get(program.id).direction_id, direction.id);

  const publishedPrograms = ctx.db.prepare('SELECT id FROM programs WHERE is_active = 1').all();
  const sitemapResponse = await fetch(`${ctx.baseUrl}/sitemap.xml`);
  const sitemap = await sitemapResponse.text();
  const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  assert.equal(sitemapResponse.status, 200);
  assert.equal(sitemapUrls.length, publishedPrograms.length + 1);
  assert.ok(publishedPrograms.every(({ id }) => sitemapUrls.includes(`https://laboratorium.club/course.html?id=${id}`)));

  const unpublished = ctx.db.prepare("SELECT id FROM programs WHERE slug = 'web'").get();
  assert.equal(contentService.getPublishedProgramPage(unpublished.id), null);
  ctx.db.prepare('UPDATE programs SET is_active = 0 WHERE id = ?').run(unpublished.id);
  const filteredSitemap = await fetch(`${ctx.baseUrl}/sitemap.xml`).then(response => response.text());
  assert.ok(!filteredSitemap.includes(`course.html?id=${unpublished.id}`));
  const noindexPage = await fetch(`${ctx.baseUrl}/course.html?id=${unpublished.id}`);
  assert.equal(noindexPage.status, 404);
  assert.match(await noindexPage.text(), /name="robots" content="noindex"/);
});

test('OSINT CTF achievement cards unlock only from completed CTF challenges in that category', async () => {
  const challenge = ctx.db.prepare(`
    SELECT id, category, ctf_enabled FROM challenges WHERE slug = 'osint-synthetic-archive'
  `).get();
  assert.ok(challenge, 'The synthetic-data OSINT challenge is available');
  assert.equal(challenge.category, 'osint');
  assert.equal(challenge.ctf_enabled, 1);
  assert.ok(ctx.db.prepare('SELECT COUNT(*) AS count FROM challenge_stages WHERE challenge_id = ?').get(challenge.id).count >= 3);

  const cardsBeforeSolve = getCtfAwards([
    { category: 'osint', ctf_enabled: true, completed: false },
    { category: 'web', ctf_enabled: false, completed: true },
  ]);
  assert.equal(cardsBeforeSolve.find(card => card.id === 'ctf-osint-1').earned, false);
  assert.equal(cardsBeforeSolve.find(card => card.id === 'ctf-osint-1').progress_label, '0/1');

  const cardsAfterSolve = getCtfAwards([
    { category: 'osint', ctf_enabled: true, completed: true },
    { category: 'web', ctf_enabled: false, completed: true },
  ]);
  assert.equal(cardsAfterSolve.find(card => card.id === 'ctf-osint-1').earned, true);
  assert.equal(cardsAfterSolve.find(card => card.id === 'ctf-osint-2').earned, false);
  assert.equal(cardsAfterSolve.find(card => card.id === 'ctf-osint-2').progress_label, '1/3');
  const nftCard = renderAchievementCard(cardsAfterSolve.find(card => card.id === 'ctf-osint-3'));
  assert.match(nftCard, /achievement-nft-card/);
  assert.match(nftCard, /data-rarity="legendary"/);
  assert.match(nftCard, /shape-rendering="crispEdges"/);

  const profile = await api(ctx.baseUrl, '/api/students/marketing_student/profile', { token: referrerToken });
  assert.equal(profile.status, 200, JSON.stringify(profile.data));
  assert.equal(profile.data.profile.awards.filter(award => award.id.startsWith('ctf-')).length, 13);
  assert.equal(profile.data.profile.awards.find(award => award.id === 'ctf-osint-1').earned, false);
});

test('student profile exposes completed work only with explicit solution sharing and supports per-award privacy', async () => {
  const challenge = ctx.db.prepare(`
    SELECT id FROM challenges WHERE slug = 'osint-synthetic-archive'
  `).get();
  ctx.db.prepare(`
    INSERT OR IGNORE INTO challenge_completions (user_id, challenge_id)
    VALUES (?, ?)
  `).run(referrer.id, challenge.id);

  const group = ctx.db.prepare(`
    INSERT INTO study_groups (name, teacher_id) VALUES ('Profile work sample group', ?)
  `).run(owner.id);
  ctx.db.prepare(`
    INSERT INTO study_group_members (group_id, user_id, added_by) VALUES (?, ?, ?)
  `).run(group.lastInsertRowid, referrer.id, owner.id);
  ctx.db.prepare(`
    INSERT INTO study_group_members (group_id, user_id, added_by) VALUES (?, ?, ?)
  `).run(group.lastInsertRowid, referred.id, owner.id);
  const task = await api(ctx.baseUrl, '/api/admin/tasks', {
    method: 'POST',
    token: ownerToken,
    body: { group_id: group.lastInsertRowid, title: 'Safe profile work sample' },
  });
  assert.equal(task.status, 201, JSON.stringify(task.data));
  const assignmentId = ctx.db.prepare(`
    SELECT id FROM task_assignments WHERE task_id = ? AND user_id = ?
  `).get(task.data.task.id, referrer.id).id;
  ctx.db.prepare(`
    UPDATE task_assignments SET status = 'completed', submitted_at = datetime('now'),
      completed_at = datetime('now'), submission_note = 'Розібрав задачу крок за кроком'
    WHERE id = ?
  `).run(assignmentId);
  ctx.db.prepare(`
    INSERT INTO task_submission_files (assignment_id, filename, original_name, mime_type, size_bytes)
    VALUES (?, 'profile-work.txt', 'розбір.txt', 'text/plain', 24)
  `).run(assignmentId);

  const settings = await api(ctx.baseUrl, '/api/profile', {
    method: 'PATCH',
    token: referrerToken,
    body: { profile_hidden_awards: ['ctf-osint-1'], profile_share_solutions: false },
  });
  assert.equal(settings.status, 200, JSON.stringify(settings.data));
  const ownerView = await api(ctx.baseUrl, '/api/students/marketing_student/profile', { token: referrerToken });
  assert.equal(ownerView.data.profile.completedCtf.some((item) => item.id === challenge.id), true);
  assert.equal(ownerView.data.profile.sharedSolutions.length, 0);
  assert.equal(ownerView.data.profile.awards.some((award) => award.id === 'ctf-osint-1'), true);

  const privateView = await api(ctx.baseUrl, '/api/students/marketing_student/profile', { token: referredToken });
  assert.equal(privateView.data.profile.awards.some((award) => award.id === 'ctf-osint-1'), false);
  assert.equal(privateView.data.profile.sharedSolutions.length, 0);

  const sharing = await api(ctx.baseUrl, '/api/profile', {
    method: 'PATCH',
    token: referrerToken,
    body: { profile_share_solutions: true },
  });
  assert.equal(sharing.status, 200, JSON.stringify(sharing.data));
  const sharedView = await api(ctx.baseUrl, '/api/students/marketing_student/profile', { token: referredToken });
  assert.equal(sharedView.data.profile.sharedSolutions.length, 1);
  assert.equal(sharedView.data.profile.sharedSolutions[0].note, 'Розібрав задачу крок за кроком');
  assert.equal(sharedView.data.profile.sharedSolutions[0].files[0].name, 'розбір.txt');
  assert.ok(sharedView.data.profile.skillsByDirection.some((skill) => skill.ctfCategories.osint > 0));
});

test('calendar events are scoped to all students, a group, or one student', async () => {
  const group = ctx.db.prepare(`
    INSERT INTO study_groups (name, teacher_id) VALUES ('Calendar test group', ?)
  `).run(owner.id);
  ctx.db.prepare(`
    INSERT INTO study_group_members (group_id, user_id, added_by) VALUES (?, ?, ?)
  `).run(group.lastInsertRowid, referrer.id, owner.id);

  const startsAt = new Date(Date.UTC(2026, 9, 28, 16)).toISOString();
  const groupEvent = await api(ctx.baseUrl, '/api/admin/calendar/events', {
    method: 'POST', token: ownerToken,
    body: {
      title: 'Group CTF practice', description: 'Safe workshop', starts_at: startsAt,
      audience_type: 'group', audience_id: group.lastInsertRowid,
      url: 'https://example.org/event',
    },
  });
  assert.equal(groupEvent.status, 201, JSON.stringify(groupEvent.data));
  const personalEvent = await api(ctx.baseUrl, '/api/admin/calendar/events', {
    method: 'POST', token: ownerToken,
    body: { title: 'Student check-in', starts_at: startsAt, audience_type: 'student', audience_id: referrer.id },
  });
  assert.equal(personalEvent.status, 201, JSON.stringify(personalEvent.data));
  const allStudentsEvent = await api(ctx.baseUrl, '/api/admin/calendar/events', {
    method: 'POST', token: ownerToken,
    body: {
      title: 'Future school workshop',
      starts_at: new Date(Date.now() + 35 * 86400000).toISOString(),
      audience_type: 'all',
    },
  });
  assert.equal(allStudentsEvent.status, 201, JSON.stringify(allStudentsEvent.data));

  const referrerEvents = await api(ctx.baseUrl, '/api/calendar/events?month=2026-10', { token: referrerToken });
  assert.equal(referrerEvents.status, 200);
  assert.deepEqual(referrerEvents.data.events.map(event => event.title), ['Group CTF practice', 'Student check-in']);
  const referredToken = (await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST', body: { login: referred.email, password: 'Password123!' },
  })).data.token;
  const otherStudentEvents = await api(ctx.baseUrl, '/api/calendar/events?month=2026-10', { token: referredToken });
  assert.deepEqual(otherStudentEvents.data.events, []);
  const futureMonth = new Date(allStudentsEvent.data.event.starts_at).toISOString().slice(0, 7);
  const futureEvents = await api(ctx.baseUrl, `/api/calendar/events?month=${futureMonth}`, { token: referredToken });
  assert.deepEqual(futureEvents.data.events.map(event => event.title), ['Future school workshop']);
  assert.ok(calendarService.listForAdmin().some(event => event.title === 'Future school workshop'));

  const invalidUrl = await api(ctx.baseUrl, '/api/admin/calendar/events', {
    method: 'POST', token: ownerToken,
    body: { title: 'Invalid URL', starts_at: startsAt, url: 'javascript:alert(1)' },
  });
  assert.equal(invalidUrl.status, 400);
  assert.equal((await api(ctx.baseUrl, '/api/admin/calendar/events', { token: referrerToken })).status, 403);

  const eventId = groupEvent.data.event.id;
  const deleted = await api(ctx.baseUrl, `/api/admin/calendar/events/${eventId}`, { method: 'DELETE', token: ownerToken });
  assert.equal(deleted.status, 200);
  assert.equal((await api(ctx.baseUrl, `/api/admin/calendar/events/${eventId}`, { method: 'DELETE', token: ownerToken })).status, 404);
});

test('weekly group lessons can be rescheduled as single-occurrence exceptions and appear in the student calendar', async () => {
  const group = ctx.db.prepare(`
    INSERT INTO study_groups (name, teacher_id) VALUES ('Recurring lesson test group', ?)
  `).run(owner.id);
  ctx.db.prepare(`
    INSERT INTO study_group_members (group_id, user_id, added_by) VALUES (?, ?, ?)
  `).run(group.lastInsertRowid, referrer.id, owner.id);

  const created = await api(ctx.baseUrl, '/api/admin/schedule/lessons', {
    method: 'POST',
    token: ownerToken,
    body: {
      group_id: group.lastInsertRowid,
      title: 'Weekly lab',
      lesson_at: '2026-11-02T16:00:00.000Z',
      duration_minutes: 90,
      repeat_weekly: true,
      recurrence_until: '2026-11-30',
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const seriesId = created.data.lesson.series_id;
  assert.ok(seriesId);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS count FROM lessons WHERE series_id = ?').get(seriesId).count, 5);

  const listed = await api(ctx.baseUrl, `/api/admin/schedule/lessons?groupId=${group.lastInsertRowid}`, {
    token: ownerToken,
  });
  const occurrences = listed.data.lessons.filter((lesson) => lesson.series_id === seriesId);
  assert.equal(occurrences.length, 5);

  const moved = await api(ctx.baseUrl, `/api/admin/schedule/lessons/${occurrences[1].id}`, {
    method: 'PATCH',
    token: ownerToken,
    body: {
      lesson_at: '2026-11-11T17:00:00.000Z',
      title: 'Weekly lab — перенесено',
    },
  });
  assert.equal(moved.status, 200, JSON.stringify(moved.data));
  assert.equal(moved.data.lesson.is_exception, true);
  assert.equal(moved.data.lesson.series_id, seriesId);

  const studentCalendar = await api(ctx.baseUrl, '/api/calendar/events?month=2026-11', {
    token: referrerToken,
  });
  const calendarLessons = studentCalendar.data.events.filter((event) => event.source === 'lesson');
  assert.equal(calendarLessons.length, 5);
  assert.ok(calendarLessons.some((event) => event.title === 'Weekly lab — перенесено'
    && event.starts_at === '2026-11-11T17:00:00.000Z' && event.is_exception));

  const deleted = await api(ctx.baseUrl, `/api/admin/schedule/lessons/${occurrences[2].id}`, {
    method: 'DELETE',
    token: ownerToken,
  });
  assert.equal(deleted.status, 200);
  const remaining = await api(ctx.baseUrl, `/api/admin/schedule/lessons?groupId=${group.lastInsertRowid}`, {
    token: ownerToken,
  });
  assert.equal(remaining.data.lessons.filter((lesson) => lesson.series_id === seriesId).length, 4);
});

test('teachers get a dedicated homework review queue with submission actions', async () => {
  const group = ctx.db.prepare(`
    INSERT INTO study_groups (name, teacher_id) VALUES ('Homework review test group', ?)
  `).run(owner.id);
  ctx.db.prepare(`
    INSERT INTO study_group_members (group_id, user_id, added_by) VALUES (?, ?, ?)
  `).run(group.lastInsertRowid, referrer.id, owner.id);
  ctx.db.prepare(`
    INSERT INTO study_group_members (group_id, user_id, added_by) VALUES (?, ?, ?)
  `).run(group.lastInsertRowid, referred.id, owner.id);
  const task = await api(ctx.baseUrl, '/api/admin/tasks', {
    method: 'POST',
    token: ownerToken,
    body: { group_id: group.lastInsertRowid, title: 'Review test homework', description: 'Short response' },
  });
  assert.equal(task.status, 201, JSON.stringify(task.data));
  const studentTasks = await api(ctx.baseUrl, '/api/tasks', { token: referrerToken });
  const assignment = studentTasks.data.tasks.find((item) => item.task_id === task.data.task.id);
  assert.ok(assignment);
  assert.equal((await api(ctx.baseUrl, `/api/tasks/${assignment.id}/take`, {
    method: 'POST', token: referrerToken,
  })).status, 200);
  assert.equal((await api(ctx.baseUrl, `/api/tasks/${assignment.id}/submit`, {
    method: 'POST', token: referrerToken, body: { note: 'Домашнє завдання виконано' },
  })).status, 200);

  const studentDashboard = await api(ctx.baseUrl, '/api/dashboard', { token: referrerToken });
  assert.equal(studentDashboard.status, 200);
  assert.equal(studentDashboard.data.learningHistory.submissions.some((item) => item.id === assignment.id), true);
  assert.equal(studentDashboard.data.learningHistory.submissions.some((item) => item.user_id === referred.id), false);
  assert.equal(studentDashboard.data.learningHistory.submissions[0].submission_note, 'Домашнє завдання виконано');

  ctx.db.prepare(`
    INSERT INTO lessons (group_id, teacher_id, title, lesson_at, duration_minutes, topic)
    VALUES (?, ?, 'Past review lesson', datetime('now', '-1 day'), 60, 'Перегляд практики')
  `).run(group.lastInsertRowid, owner.id);
  const review = await api(ctx.baseUrl, '/api/admin/tasks', { token: ownerToken });
  assert.equal(review.status, 200);
  assert.equal(review.data.reviewQueue.some((item) => item.id === assignment.id
    && item.submission_note === 'Домашнє завдання виконано'), true);
  assert.equal(review.data.submissionHistory.some((item) => item.id === assignment.id), true);
  assert.equal(review.data.pastLessons.some((lesson) => lesson.title === 'Past review lesson'), true);
  const approved = await api(ctx.baseUrl, `/api/admin/tasks/assignments/${assignment.id}/approve`, {
    method: 'POST', token: ownerToken,
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.assignment.status, 'completed');
  const completedHistory = await api(ctx.baseUrl, '/api/admin/tasks', { token: ownerToken });
  assert.equal(completedHistory.data.submissionHistory.some((item) => item.id === assignment.id
    && item.status === 'completed'), true);
});

test('CTFtime calendar sync imports event descriptions and safe detail links idempotently', async () => {
  const now = new Date('2026-10-22T12:00:00Z');
  const event = {
    id: 987654,
    title: 'Open CTF event',
    description: 'Public event description',
    start: '2026-10-29T10:00:00+00:00',
    finish: '2026-10-30T10:00:00+00:00',
    url: 'https://organizer.example/ctf',
    ctftime_url: 'https://ctftime.org/event/987654/',
  };
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: new URL(url), options });
    return { ok: true, status: 200, text: async () => JSON.stringify(requests.length === 1 ? [event] : []) };
  };
  const firstSync = await calendarService.syncCtfEvents({ now, fetchImpl });
  assert.equal(firstSync.imported, 1);
  assert.equal(firstSync.added, 1);
  assert.equal(requests.length, 3);
  assert.ok(requests.every(request => request.url.hostname === 'ctftime.org'));
  const stored = ctx.db.prepare(`
    SELECT * FROM calendar_events WHERE source = 'ctftime' AND external_id = '987654'
  `).get();
  assert.equal(stored.description, 'Public event description');
  assert.equal(stored.source_url, 'https://ctftime.org/event/987654/');
  assert.equal(stored.url, 'https://organizer.example/ctf');
  assert.equal(stored.audience_type, 'all');

  event.description = 'Updated public event description';
  const secondSync = await calendarService.syncCtfEvents({ now, fetchImpl: async () => ({
    ok: true, status: 200, text: async () => JSON.stringify([event]),
  }) });
  assert.equal(secondSync.added, 0);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS count FROM calendar_events WHERE external_id = ?').get('987654').count, 1);
  assert.equal(ctx.db.prepare('SELECT description FROM calendar_events WHERE external_id = ?').get('987654').description, 'Updated public event description');
  assert.equal(calendarService.getCtfSyncStatus().ctftime_calendar_sync_month, '2026-10');
});

test('students apply to a learning direction instead of self-enrolling in one program block', async () => {
  const blocked = await api(ctx.baseUrl, '/api/enroll', {
    method: 'POST',
    token: referrerToken,
    body: { programId: 1 },
  });
  assert.equal(blocked.status, 400);
  assert.match(blocked.data.error, /весь напрямок/);
  assert.equal(ctx.db.prepare('SELECT id FROM enrollments WHERE user_id = ? AND program_id = 1').get(referrer.id), undefined);
});

test('programming workspaces provide sandboxed tests and local Git without allowing unsafe file paths', async () => {
  const created = await api(ctx.baseUrl, '/api/code/workspaces', {
    method: 'POST',
    token: ownerToken,
    body: { name: 'Course test workspace', language: 'python' },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));

  const missingTests = await api(ctx.baseUrl, `/api/code/workspaces/${created.data.workspace.id}/test`, {
    method: 'POST',
    token: ownerToken,
  });
  assert.equal(missingTests.status, 400);
  assert.match(missingTests.data.error, /test_\*\.py/);
  assert.equal(ctx.db.prepare("SELECT id FROM code_runs WHERE workspace_id = ? AND mode = 'tests'")
    .get(created.data.workspace.id), undefined);

  const workspaceUrl = `/api/code/workspaces/${created.data.workspace.id}`;
  const initialGit = await api(ctx.baseUrl, `${workspaceUrl}/git`, { token: ownerToken });
  assert.equal(initialGit.status, 200, JSON.stringify(initialGit.data));
  assert.equal(initialGit.data.status.branch, 'main');
  assert.equal(initialGit.data.status.local_only, true);
  assert.match(initialGit.data.status.history[0].message, /Початковий стан/);

  const invalidPath = await api(ctx.baseUrl, `${workspaceUrl}/files`, {
    method: 'PUT',
    token: ownerToken,
    body: { files: [{ path: '../outside.py', content: 'print("unsafe")' }] },
  });
  assert.equal(invalidPath.status, 400);

  const saved = await api(ctx.baseUrl, `${workspaceUrl}/files`, {
    method: 'PUT',
    token: ownerToken,
    body: { files: [{ path: 'main.py', content: 'print("changed")\n' }] },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const changedGit = await api(ctx.baseUrl, `${workspaceUrl}/git`, { token: ownerToken });
  assert.equal(changedGit.data.status.clean, false);
  assert.match(changedGit.data.status.changes[0], /main\.py/);

  const committed = await api(ctx.baseUrl, `${workspaceUrl}/git/commit`, {
    method: 'POST',
    token: ownerToken,
    body: { message: 'Add local course change' },
  });
  assert.equal(committed.status, 200, JSON.stringify(committed.data));
  assert.equal(committed.data.committed, true);
  assert.equal(committed.data.clean, true);
  assert.equal(committed.data.history[0].message, 'Add local course change');

  const deleted = await api(ctx.baseUrl, workspaceUrl, { method: 'DELETE', token: ownerToken });
  assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
});

test('known crawler traffic is counted without storing an IP address', async () => {
  const beforeCount = ctx.db.prepare("SELECT COALESCE(SUM(count), 0) AS count FROM analytics_daily_aggregates WHERE event_type = 'bot_crawl'").get().count;
  await fetch(ctx.baseUrl, { headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' } });
  const row = ctx.db.prepare(`
    SELECT bot_name, path, count FROM analytics_daily_aggregates
    WHERE event_type = 'bot_crawl' AND bot_name = 'Googlebot' ORDER BY day DESC LIMIT 1
  `).get();
  assert.equal(row.bot_name, 'Googlebot');
  assert.equal(row.path, '/');
  assert.equal(ctx.db.prepare("SELECT COALESCE(SUM(count), 0) AS count FROM analytics_daily_aggregates WHERE event_type = 'bot_crawl'").get().count, beforeCount + 1);

  const active = ctx.db.prepare(`
    INSERT INTO programs (slug, name, level, duration, bounty_reward, description, is_active)
    VALUES ('seo-visible-program', 'SEO visible program', 'beginner', '4 weeks', 0, 'Public course description', 1)
  `).run();
  const inactiveDirection = ctx.db.prepare(`
    INSERT INTO directions (slug, name, is_active) VALUES ('seo-hidden-direction', 'Hidden direction', 0)
  `).run();
  const hidden = ctx.db.prepare(`
    INSERT INTO programs (slug, name, level, duration, bounty_reward, description, direction_id, is_active)
    VALUES ('seo-hidden-program', 'SEO hidden program', 'beginner', '4 weeks', 0, 'Private course description', ?, 1)
  `).run(inactiveDirection.lastInsertRowid);
  const inactive = ctx.db.prepare(`
    INSERT INTO programs (slug, name, level, duration, bounty_reward, description, is_active)
    VALUES ('seo-inactive-program', 'SEO inactive program', 'beginner', '4 weeks', 0, 'Unpublished course', 0)
  `).run();

  const courseResponse = await fetch(`${ctx.baseUrl}/course.html?id=${active.lastInsertRowid}`, {
    headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
  });
  assert.equal(courseResponse.status, 200);
  const courseHtml = await courseResponse.text();
  assert.match(courseHtml, /<link rel="canonical" href="[^"]*course\.html\?id=/);
  const courseBot = ctx.db.prepare(`
    SELECT path FROM analytics_daily_aggregates
    WHERE event_type = 'bot_crawl' AND bot_name = 'Googlebot' ORDER BY day DESC LIMIT 1
  `).get();
  assert.equal(courseBot.path, `/course.html?id=${active.lastInsertRowid}`);

  const sitemap = await (await fetch(`${ctx.baseUrl}/sitemap.xml`)).text();
  assert.match(sitemap, new RegExp(`course\\.html\\?id=${active.lastInsertRowid}`));
  assert.doesNotMatch(sitemap, new RegExp(`course\\.html\\?id=${hidden.lastInsertRowid}`));
  assert.doesNotMatch(sitemap, new RegExp(`course\\.html\\?id=${inactive.lastInsertRowid}`));
});

test('legacy analytics identifiers are compacted into daily totals and cleared', async () => {
  const application = ctx.db.prepare('SELECT id FROM applications LIMIT 1').get();
  ctx.db.prepare(`
    UPDATE applications SET analytics_visitor_id = ?, analytics_source = ?,
      analytics_medium = ?, analytics_campaign = ?, analytics_campaign_code = ?
    WHERE id = ?
  `).run('old-visitor-id', 'newsletter', 'email', 'autumn', 'CAMPAIGN1', application.id);
  ctx.db.prepare(`
    INSERT INTO analytics_events (event_type, visitor_id, session_id, user_id, path, source, medium)
    VALUES ('page_view', 'old-visitor-id', 'old-session-id', ?, '/dashboard.html', 'newsletter', 'email')
  `).run(referred.id);

  runMigrations(ctx.db);

  const rawEvents = ctx.db.prepare('SELECT COUNT(*) AS count FROM analytics_events').get().count;
  assert.equal(rawEvents, 0);
  const applicationAttribution = ctx.db.prepare(`
    SELECT analytics_visitor_id, analytics_source, analytics_medium, analytics_campaign, analytics_campaign_code
    FROM applications WHERE id = ?
  `).get(application.id);
  assert.deepEqual(Object.values(applicationAttribution), [null, null, null, null, null]);
  assert.equal(ctx.db.prepare(`
    SELECT count FROM analytics_daily_aggregates
    WHERE event_type = 'page_view' AND path = '/other' AND source = 'newsletter' AND medium = 'email'
  `).get().count, 1);
});

test('public applications require and persist a validated callback phone for the owner inbox', async () => {
  const invalid = await api(ctx.baseUrl, '/api/applications', {
    method: 'POST',
    body: {
      name: 'Social lead',
      email: 'social-lead@lab.dev',
      phone: 'Call me at 1234567',
      program: 'Introduction to security',
    },
  });
  assert.equal(invalid.status, 400);

  const missingPhone = await api(ctx.baseUrl, '/api/applications', {
    method: 'POST',
    body: {
      name: 'Social lead',
      email: 'social-lead@lab.dev',
      program: 'Introduction to security',
    },
  });
  assert.equal(missingPhone.status, 400);

  const application = await api(ctx.baseUrl, '/api/applications', {
    method: 'POST',
    body: {
      name: 'Social lead',
      email: 'social-lead@lab.dev',
      phone: '+380 67 123 45 67',
      program: 'Introduction to security',
    },
  });
  assert.equal(application.status, 201, JSON.stringify(application.data));
  const stored = ctx.db.prepare('SELECT callback_phone FROM applications WHERE email = ?')
    .get('social-lead@lab.dev');
  assert.equal(stored.callback_phone, '+380 67 123 45 67');
  const ownerApplications = await api(ctx.baseUrl, '/api/admin/overview', { token: ownerToken });
  const visibleApplication = ownerApplications.data.applications.find(app => app.email === 'social-lead@lab.dev');
  assert.equal(visibleApplication.callback_phone, '+380 67 123 45 67');
});

test('Google can be linked to existing accounts of every platform role', async () => {
  const teacher = createUserDirect(ctx.db, {
    email: 'google.teacher@lab.dev', password: 'Password123!', role: 'teacher', handle: 'google_teacher',
  });
  const developer = createUserDirect(ctx.db, {
    email: 'google.developer@lab.dev', password: 'Password123!', role: 'developer', handle: 'google_developer',
  });
  const { loginWithGoogle } = await import('../server/services/user.service.js');
  for (const user of [owner, teacher, developer, referrer]) {
    const linked = loginWithGoogle({
      sub: `google-sub-${user.id}`,
      email: user.email,
      emailVerified: true,
      name: user.name,
    });
    assert.equal(linked.id, user.id);
    assert.equal(linked.role, user.role);
    assert.equal(linked.google_sub, `google-sub-${user.id}`);
  }
});

test('owner and student can exchange support messages with templates and status', async () => {
  const created = await api(ctx.baseUrl, '/api/support/threads', {
    method: 'POST',
    token: referrerToken,
    body: { subject: 'Питання щодо курсу', body: 'Потрібна допомога з доступом.' },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const threadId = created.data.thread.id;

  const denied = await api(ctx.baseUrl, '/api/admin/messages', { token: referrerToken });
  assert.equal(denied.status, 403);

  const ownerInbox = await api(ctx.baseUrl, '/api/admin/messages', { token: ownerToken });
  assert.equal(ownerInbox.status, 200);
  assert.equal(ownerInbox.data.threads[0].id, threadId);
  assert.equal(ownerInbox.data.threads[0].unread_owner, true);

  const template = await api(ctx.baseUrl, '/api/admin/messages/templates', {
    method: 'POST',
    token: ownerToken,
    body: { title: 'Шаблон відповіді', body: 'Дякуємо, ми перевіримо доступ.' },
  });
  assert.equal(template.status, 201);
  assert.equal((await api(ctx.baseUrl, '/api/admin/messages/templates', { token: ownerToken })).data.templates
    .some(item => item.id === template.data.template.id), true);

  const ownerReply = await api(ctx.baseUrl, `/api/admin/messages/${threadId}/replies`, {
    method: 'POST',
    token: ownerToken,
    body: { body: template.data.template.body },
  });
  assert.equal(ownerReply.status, 200, JSON.stringify(ownerReply.data));
  assert.equal(ownerReply.data.emailDelivery.sent, false, 'test SMTP is not configured');
  assert.equal(ownerReply.data.messages.at(-1).sender_role, 'owner');
  assert.equal(ownerReply.data.thread.status, 'waiting');

  const studentThread = await api(ctx.baseUrl, `/api/support/threads/${threadId}`, { token: referrerToken });
  assert.equal(studentThread.status, 200);
  assert.equal(studentThread.data.messages.length, 2);

  const studentReply = await api(ctx.baseUrl, `/api/support/threads/${threadId}/replies`, {
    method: 'POST',
    token: referrerToken,
    body: { body: 'Дякую, зачекаю.' },
  });
  assert.equal(studentReply.status, 200);
  assert.equal(studentReply.data.thread.status, 'open');

  const closed = await api(ctx.baseUrl, `/api/admin/messages/${threadId}/status`, {
    method: 'PATCH', token: ownerToken, body: { status: 'closed' },
  });
  assert.equal(closed.status, 200);

  const removeTemplate = await api(ctx.baseUrl, `/api/admin/messages/templates/${template.data.template.id}`, {
    method: 'DELETE', token: ownerToken,
  });
  assert.equal(removeTemplate.status, 200);
});

test('owner reads the filterable access log with device and referrer details', async () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
  for (const [ua, source] of [[iphone, 'instagram'], [android, 'telegram']]) {
    const res = await fetch(`${ctx.baseUrl}/api/analytics/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': ua },
      body: JSON.stringify({ event_type: 'page_view', path: '/', source, medium: 'social' }),
    });
    assert.equal(res.status, 204);
  }
  const all = await api(ctx.baseUrl, '/api/admin/marketing/access-log?sort=ip&dir=asc', { token: ownerToken });
  assert.equal(all.status, 200);
  assert.ok(all.data.total >= 2);
  const ios = await api(ctx.baseUrl, '/api/admin/marketing/access-log?device=ios&q=instagram', { token: ownerToken });
  assert.equal(ios.data.rows.length, 1);
  assert.equal(ios.data.rows[0].os, 'iOS');
  assert.equal(ios.data.rows[0].source, 'instagram');
  assert.ok(ios.data.rows[0].ip);
  const stats = await api(ctx.baseUrl, '/api/admin/marketing/access-stats?days=7', { token: ownerToken });
  assert.ok(stats.data.devices.some(d => d.label === 'android'));
  assert.equal((await api(ctx.baseUrl, '/api/admin/marketing/access-log', { token: referrerToken })).status, 403);
});

test('student calendar lists scheduled conferences next to lessons', async () => {
  const when = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 15, 12)).toISOString();
  ctx.db.prepare(`
    INSERT INTO conferences (room_code, title, host_user_id, scheduled_at, duration_minutes)
    VALUES ('CALTEST01', 'Calendar conference', ?, ?, 45)
  `).run(owner.id, when);
  const month = when.slice(0, 7);
  const res = await api(ctx.baseUrl, `/api/calendar/events?month=${month}`, { token: referrerToken });
  assert.equal(res.status, 200);
  const item = res.data.events.find((e) => e.source === 'conference' && e.title === 'Calendar conference');
  assert.ok(item);
  assert.equal(item.url, '/room.html?id=' + item.id.replace('conference-', ''));
});
