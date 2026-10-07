import {PptxViewer, parseZipLazyMedia, buildPresentation, RECOMMENDED_ZIP_LIMITS} from '@aiden0z/pptx-renderer/browser';
import {createPageViewer} from '../page-viewer.js';
const host = document.querySelector('#pages'), controller = new AbortController();
let viewer, opened = false;
window.addEventListener('pagehide', () => { controller.abort(); viewer?.destroy(); }, {once: true});
window.addEventListener('message', async e => {
  if (e.source !== parent || opened || e.data?.type !== 'pkos-pptx-open' || !(e.data.data instanceof ArrayBuffer)) return;
  opened = true;
  try {
    if (e.data.data.byteLength > 20 * 1024 * 1024) throw Error('PPTX는 20MB까지 미리 볼 수 있습니다.');
    const files = await parseZipLazyMedia(e.data.data, {...RECOMMENDED_ZIP_LIMITS, maxTotalUncompressedBytes: 100 * 1024 * 1024});
    const model = buildPresentation(files, {lazySlides: true});
    viewer = new PptxViewer(document.createElement('div'), {pdfjs: false}); viewer.load(model);
    await createPageViewer(host, {count: viewer.slideCount, hideText: true, async render(page, target, thumbnail) {
      const available = target.clientWidth || (thumbnail ? 120 : 650);
      const width = thumbnail ? available : Math.min(available, innerHeight * 0.60 * viewer.slideWidth / viewer.slideHeight);
      const handle = viewer.renderThumbnailToContainer(page - 1, target, {width});
      if (!handle) throw Error('슬라이드를 읽을 수 없습니다.');
      handle.element.style.margin = '0 auto';
      target.inert = true; await handle.ready;
      return {dispose: () => handle.dispose()};
    }}, controller.signal);
  } catch (error) { host.textContent = 'PPTX를 미리 볼 수 없습니다. 손상·암호 여부를 확인하거나 PDF로 저장해 첨부해 주세요. ' + error.message; }
});
parent.postMessage({type: 'pkos-pptx-ready'}, '*');
