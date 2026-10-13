import {marked} from './vendor/marked.js';

const MAX_URL_LENGTH = 4096;
const MAX_START_SECONDS = 86400;
const controls = /[\u0000-\u001f\u007f-\u009f]/;
const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const embedHosts = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com']);
const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const entities = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', colon: ':', Tab: '\t', NewLine: '\n'};

function decodeEntities(text) {
 return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (raw, name) => {
  if (name[0] !== '#') return Object.hasOwn(entities, name) ? entities[name] : raw;
  const value = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : raw;
 });
}

function plainLabel(tokens = []) {
 return tokens.map(token => {
  if (token.type === 'html') return '';
  if (token.tokens) return plainLabel(token.tokens);
  return ['text', 'escape', 'codespan', 'image'].includes(token.type) ? String(token.text || '') : token.type === 'br' ? ' ' : '';
 }).join('');
}

function normalizeLink(token) {
 if (typeof token.href !== 'string' || token.href.length > MAX_URL_LENGTH || controls.test(token.href)) return null;
 let raw = decodeEntities(token.href);
 if (controls.test(raw)) return null;
 raw = raw.trim();
 // Marked handles ASCII punctuation and balanced parentheses; prose also uses these endings.
 if (token.autolink) raw = raw.replace(/[。．，、！？；：”’」』】〉》]+$/u, '');
 if (!/^https?:\/\//i.test(raw) || raw.length > MAX_URL_LENGTH) return null;
 try {
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.href.length > MAX_URL_LENGTH) return null;
  return url;
 } catch { return null; }
}

function startSeconds(value) {
 if (typeof value !== 'string' || value.length > 20) return null;
 let seconds;
 if (/^\d+$/.test(value)) seconds = Number(value);
 else {
  const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(value);
  if (!parts || !parts.slice(1).some(Boolean)) return null;
  seconds = Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0);
 }
 return Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= MAX_START_SECONDS ? seconds : null;
}

function youtubePreview(url) {
 if (url.port) return null;
 let id;
 if (url.hostname === 'youtu.be') id = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
 else if (youtubeHosts.has(url.hostname)) {
  id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
 } else if (embedHosts.has(url.hostname)) id = /^\/embed\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
 if (!id || !videoIdPattern.test(id)) return null;
 const hash = new URLSearchParams(url.hash.slice(1));
 const start = [url.searchParams.get('start'), url.searchParams.get('t'), hash.get('start'), hash.get('t')].map(startSeconds).find(value => value !== null);
 return {
  videoId: id,
  embedUrl: `https://www.youtube-nocookie.com/embed/${id}${start ? '?start=' + start : ''}`,
  thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
 };
}

// Derive local card data only: no requests, HTML rendering, or edits to the Markdown.
export function extractBodyLinks(markdown, {limit = 20} = {}) {
 const maximum = Number.isFinite(limit) ? Math.min(100, Math.max(0, Math.floor(limit))) : 20;
 if (typeof markdown !== 'string' || !markdown || !maximum) return [];
 const links = [], seen = new Set();
 try {
  marked.walkTokens(marked.lexer(markdown), token => {
   if (token.type !== 'link' || links.length >= maximum) return;
   const url = normalizeLink(token);
   if (!url || seen.has(url.href)) return;
   seen.add(url.href);
   const preview = youtubePreview(url);
   const label = decodeEntities(plainLabel(token.tokens)).replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
   const title = !token.autolink && label && !/^(?:https?:\/\/|www\.)/i.test(label) ? label : preview ? 'YouTube 동영상' : url.hostname;
   links.push({url: url.href, title, hostname: url.hostname, kind: preview ? 'youtube' : 'web', ...preview});
  });
 } catch { return []; }
 return links;
}
