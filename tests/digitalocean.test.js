import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSearchHits,
  parseAtomFeed,
  searchDigitalOcean,
  clearDigitalOceanCache,
} from '../server/services/digitalocean.service.js';

const SAMPLE_API = {
  hits: [
    {
      type: 'tutorial',
      permalink: 'https://www.digitalocean.com/community/tutorials/how-to-install-nginx',
      title: 'How To Install Nginx',
      summary: 'Install and configure Nginx on Ubuntu.',
      tags: ['Nginx', 'Ubuntu'],
      authors: ['Sam the Shark'],
    },
    {
      type: 'tutorial',
      permalink: 'https://www.digitalocean.com/community/conceptual-articles/foo',
      title: 'Conceptual Piece',
      summary: 'Concepts.',
    },
    {
      type: 'question',
      permalink: 'https://www.digitalocean.com/community/questions/x',
      title: 'Should skip',
    },
    {
      type: 'tutorial',
      permalink: 'https://evil.example/x',
      title: 'Bad host',
    },
  ],
};

const SAMPLE_ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title type="html"><![CDATA[Latest DO Tutorial]]></title>
    <link href="https://www.digitalocean.com/community/tutorials/latest-do-tutorial"/>
    <summary type="html"><![CDATA[A short summary about Docker.]]></summary>
  </entry>
  <entry>
    <title>Bad</title>
    <link href="https://evil.example/nope"/>
  </entry>
</feed>`;

test('parseSearchHits maps safe tutorial hits', () => {
  const cards = parseSearchHits(SAMPLE_API);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].title, 'How To Install Nginx');
  assert.equal(cards[0].url, 'https://www.digitalocean.com/community/tutorials/how-to-install-nginx');
  assert.match(cards[0].excerpt, /Nginx/);
  assert.deepEqual(cards[0].tags, ['Nginx', 'Ubuntu']);
  assert.equal(cards[0].source, 'digitalocean');
  assert.equal(cards[1].title, 'Conceptual Piece');
});

test('parseAtomFeed extracts tutorial entries', () => {
  const cards = parseAtomFeed(SAMPLE_ATOM);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].title, 'Latest DO Tutorial');
  assert.equal(cards[0].url, 'https://www.digitalocean.com/community/tutorials/latest-do-tutorial');
  assert.match(cards[0].excerpt, /Docker/);
});

test('searchDigitalOcean uses query param and caches', async () => {
  clearDigitalOceanCache();
  let calls = 0;
  let lastUrl = '';
  const fetchImpl = async (url) => {
    calls += 1;
    lastUrl = String(url);
    return {
      ok: true,
      async text() { return JSON.stringify(SAMPLE_API); },
    };
  };
  const first = await searchDigitalOcean('nginx', { limit: 5, fetchImpl });
  const second = await searchDigitalOcean('nginx', { limit: 5, fetchImpl });
  assert.equal(first.results.length, 2);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
  assert.match(lastUrl, /query=nginx/);
  assert.match(lastUrl, /type=tutorial/);
  assert.match(first.source_url, /tutorials\?q=nginx/);
});

test('searchDigitalOcean ignores short queries', async () => {
  const empty = await searchDigitalOcean('a');
  assert.deepEqual(empty.results, []);
});
