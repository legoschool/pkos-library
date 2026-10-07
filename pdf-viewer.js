import {getDocument, GlobalWorkerOptions} from './vendor/pdfjs/pdf.mjs';
import {createPageViewer} from './page-viewer.js';
GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.mjs', import.meta.url).href;
export async function showPdf(blob, host) {
  const controller = new AbortController(), tasks = new Set();
  const dialog = host.closest('dialog');
  let loading;
  const close = () => { controller.abort(); tasks.forEach(task => task.cancel()); void loading?.destroy(); };
  dialog.addEventListener('close', close, {once: true});
  try {
    const data = new Uint8Array(await blob.arrayBuffer());
    if (controller.signal.aborted) return;
    loading = getDocument({data, isEvalSupported: false,
      cMapUrl: new URL('./vendor/pdfjs/cmaps/', import.meta.url).href, cMapPacked: true,
      standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', import.meta.url).href,
      wasmUrl: new URL('./vendor/pdfjs/wasm/', import.meta.url).href});
    loading.onPassword = () => { host.textContent = '암호가 걸린 PDF입니다. 원본 프로그램에서 암호를 해제한 사본을 첨부해 주세요.'; void loading.destroy(); };
    const pdf = await loading.promise;
    if (controller.signal.aborted) return;
    await createPageViewer(host, {count: pdf.numPages, async render(number, target, thumbnail) {
      const page = await pdf.getPage(number);
      if (controller.signal.aborted) return;
      const natural = page.getViewport({scale: 1});
      const width = thumbnail ? 120 : Math.max(200, target.clientWidth || 650);
      const viewport = page.getViewport({scale: Math.min(2, width / natural.width)});
      const ratio = thumbnail ? 1 : Math.min(devicePixelRatio || 1, 2);
      const canvas = document.createElement('canvas'); canvas.setAttribute('aria-label', 'PDF ' + number + '페이지');
      canvas.width = Math.ceil(viewport.width * ratio); canvas.height = Math.ceil(viewport.height * ratio);
      target.replaceChildren(canvas);
      const renderTask = page.render({canvasContext: canvas.getContext('2d'), viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0]});
      tasks.add(renderTask);
      try { await renderTask.promise; } finally { tasks.delete(renderTask); }
      if (controller.signal.aborted) return;
      const text = thumbnail ? '' : (await page.getTextContent()).items.map(i => i.str).join(' ');
      return {text, dispose() { canvas.width = 0; canvas.height = 0; canvas.remove(); }};
    }}, controller.signal);
  } catch (e) {
    if (!controller.signal.aborted && !host.textContent.includes('암호가 걸린')) host.textContent = 'PDF를 미리 볼 수 없습니다. 원본 파일을 확인해 주세요. ' + e.message;
  }
}
