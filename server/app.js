import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import config from './config/index.js';
import { requestLogger } from './middleware/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import publicRoutes from './routes/public.routes.js';
import apiRoutes from './routes/api.routes.js';
import conferenceRoutes from './routes/conference.routes.js';
import recordingRoutes from './routes/recording.routes.js';
import adminRoutes from './routes/admin.routes.js';
import chatRoutes from './routes/chat.routes.js';
import labRoutes from './routes/lab.routes.js';
import codeRoutes from './routes/code.routes.js';
import ctfDemoRoutes from './routes/ctf-demo.routes.js';
import tunnelRoutes from './routes/tunnel.routes.js';
import sitemapRoutes from './routes/sitemap.routes.js';
import { trySslipHostTunnel } from './services/tunnel.service.js';
import * as programService from './services/program.service.js';
import * as directionService from './services/direction.service.js';
import * as contentService from './services/content.service.js';
import * as marketingService from './services/marketing.service.js';
import './db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

function setStaticCacheHeaders(res, filePath) {
  const name = filePath.split(/[/\\]/).pop() || '';
  if (name.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    return;
  }
  if (!config.isProd) {
    res.setHeader('Cache-Control', 'no-cache');
    return;
  }
  if (/\.(css|js|mjs)$/i.test(name)) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.setHeader('X-Asset-Version', config.staticVersion);
    return;
  }
  if (/\.(svg|png|jpg|jpeg|webp|ico|woff2?)$/i.test(name)) {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  }
}

function injectAssetVersion(html) {
  const v = encodeURIComponent(config.staticVersion || '');
  if (!v) return html;
  return html.replace(
    /(\s(?:href|src)=["'])(\/[^"']+\.(?:css|js|mjs))(["'])/gi,
    `$1$2?v=${v}$3`,
  );
}

function sendHtmlPage(res, filePath, fallbackPath) {
  const resolved = existsSync(filePath) ? filePath : fallbackPath;
  let html = readFileSync(resolved, 'utf8');
  html = injectAssetVersion(html);
  if (html.includes('/analytics.js') === false
    && ['/index.html', '/login.html', '/register.html'].includes(`/${resolved.split('/').pop()}`)) {
    html = html.replace('</body>', '  <script type="module" src="/analytics.js"></script>\n</body>');
  }
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.type('html').send(html);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function renderCourseBlock(block) {
  const data = block.data || {};
  const escapeText = (value) => escapeHtml(value).replace(/\n/g, '<br>');

  switch (block.block_type) {
    case 'heading': {
      const level = Math.min(3, Math.max(1, parseInt(data.level, 10) || 2));
      return `<h${level} class="cb-heading cb-heading--${level}">${escapeHtml(data.text)}</h${level}>`;
    }
    case 'text':
      return `<div class="cb-text">${escapeText(data.text)}</div>`;
    case 'list': {
      const tag = data.style === 'number' ? 'ol' : 'ul';
      const items = Array.isArray(data.items) ? data.items : [];
      return `<${tag} class="cb-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</${tag}>`;
    }
    case 'callout': {
      const variant = ['info', 'warning', 'success'].includes(data.variant) ? data.variant : 'info';
      return `<aside class="cb-callout cb-callout--${variant}">${data.title ? `<strong class="cb-callout-title">${escapeHtml(data.title)}</strong>` : ''}<p>${escapeText(data.text)}</p></aside>`;
    }
    case 'link': {
      let url;
      try {
        url = new URL(String(data.url || ''));
      } catch {
        return '';
      }
      if (!['https:', 'http:'].includes(url.protocol)) return '';
      return `<p class="cb-link-wrap"><a href="${escapeHtml(url.href)}" class="btn btn--outline" target="_blank" rel="noopener noreferrer">${escapeHtml(data.label || url.hostname)}</a></p>`;
    }
    case 'cards': {
      const items = Array.isArray(data.items) ? data.items : [];
      return `<div class="cb-cards">${items.map(item => `<article class="cb-card"><h3>${escapeHtml(item.title)}</h3>${item.text ? `<p>${escapeText(item.text)}</p>` : ''}</article>`).join('')}</div>`;
    }
    case 'steps': {
      const items = Array.isArray(data.items) ? data.items : [];
      return `<ol class="cb-steps">${items.map(item => `<li class="cb-step"><strong>${escapeHtml(item.title)}</strong><p>${escapeText(item.text)}</p></li>`).join('')}</ol>`;
    }
    case 'quote':
      return `<blockquote class="cb-quote"><p>${escapeText(data.text)}</p>${data.author ? `<cite>— ${escapeHtml(data.author)}</cite>` : ''}</blockquote>`;
    case 'divider':
      return '<hr class="cb-divider">';
    default:
      return '';
  }
}

function renderCourseContent(page) {
  if (!page?.sections?.length) return '';
  const sections = page.sections.map(section => `
    <section class="cb-section">
      <header class="cb-section-head"><h2>${escapeHtml(section.title)}</h2></header>
      <div class="cb-section-body">
        ${(section.blocks || []).map((block) => {
          const markup = renderCourseBlock(block);
          return markup
            ? `<div class="cb-block cb-block--${escapeHtml(block.block_type)}">${markup}</div>`
            : '';
        }).join('')}
      </div>
    </section>`).join('');
  return `<div class="container course-content"><div class="cb-body">${sections}</div></div>`;
}

function sendCoursePage(req, res) {
  const id = /^\d+$/.test(String(req.query.id || '')) ? Number(req.query.id) : 0;
  const program = id ? programService.getById(id) : null;
  const direction = program?.direction_id ? directionService.getById(program.direction_id) : null;
  if (!program?.is_active || (program.direction_id && !direction?.is_active)) {
    return res.status(404).type('html').send(
      '<!doctype html><html lang="uk"><meta charset="utf-8"><title>Курс не знайдено — laboratorium.</title><meta name="robots" content="noindex"><main><h1>Курс не знайдено</h1><p>Цю програму не знайдено або її більше не опубліковано.</p><a href="/">Переглянути програми</a></main></html>',
    );
  }

  const sourceDescription = String(program.description || `Навчальна програма «${program.name}» у школі laboratorium.`)
    .replace(/\s+/g, ' ')
    .trim();
  const description = sourceDescription.length > 160
    ? `${sourceDescription.slice(0, 157).trimEnd()}…`
    : sourceDescription;
  const title = `${program.name} — laboratorium.`;
  const canonical = `${config.siteUrl.replace(/\/+$/, '')}/course.html?id=${program.id}`;
  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: program.name,
    description,
    provider: {
      '@type': 'EducationalOrganization',
      name: 'laboratorium.',
      url: `${config.siteUrl.replace(/\/+$/, '')}/`,
    },
  }).replace(/</g, '\\u003c');
  const page = contentService.getPublishedProgramPage(program.id);
  const applicationUrl = `/?direction=${encodeURIComponent(direction?.slug || '')}#contact`;

  let html = readFileSync(join(publicDir, 'course.html'), 'utf8');
  html = html
    .replaceAll('{{COURSE_TITLE}}', escapeHtml(title))
    .replaceAll('{{COURSE_DESCRIPTION}}', escapeHtml(description))
    .replaceAll('{{COURSE_CANONICAL}}', escapeHtml(canonical))
    .replace('{{COURSE_SCHEMA}}', schema)
    .replace(
      '<div id="course-view"></div>',
      `<div id="course-view">
        <header class="course-hero">
          <div class="container course-hero-inner">
            <p class="course-eyebrow">${escapeHtml(direction?.name || 'Програма курсу')}</p>
            <h1 class="course-title">${escapeHtml(program.name)}</h1>
            <p class="course-lede">${escapeHtml(description)}</p>
            <div class="course-stats">
              <div class="course-stat">
                <span class="course-stat-label">Рівень</span>
                <span class="course-stat-value">${escapeHtml(program.level)}</span>
              </div>
              <div class="course-stat">
                <span class="course-stat-label">Тривалість</span>
                <span class="course-stat-value">${escapeHtml(program.duration)}</span>
              </div>
            </div>
            <a href="${escapeHtml(applicationUrl)}" class="btn btn--primary">Подати заявку на напрям</a>
          </div>
        </header>
        ${renderCourseContent(page)}
      </div>`,
    );

  html = injectAssetVersion(html);
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.type('html').send(html);
}

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  const corsOrigins = String(config.cors.origin || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== '*');
  app.use(cors(
    corsOrigins.length
      ? { origin: corsOrigins, credentials: true }
      : { origin: false, credentials: false },
  ));

  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Забагато запитів', code: 'RATE_LIMIT' },
  });
  app.use('/api', limiter);

  app.use('/api/auth', authRoutes);
  app.use('/api', publicRoutes);
  app.use('/api', apiRoutes);
  app.use('/api/conferences', conferenceRoutes);
  app.use('/api/recordings', recordingRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/lab', labRoutes);
  app.use('/api/code', codeRoutes);
  app.use(sitemapRoutes);

  app.use(trySslipHostTunnel);
  app.use('/lab/t', tunnelRoutes);
  app.use('/lab/demo', ctfDemoRoutes);

  app.use((req, _res, next) => {
    if (req.method === 'GET' && (req.path === '/' || req.path.endsWith('.html'))) {
      marketingService.recordBotRequest(req.originalUrl, req.headers['user-agent']);
    }
    next();
  });

  app.get('/course.html', sendCoursePage);

  app.use('/uploads', express.static(config.uploads.dir, {
    etag: true,
    setHeaders: (res, filePath) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'attachment');
      const name = filePath.split(/[/\\]/).pop() || '';
      if (/\.(html?|svg|js|mjs|xml|xhtml)$/i.test(name)) {
        res.setHeader('Content-Type', 'application/octet-stream');
      }
      setStaticCacheHeaders(res, filePath);
    },
  }));

  app.use(express.static(publicDir, {
    etag: true,
    index: false,
    setHeaders: setStaticCacheHeaders,
  }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    if (req.method !== 'GET') return next();
    const page = req.path.endsWith('.html') ? req.path.slice(1) : 'index.html';
    sendHtmlPage(res, join(publicDir, page), join(publicDir, 'index.html'));
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
