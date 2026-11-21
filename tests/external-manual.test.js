import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeArticleHtml,
  markdownToHtml,
  interleave,
  toCatalogCard,
  normalizeExternalUrl,
  fetchExternalManual,
  clearExternalManualCache,
} from '../server/services/external-manual.service.js';

test('normalizeExternalUrl allows only known hosts', () => {
  const u = normalizeExternalUrl('http://spy-soft.net/foo/');
  assert.equal(u.href, 'https://spy-soft.net/foo/');
  assert.throws(() => normalizeExternalUrl('https://evil.example/x'));
});

test('sanitizeArticleHtml strips scripts and keeps content', () => {
  const html = sanitizeArticleHtml(
    '<p>Hi <script>alert(1)</script><strong>there</strong></p><img src="https://spy-soft.net/a.png" onerror="x"><a href="javascript:alert(1)">bad</a><a href="https://spy-soft.net/ok">ok</a>',
    'https://spy-soft.net/post/',
  );
  assert.match(html, /Hi/);
  assert.match(html, /<strong>there<\/strong>/);
  assert.doesNotMatch(html, /script|onerror|javascript/i);
  assert.match(html, /href="https:\/\/spy-soft\.net\/ok"/);
});

test('markdownToHtml renders headings links and code', () => {
  const html = markdownToHtml('# Title\n\nSee [nginx](https://www.nginx.com/) and `rewrite`.\n\n```bash\necho hi\n```\n');
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<a href="https:\/\/www\.nginx\.com\/"/);
  assert.match(html, /<code>rewrite<\/code>/);
  assert.match(html, /<pre><code class="language-bash">/);
});

test('interleave mixes arrays', () => {
  assert.deepEqual(
    interleave([{ id: 1 }, { id: 2 }], [{ id: 'a' }]).map((x) => x.id),
    [1, 'a', 2],
  );
});

test('toCatalogCard hides source and points on-site', () => {
  const card = toCatalogCard({
    title: 'VPN Guide',
    excerpt: 'About VPN',
    url: 'https://spy-soft.net/vpn/',
    image: null,
    tags: ['vpn'],
  });
  assert.equal(card.href, '/manual.html?url=https%3A%2F%2Fspy-soft.net%2Fvpn%2F');
  assert.equal(card.source, undefined);
  assert.equal(card.source_label, undefined);
});

test('fetchExternalManual parses DigitalOcean JSON API', async () => {
  clearExternalManualCache();
  const fetchImpl = async (url) => {
    assert.match(String(url), /api\/static-content\/v1\/tutorials\/nginx-demo/);
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      async text() {
        return JSON.stringify({
          title: 'Nginx Demo',
          description: 'Demo tutorial',
          content: '## Intro\n\nUse **nginx** wisely.\n',
          header_url: null,
        });
      },
    };
  };
  const article = await fetchExternalManual(
    'https://www.digitalocean.com/community/tutorials/nginx-demo',
    { fetchImpl },
  );
  assert.equal(article.title, 'Nginx Demo');
  assert.match(article.html, /<h2>Intro<\/h2>/);
  assert.match(article.html, /<strong>nginx<\/strong>/);
  assert.equal(article.cached, false);
});

test('fetchExternalManual parses spy-soft entry-content', async () => {
  clearExternalManualCache();
  const fetchImpl = async () => ({
    ok: true,
    headers: { get: () => 'text/html' },
    async text() {
      return `<html><body>
        <h1 class="entry-title">Spy Soft Post</h1>
        <div class="entry-content"><p>Body of the <em>manual</em>.</p><script>bad()</script></div>
        <div class="entry-social">share</div>
      </body></html>`;
    },
  });
  const article = await fetchExternalManual('https://spy-soft.net/spy-soft-post/', { fetchImpl });
  assert.equal(article.title, 'Spy Soft Post');
  assert.match(article.html, /Body of the/);
  assert.doesNotMatch(article.html, /script|bad\(\)/i);
});
