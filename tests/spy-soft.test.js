import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePostCards, searchSpySoft, clearSpySoftCache } from '../server/services/spy-soft.service.js';

const SAMPLE = `
<html><body>
<div class="post-card">
  <div class="post-card__thumbnail"><img src="https://spy-soft.net/wp-content/uploads/a.jpg" alt=""></div>
  <div class="post-card__content">
    <h2 class="post-card__title"><a href="https://spy-soft.net/vpn-guide/">Налаштування VPN</a></h2>
    <div class="post-card__description">Короткий гайд по OpenVPN і WireGuard.</div>
  </div>
</div>
<div class="post-card featured">
  <h2 class="post-card__title"><a href="/burp-suite/">Burp Suite &#8212; старт</a></h2>
  <div class="post-card__description">Базовий мануал.</div>
</div>
<div class="post-card">
  <h2 class="post-card__title"><a href="https://evil.example/x">Bad</a></h2>
</div>
</body></html>
`;

test('parsePostCards extracts safe spy-soft cards', () => {
  const cards = parsePostCards(SAMPLE);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].title, 'Налаштування VPN');
  assert.equal(cards[0].url, 'https://spy-soft.net/vpn-guide/');
  assert.match(cards[0].image, /a\.jpg$/);
  assert.match(cards[0].excerpt, /OpenVPN/);
  assert.equal(cards[1].title, 'Burp Suite — старт');
  assert.equal(cards[1].url, 'https://spy-soft.net/burp-suite/');
  assert.equal(cards[1].source, 'spy-soft');
});

test('searchSpySoft uses fetch and caches', async () => {
  clearSpySoftCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      async text() { return SAMPLE; },
    };
  };
  const first = await searchSpySoft('vpn', { limit: 5, fetchImpl });
  const second = await searchSpySoft('vpn', { limit: 5, fetchImpl });
  assert.equal(first.results.length, 2);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
  assert.match(first.source_url, /s=vpn/);
});

test('searchSpySoft ignores short queries', async () => {
  const empty = await searchSpySoft('a');
  assert.deepEqual(empty.results, []);
});
