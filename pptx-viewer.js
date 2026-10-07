// An opaque-origin frame keeps slide content separate from stored records.
export async function showPptx(blob, host) {
  const frame = document.createElement('iframe'); frame.className = 'pptx-frame'; frame.title = 'PPTX 페이지 미리보기';
  frame.setAttribute('sandbox', 'allow-scripts');
  let closed = false;
  const receive = async e => {
    if (e.source !== frame.contentWindow || e.data?.type !== 'pkos-pptx-ready' || closed) return;
    window.removeEventListener('message', receive);
    try { const data = await blob.arrayBuffer(); if (!closed) frame.contentWindow.postMessage({type: 'pkos-pptx-open', data}, '*', [data]); }
    catch { if (!closed) host.textContent = '첨부 파일을 읽지 못했습니다. 다시 열어 주세요.'; }
  };
  window.addEventListener('message', receive);
  host.closest('dialog').addEventListener('close', () => { closed = true; window.removeEventListener('message', receive); frame.remove(); }, {once: true});
  try {
    const response = await fetch(new URL('./pptx-preview.html', import.meta.url));
    if (!response.ok) throw Error('미리보기 화면을 불러오지 못했습니다.');
    const html = await response.text();
    if (closed || !host.isConnected) return;
    frame.srcdoc = html; host.replaceChildren(frame);
  } catch {
    window.removeEventListener('message', receive);
    if (!closed) host.textContent = '미리보기 화면을 불러오지 못했습니다. 인터넷에 연결해 기록장을 한 번 새로고침한 뒤 다시 열어 주세요.';
  }
}
