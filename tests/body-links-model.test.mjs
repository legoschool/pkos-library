import test from 'node:test';
import assert from 'node:assert/strict';
import {extractBodyLinks} from '../body-links-model.js';

const id = 'AbCdEf12_-3';
const card = text => extractBodyLinks(text)[0];

test('bare, Markdown, angle and www links produce local card data in order', () => {
 const links = extractBodyLinks('https://example.com/a\n\n[공식 안내](https://docs.example.com/)\n\n<http://example.org/>\n\nwww.example.net/start');
 assert.deepEqual(links.map(link => [link.url, link.title, link.kind]), [
  ['https://example.com/a', 'example.com', 'web'],
  ['https://docs.example.com/', '공식 안내', 'web'],
  ['http://example.org/', 'example.org', 'web'],
  ['http://www.example.net/start', 'www.example.net', 'web']
 ]);
 assert.ok(links.every(link => !link.embedUrl && !link.thumbnailUrl));
});

test('normalized links deduplicate without discarding query or fragment for opening', () => {
 const links = extractBodyLinks('https://EXAMPLE.com:443\n\n[중복](https://example.com/)\n\nhttps://example.com/?a=1&b=2#part');
 assert.equal(links.length, 2);
 assert.equal(links[0].url, 'https://example.com/');
 assert.equal(links[1].url, 'https://example.com/?a=1&b=2#part');
 assert.equal(card('<https://example.com/?a=1&amp;b=2>').url, 'https://example.com/?a=1&b=2');
});

test('code and raw HTML do not create cards, while normal list and quote links do', () => {
 const markdown = '`https://example.com/inline`\n\n```text\nhttps://example.com/fence\n```\n\n<a href="https://example.com/html">HTML</a>\n\n![image](https://example.com/picture.png)\n\n- https://example.com/list\n\n> https://example.com/quote';
 assert.deepEqual(extractBodyLinks(markdown).map(link => link.url), ['https://example.com/list', 'https://example.com/quote']);
});

test('plain labels remove formatting and HTML instead of returning markup', () => {
 assert.equal(card('[**강조** <b>제목</b> &amp; `코드`](https://example.com/)').title, '강조 제목 & 코드');
 assert.equal(card('[&lt;img src=x&gt;안내](https://example.com/)').title, '안내');
 assert.equal(card('[&constructor;](https://example.com/)').title, '&constructor;');
 assert.equal(card(`[영상 이름](https://youtu.be/${id})`).title, '영상 이름');
 assert.equal(card(`[${'긴'.repeat(200)}](https://example.com/)`).title.length, 160);
});

test('prose punctuation is trimmed while balanced URL parentheses and explicit paths remain', () => {
 assert.equal(card('여기 https://example.com/a_(b). 다음').url, 'https://example.com/a_(b)');
 assert.equal(card(`영상 https://youtu.be/${id}。`).videoId, id);
 assert.equal(card('https://example.com/경로”').url, 'https://example.com/%EA%B2%BD%EB%A1%9C');
 assert.equal(card('[구두점 경로](https://example.com/。)').url, 'https://example.com/%E3%80%82');
});

test('HTTP(S) only, no credentials or literal and entity-decoded control characters', () => {
 for (const href of ['javascript:alert(1)', 'java&#115;cript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', '//example.com/', 'https://user:pass@example.com/', 'https://user@example.com/', 'https://example.com/a\u0000b', 'https://example.com/a\u0085b', 'https://example.com/a&#10;b', 'https://example.com/a&Tab;b']) {
  assert.deepEqual(extractBodyLinks(`[이름](${href})`), [], href);
 }
 assert.equal(card('http://example.com/').kind, 'web');
});

test('oversized URLs are rejected and card count is bounded', () => {
 assert.deepEqual(extractBodyLinks(`[긴 주소](https://example.com/${'a'.repeat(4096)})`), []);
 const markdown = Array.from({length:30}, (_,i) => `https://example.com/${i}`).join('\n\n');
 assert.equal(extractBodyLinks(markdown).length, 20);
 assert.equal(extractBodyLinks(markdown, {limit:3}).length, 3);
 assert.equal(extractBodyLinks(markdown, {limit:0}).length, 0);
 assert.equal(extractBodyLinks(markdown, {limit:-2}).length, 0);
 assert.equal(extractBodyLinks(null).length, 0);
});

test('recognized YouTube hosts and routes use a fixed privacy embed and thumbnail origin', () => {
 for (const href of [`https://youtu.be/${id}?si=sample`, `https://youtube.com/watch?feature=share&v=${id}`, `https://www.youtube.com/shorts/${id}`, `https://m.youtube.com/live/${id}`, `https://music.youtube.com/watch?v=${id}`, `https://www.youtube.com/embed/${id}`, `https://www.youtube-nocookie.com/embed/${id}`]) {
  const link = card(href);
  assert.equal(link.kind, 'youtube', href);
  assert.equal(link.title, 'YouTube 동영상');
  assert.equal(link.videoId, id);
  assert.equal(link.embedUrl, `https://www.youtube-nocookie.com/embed/${id}`);
  assert.equal(link.thumbnailUrl, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
  assert.equal(link.url, new URL(href).href);
 }
});

test('lookalike hosts, unexpected ports and malformed IDs remain ordinary web cards', () => {
 for (const href of [`https://youtube.com.evil.example/watch?v=${id}`, `https://evil.example/youtu.be/${id}`, `https://www.youtube.com:444/watch?v=${id}`, `https://youtube.com./watch?v=${id}`, `https://youtu.be/${id}extra`, `https://youtu.be/${id}/more`, 'https://youtube.com/watch?v=short', `https://youtube.com/watch?v=${id}%3C`]) {
  const link = card(href);
  assert.equal(link.kind, 'web', href);
  assert.equal(link.embedUrl, undefined);
 }
 assert.deepEqual(extractBodyLinks(`https://youtube.com@evil.example/watch?v=${id}`), []);
});

test('valid t/start values become bounded seconds without forwarding autoplay or other query data', () => {
 for (const [suffix, seconds] of [['?t=90',90], ['?t=1m30s',90], ['?t=1h2m3s',3723], ['?start=15&t=60',15], ['#t=2m',120], ['?t=86400',86400]]) {
  assert.equal(card(`https://youtu.be/${id}${suffix}`).embedUrl, `https://www.youtube-nocookie.com/embed/${id}?start=${seconds}`);
 }
 const link = card(`https://youtube.com/watch?autoplay=1&v=${id}&t=30s&origin=https://evil.example`);
 assert.equal(link.embedUrl, `https://www.youtube-nocookie.com/embed/${id}?start=30`);
 assert.match(link.url, /autoplay=1/);
 for (const value of ['-1','1.5','999999999999999999999','86401','bad','1mBAD','0']) {
  assert.equal(card(`https://youtu.be/${id}?t=${value}`).embedUrl, `https://www.youtube-nocookie.com/embed/${id}`, value);
 }
});
