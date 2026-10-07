// Shared page navigation. Only nearby thumbnails are mounted.
export async function createPageViewer(host, source, signal) {
  if (signal.aborted) return;
  const count = source.count;
  if (!Number.isSafeInteger(count) || count < 1 || count > 10000) throw Error('페이지 수를 확인할 수 없거나 미리보기 한도(10,000쪽)를 넘었습니다.');
  host.innerHTML = `<div class="page-controls pdf-controls"><button type="button" data-pages-toggle aria-pressed="true">쪽 목록</button><button type="button" data-pdf-step="-1" aria-label="이전 페이지">이전</button><label><input type="number" min="1" max="${count}" value="1" aria-label="쪽 번호"> / ${count}</label><button type="button" data-pdf-step="1" aria-label="다음 페이지">다음</button><span role="status" class="sr-only"></span></div><div class="page-layout"><nav class="page-thumbnails" aria-label="페이지 미리보기"></nav><div class="page-reading"><div class="document-page"></div><p class="page-error" role="alert" hidden></p><details><summary>페이지 텍스트</summary><pre class="pdf-text"></pre></details></div></div>`;
  const nav = host.querySelector('.page-thumbnails'), stage = host.querySelector('.document-page');
  const input = host.querySelector('input'), status = host.querySelector('[role=status]');
  const error = host.querySelector('.page-error'), handles = new Map(), visible = new Set();
  let requested = 1, rendered = 0, running = false, thumbRunning = false, pageDispose = null;
  const buttons = [];
  for (let page = 1; page <= count; page++) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.page = page;
    button.setAttribute('aria-label', page + '쪽 보기');
    button.innerHTML = '<span class="page-thumbnail-image" aria-hidden="true"></span><span>' + page + '</span>';
    nav.append(button); buttons.push(button);
  }
  function update() {
    input.value = requested;
    host.querySelector('[data-pdf-step="-1"]').disabled = requested === 1;
    host.querySelector('[data-pdf-step="1"]').disabled = requested === count;
    buttons.forEach((b, i) => b.setAttribute('aria-current', i + 1 === requested ? 'page' : 'false'));
  }
  async function draw() {
    if (running || signal.aborted) return;
    running = true;
    try {
      while (!signal.aborted && rendered !== requested) {
        const page = requested;
        host.setAttribute('aria-busy', 'true'); error.hidden = true; delete host.dataset.rendered;
        pageDispose?.(); pageDispose = null; stage.replaceChildren();
        try {
          const result = await source.render(page, stage, false);
          if (signal.aborted) { result?.dispose?.(); return; }
          pageDispose = result?.dispose;
          host.querySelector('.pdf-text').textContent = result?.text || '이 페이지에는 읽을 수 있는 텍스트가 없습니다.';
          host.querySelector('details').hidden = source.hideText === true;
          host.dataset.rendered = String(page); status.textContent = page + ' / ' + count + ' 페이지';
        } catch (e) {
          if (signal.aborted) return;
          error.textContent = '이 페이지를 표시하지 못했습니다. 다른 쪽을 선택하거나 원본을 확인하세요. ' + e.message;
          error.hidden = false; host.querySelector('.pdf-text').textContent = '';
        }
        rendered = page;
      }
    } finally { running = false; host.removeAttribute('aria-busy'); }
  }
  function go(page) {
    if (!Number.isInteger(page) || page < 1 || page > count) { input.value = requested; return; }
    requested = page; update(); buttons[page - 1].scrollIntoView({block: 'nearest', inline: 'nearest'}); void draw();
  }
  async function drawThumbs() {
    if (thumbRunning || signal.aborted) return;
    thumbRunning = true;
    try {
      for (const button of visible) {
        if (signal.aborted) break;
        if (handles.has(button)) continue;
        const target = button.firstElementChild; handles.set(button, null);
        try {
          const handle = await source.render(Number(button.dataset.page), target, true);
          if (signal.aborted || !visible.has(button)) { handle?.dispose?.(); target.replaceChildren(); handles.delete(button); }
          else handles.set(button, handle?.dispose || null);
        } catch { target.textContent = '미리보기 없음'; }
      }
    } finally { thumbRunning = false; }
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const b = entry.target;
      if (entry.isIntersecting) visible.add(b);
      else { visible.delete(b); handles.get(b)?.(); handles.delete(b); b.firstElementChild.replaceChildren(); }
    }
    void drawThumbs();
  }, {root: nav, rootMargin: '120px'});
  buttons.forEach(b => observer.observe(b));
  host.addEventListener('click', e => {
    const button = e.target.closest('button'); if (!button) return;
    if (button.dataset.pdfStep) go(requested + Number(button.dataset.pdfStep));
    if (button.dataset.page) go(Number(button.dataset.page));
    if (button.hasAttribute('data-pages-toggle')) {
      const hidden = host.classList.toggle('pages-hidden'); button.setAttribute('aria-pressed', String(!hidden)); rendered = 0; void draw();
    }
  }, {signal});
  input.addEventListener('change', () => go(Number(input.value)), {signal});
  host.addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    const page = {ArrowLeft: requested - 1, ArrowRight: requested + 1, Home: 1, End: count}[e.key];
    if (page !== undefined) { e.preventDefault(); e.stopPropagation(); go(page); }
  }, {signal});
  let resizeTimer, lastWidth = stage.clientWidth;
  const resize = new ResizeObserver(() => {
    if (stage.clientWidth === lastWidth) return; lastWidth = stage.clientWidth;
    clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (!signal.aborted) { rendered = 0; void draw(); } }, 160);
  });
  resize.observe(stage);
  signal.addEventListener('abort', () => {
    clearTimeout(resizeTimer); observer.disconnect(); resize.disconnect();
    pageDispose?.(); handles.forEach(dispose => dispose?.()); handles.clear(); visible.clear();
  }, {once: true});
  update(); await draw();
}
