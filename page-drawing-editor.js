import {normalizePageAnnotations, validatePageAnnotations, drawPageAnnotations, drawPageAnnotation, hitTestPageAnnotation, PAGE_DRAWING_MAX_ITEMS, PAGE_DRAWING_MAX_POINTS, PAGE_DRAWING_MAX_STROKE_POINTS} from './page-drawing-model.js';

const tools = [
 ['pen', '펜', '<path d="m4 17-1 4 4-1L20 7l-3-3Z"/><path d="m14 7 3 3"/>'],
 ['highlighter', '형광펜', '<path d="m8 14 8-10 5 5-10 8Z"/><path d="m8 14-4 5 4 2 3-4M3 22h12"/>'],
 ['eraser', '지우개', '<path d="m3 14 10-11 9 8-10 11H9Z"/><path d="m7 10 9 8M11 22h11"/>'],
 ['rectangle', '사각형', '<rect x="3" y="5" width="18" height="14" rx="1"/>'],
 ['ellipse', '원', '<ellipse cx="12" cy="12" rx="9" ry="7"/>'],
 ['arrow', '화살표', '<path d="M4 20 20 4M8 4h12v12"/>'],
 ['sticker', '스티커', '<path d="M21 12a9 9 0 1 0-9 9h3l6-6Z"/><path d="M15 21v-6h6M8 14c2 3 6 3 8 0M8 9h.01M16 9h.01"/>']
];
const stickers = [['⭐','별'], ['✅','확인'], ['❤️','하트'], ['👍','좋아요'], ['💡','아이디어'], ['❓','질문'], ['📌','중요'], ['🎯','목표']];
const colors = [['#ef4444','빨강'], ['#f59e0b','노랑'], ['#16a34a','초록'], ['#2563eb','파랑'], ['#9333ea','보라'], ['#1f2937','검정']];
const icon = body => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const round = n => Math.round(n * 100) / 100;
let currentDialog = null;

function loadImage(url) {
 return new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(Error('페이지 이미지를 열 수 없습니다. 닫은 뒤 다시 시도해 주세요.'));
  image.src = url;
 });
}

function canvasBlob(canvas) {
 return new Promise((resolve, reject) => {
  try { canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('그림 이미지를 만들지 못했습니다. 다시 저장해 주세요.')), 'image/png'); }
  catch { reject(Error('그림 이미지를 저장할 수 없습니다. 페이지 이미지를 다시 열어 주세요.')); }
 });
}

/** Opens a modal editor. onSave must persist both the annotations and composite PNG. */
export async function openPageDrawing({imageUrl, annotations, title = '페이지', onSave}) {
 if (currentDialog?.isConnected) { currentDialog.focus(); return false; }
 if (typeof onSave !== 'function') throw Error('그림 저장 기능이 연결되지 않았습니다.');
 const previousFocus = document.activeElement;
 const dialog = document.createElement('dialog');
 dialog.className = 'page-drawing-dialog';
 dialog.setAttribute('aria-labelledby', 'page-drawing-title');
 dialog.setAttribute('aria-describedby', 'page-drawing-hint');
 dialog.innerHTML = `
  <header class="page-drawing-header"><div><h2 id="page-drawing-title">페이지에 그리기</h2><p class="page-drawing-name"></p></div><div class="page-drawing-header-actions"><button type="button" data-drawing-action="cancel">취소</button><button type="button" class="page-drawing-save" data-drawing-action="save" disabled>그림 저장</button></div></header>
  <div class="page-drawing-tools" role="group" aria-label="그리기 도구">${tools.map(([id,label,body]) => `<button type="button" data-drawing-tool="${id}" aria-pressed="${id === 'pen'}" title="${label}">${icon(body)}<span>${label}</span></button>`).join('')}<span class="page-drawing-divider"></span><button type="button" data-drawing-action="undo" aria-label="되돌리기" title="되돌리기 (Ctrl Z)" disabled>${icon('<path d="M3 9h11a7 7 0 0 1 0 14M8 4 3 9l5 5"/>')}</button><button type="button" data-drawing-action="redo" aria-label="다시 실행" title="다시 실행 (Ctrl Shift Z)" disabled>${icon('<path d="M21 9H10a7 7 0 0 0 0 14M16 4l5 5-5 5"/>')}</button><button type="button" data-drawing-action="clear" disabled>모두 지우기</button></div>
  <div class="page-drawing-options"><div class="page-drawing-colors" role="group" aria-label="색상">${colors.map(([color,label]) => `<button type="button" class="page-drawing-swatch" data-drawing-swatch="${color}" style="--swatch:${color}" aria-label="${label}" aria-pressed="${color === '#ef4444'}" title="${label}"></button>`).join('')}<label class="page-drawing-custom-color" title="다른 색상"><span class="sr-only">다른 색상</span><input type="color" data-drawing-color aria-label="다른 색상" value="#ef4444"></label></div><label class="page-drawing-size"><span data-drawing-size-label>굵기</span><input type="range" min="1" max="20" value="4" data-drawing-size aria-label="굵기"><output data-drawing-size-value>4</output></label><div class="page-drawing-stickers" role="group" aria-label="스티커 선택" hidden>${stickers.map(([text,label], i) => `<button type="button" data-drawing-sticker="${text}" aria-label="${label} 스티커" aria-pressed="${i === 0}" title="${label}">${text}</button>`).join('')}</div></div>
  <div class="page-drawing-stage" aria-busy="true"><canvas class="page-drawing-canvas" tabindex="0" aria-label="페이지 그림판. 펜과 도형은 드래그하고 스티커는 원하는 위치를 누르세요." hidden></canvas><p class="page-drawing-loading">이미지를 여는 중…</p></div>
  <footer class="page-drawing-footer"><div><p id="page-drawing-hint">이미지 위를 드래그해 그리세요.</p><p class="page-drawing-status" role="status" aria-live="polite"></p></div><button type="button" data-drawing-action="download" disabled>PNG 내려받기</button></footer>
  <div class="page-drawing-confirm" hidden><div role="alertdialog" aria-modal="true" aria-labelledby="page-drawing-confirm-title" aria-describedby="page-drawing-confirm-text"><h3 id="page-drawing-confirm-title">그리기를 닫을까요?</h3><p id="page-drawing-confirm-text">저장하지 않은 그림은 사라집니다.</p><div><button type="button" data-drawing-action="keep-editing">계속 그리기</button><button type="button" class="page-drawing-discard" data-drawing-action="discard">저장하지 않고 닫기</button></div></div></div>`;
 dialog.querySelector('.page-drawing-name').textContent = title;
 const find = selector => dialog.querySelector(selector);
 const stage = find('.page-drawing-stage'), canvas = find('canvas'), status = find('.page-drawing-status');
 const hint = find('#page-drawing-hint'), confirm = find('.page-drawing-confirm');
 const sizeInput = find('[data-drawing-size]'), colorInput = find('[data-drawing-color]');
 let image, model, initialItems = '', history = [], future = [];
 let activeTool = 'pen', activeColor = '#ef4444', activeSticker = '⭐';
 const sizes = {pen:4, highlighter:24, eraser:14, rectangle:4, ellipse:4, arrow:4, sticker:52};
 let gesture = null, preview = null, dirty = false, saving = false, disposed = false, animation = 0;
 let resolveClosed;
 const closed = new Promise(resolve => { resolveClosed = resolve; });
 const observer = new ResizeObserver(() => resizeCanvas());

 function message(text, error = false) {
  status.textContent = text;
  status.setAttribute('role', error ? 'alert' : 'status');
  status.classList.toggle('is-error', error);
 }
 function refresh() {
  dirty = !!model && JSON.stringify(model.items) !== initialItems;
  const locked = saving || !model || !confirm.hidden;
  find('[data-drawing-action="save"]').disabled = locked;
  find('[data-drawing-action="download"]').disabled = locked;
  find('[data-drawing-action="undo"]').disabled = locked || !history.length;
  find('[data-drawing-action="redo"]').disabled = locked || !future.length;
  find('[data-drawing-action="clear"]').disabled = locked || !model?.items.length;
  dialog.querySelectorAll('[data-drawing-tool], [data-drawing-swatch], [data-drawing-sticker], input').forEach(el => { el.disabled = locked; });
  find('[data-drawing-action="cancel"]').disabled = saving;
  find('[data-drawing-action="save"]').textContent = saving ? '저장 중…' : '그림 저장';
  canvas.setAttribute('aria-disabled', String(locked));
  canvas.style.cursor = activeTool === 'eraser' ? 'cell' : activeTool === 'sticker' ? 'copy' : 'crosshair';
 }
 function render() {
  animation = 0;
  if (!model || disposed || !canvas.width || !canvas.height) return;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.setTransform(canvas.width / model.width, 0, 0, canvas.height / model.height, 0, 0);
  drawPageAnnotations(ctx, model);
  if (preview) drawPageAnnotation(ctx, preview);
 }
 function requestRender() { if (!animation) animation = requestAnimationFrame(render); }
 function resizeCanvas() {
  if (!model || disposed) return;
  const width = Math.max(1, stage.clientWidth - 32), height = Math.max(1, stage.clientHeight - 32);
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const cssWidth = image.naturalWidth * scale, cssHeight = image.naturalHeight * scale;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${cssWidth}px`; canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.max(1, Math.round(cssWidth * dpr)); canvas.height = Math.max(1, Math.round(cssHeight * dpr));
  requestRender();
 }
 function commit(next, before = model.items) {
  if (next === before) return;
  history.push(before);
  if (history.length > 80) history.shift();
  future = [];
  model.items = next;
  message(''); refresh(); requestRender();
 }
 function undo() {
  if (saving || gesture || !history.length) return;
  future.push(model.items); model.items = history.pop(); message('되돌렸습니다.'); refresh(); requestRender();
 }
 function redo() {
  if (saving || gesture || !future.length) return;
  history.push(model.items); model.items = future.pop(); message('다시 실행했습니다.'); refresh(); requestRender();
 }
 function selectTool(type) {
  activeTool = type;
  dialog.querySelectorAll('[data-drawing-tool]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.drawingTool === type)));
  find('.page-drawing-stickers').hidden = type !== 'sticker';
  find('.page-drawing-colors').hidden = type === 'sticker' || type === 'eraser';
  sizeInput.min = type === 'sticker' ? 24 : type === 'highlighter' ? 8 : 1;
  sizeInput.max = type === 'sticker' ? 120 : type === 'highlighter' ? 60 : type === 'eraser' ? 40 : 20;
  sizeInput.value = sizes[type];
  find('[data-drawing-size-label]').textContent = type === 'sticker' || type === 'eraser' ? '크기' : '굵기';
  sizeInput.setAttribute('aria-label', find('[data-drawing-size-label]').textContent);
  find('[data-drawing-size-value]').textContent = sizes[type];
  hint.textContent = type === 'sticker' ? '스티커를 고르고 이미지에서 원하는 위치를 누르세요.' : type === 'eraser' ? '그린 선이나 도형, 스티커를 누르거나 문질러 지우세요.' : type === 'rectangle' || type === 'ellipse' || type === 'arrow' ? '이미지 위를 드래그해 도형을 그리세요.' : '이미지 위를 드래그해 그리세요.';
  refresh(); resizeCanvas();
 }
 function setColor(color) {
  activeColor = color; colorInput.value = color;
  dialog.querySelectorAll('[data-drawing-swatch]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.drawingSwatch === color)));
 }
 function pointOf(event) {
  const rect = canvas.getBoundingClientRect();
  return {x: Math.min(model.width, Math.max(0, round((event.clientX - rect.left) / rect.width * model.width))), y: Math.min(model.height, Math.max(0, round((event.clientY - rect.top) / rect.height * model.height)))};
 }
 function eraseAt(point) {
  const index = model.items.findLastIndex(item => hitTestPageAnnotation(item, point, sizes.eraser));
  if (index >= 0) { model.items = model.items.filter((_, i) => i !== index); requestRender(); }
 }
 function move(event) {
  if (!gesture || gesture.id !== event.pointerId) return;
  event.preventDefault();
  const point = pointOf(event);
  if (gesture.type === 'eraser') {
   const last = gesture.last, distance = Math.hypot(point.x - last.x, point.y - last.y), steps = Math.ceil(distance / Math.max(3, sizes.eraser / 2));
   for (let step = 1; step <= steps; step++) eraseAt({x:last.x + (point.x - last.x) * step / steps, y:last.y + (point.y - last.y) * step / steps});
   gesture.last = point;
  } else if (preview?.points) {
   const events = event.getCoalescedEvents?.() || [event];
   for (const part of events.length ? events : [event]) {
    const next = pointOf(part), last = preview.points.at(-1);
    if (preview.points.length < gesture.maxPoints && Math.hypot(next.x - last.x, next.y - last.y) >= .35) preview.points.push(next);
   }
  } else if (preview?.type === 'sticker') { preview.x = point.x; preview.y = point.y; }
  else if (preview) { preview.x2 = point.x; preview.y2 = point.y; }
  requestRender();
 }
 function endGesture(cancelled = false) {
  if (!gesture) return;
  const ended = gesture, item = preview;
  gesture = null; preview = null;
  if (canvas.hasPointerCapture(ended.id)) canvas.releasePointerCapture(ended.id);
  if (cancelled) model.items = ended.before;
  else if (ended.type === 'eraser') { if (model.items !== ended.before) commit(model.items, ended.before); }
  else if (item) {
   const nonEmpty = item.points || item.type === 'sticker' || Math.hypot(item.x2 - item.x1, item.y2 - item.y1) > 1;
   if (nonEmpty) commit([...model.items, item]);
  }
  refresh(); requestRender();
 }
 function close(saved) {
  if (disposed) return;
  disposed = true;
  observer.disconnect(); cancelAnimationFrame(animation);
  window.removeEventListener('beforeunload', beforeUnload);
  window.removeEventListener('resize', resizeCanvas);
  dialog.close(); dialog.remove(); currentDialog = null;
  if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
  resolveClosed(saved);
 }
 function requestClose() {
  if (saving) return;
  endGesture(true);
  if (!dirty) return close(false);
  confirm.hidden = false; refresh(); find('[data-drawing-action="keep-editing"]').focus();
 }
 function beforeUnload(event) { if (dirty || saving) { event.preventDefault(); event.returnValue = ''; } }
 async function exportDrawing() {
  const result = structuredClone(validatePageAnnotations(model));
  const output = document.createElement('canvas');
  if (image.naturalWidth * image.naturalHeight > 32000000 || image.naturalWidth > 16384 || image.naturalHeight > 16384) throw Error('이미지가 너무 커서 저장하지 못했습니다. 작은 이미지로 다시 시도해 주세요.');
  output.width = image.naturalWidth; output.height = image.naturalHeight;
  try {
   const ctx = output.getContext('2d');
   if (!ctx) throw Error('그림 이미지를 만들지 못했습니다. 다시 시도해 주세요.');
   ctx.drawImage(image, 0, 0);
   ctx.scale(output.width / result.width, output.height / result.height);
   drawPageAnnotations(ctx, result);
   return {annotations:result, blob:await canvasBlob(output)};
  } finally { output.width = 0; output.height = 0; }
 }
 async function download() {
  if (!model || saving || !confirm.hidden) return;
  endGesture(false); saving = true; refresh(); message('PNG 파일을 만드는 중…');
  try {
   const {blob} = await exportDrawing(), url = URL.createObjectURL(blob), anchor = document.createElement('a');
   anchor.href = url; anchor.download = `${String(title).replace(/[\\/:*?"<>|]/g, '_').slice(0, 100)}-그림.png`;
   document.body.append(anchor); anchor.click(); anchor.remove();
   setTimeout(() => URL.revokeObjectURL(url), 10000);
   message('PNG 파일을 내려받았습니다. 기록에 남기려면 그림 저장을 눌러 주세요.');
  } catch (error) { message(error?.message || 'PNG 파일을 만들지 못했습니다.', true); }
  finally { saving = false; refresh(); }
 }
 async function save() {
  if (!model || saving || !confirm.hidden) return;
  endGesture(false);
  saving = true; refresh(); message('그림을 저장하는 중…');
  try {
   await onSave(await exportDrawing());
   close(true);
  } catch (error) {
   saving = false; refresh(); message(error?.message || '그림을 저장하지 못했습니다. 다시 시도해 주세요.', true);
  }
 }

 canvas.addEventListener('pointerdown', event => {
  if (!model || saving || !confirm.hidden || gesture || event.button !== 0) return;
  event.preventDefault(); canvas.focus({preventScroll:true});
  if (model.items.length >= PAGE_DRAWING_MAX_ITEMS && activeTool !== 'eraser') return message('그림이 많습니다. 일부를 지운 뒤 계속 그려 주세요.', true);
  const pointsCount = model.items.reduce((sum, item) => sum + (item.points?.length || 0), 0);
  if ((activeTool === 'pen' || activeTool === 'highlighter') && pointsCount >= PAGE_DRAWING_MAX_POINTS) return message('선이 너무 많습니다. 일부를 지운 뒤 계속 그려 주세요.', true);
  const point = pointOf(event);
  gesture = {id:event.pointerId, type:activeTool, before:model.items, last:point, maxPoints:Math.min(PAGE_DRAWING_MAX_STROKE_POINTS, PAGE_DRAWING_MAX_POINTS - pointsCount)};
  canvas.setPointerCapture(event.pointerId);
  if (activeTool === 'eraser') eraseAt(point);
  else if (activeTool === 'sticker') preview = {type:'sticker', text:activeSticker, x:point.x, y:point.y, size:sizes.sticker};
  else if (activeTool === 'pen' || activeTool === 'highlighter') preview = {type:activeTool, color:activeColor, size:sizes[activeTool], points:[point]};
  else preview = {type:activeTool, color:activeColor, size:sizes[activeTool], x1:point.x, y1:point.y, x2:point.x, y2:point.y};
  requestRender();
 });
 canvas.addEventListener('pointermove', move);
 canvas.addEventListener('pointerup', event => { if (gesture?.id === event.pointerId) { move(event); endGesture(); } });
 canvas.addEventListener('pointercancel', event => { if (gesture?.id === event.pointerId) endGesture(true); });
 canvas.addEventListener('lostpointercapture', event => { if (gesture?.id === event.pointerId) endGesture(true); });
 canvas.addEventListener('contextmenu', event => event.preventDefault());
 dialog.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
 dialog.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled || saving) return;
  const action = button.dataset.drawingAction;
  if (action === 'discard') return close(false);
  if (action === 'keep-editing') { confirm.hidden = true; refresh(); canvas.focus(); return; }
  if (!confirm.hidden) return;
  if (action === 'cancel') return requestClose();
  if (action === 'save') return void save();
  if (action === 'download') return void download();
  if (action === 'undo') return undo();
  if (action === 'redo') return redo();
  if (action === 'clear' && model?.items.length) { commit([]); message('모두 지웠습니다. 되돌리기로 복원할 수 있습니다.'); return; }
  if (button.dataset.drawingTool) selectTool(button.dataset.drawingTool);
  if (button.dataset.drawingSwatch) setColor(button.dataset.drawingSwatch);
  if (button.dataset.drawingSticker) {
   activeSticker = button.dataset.drawingSticker;
   dialog.querySelectorAll('[data-drawing-sticker]').forEach(el => el.setAttribute('aria-pressed', String(el === button)));
  }
 });
 colorInput.addEventListener('input', () => setColor(colorInput.value));
 sizeInput.addEventListener('input', () => { sizes[activeTool] = Number(sizeInput.value); find('[data-drawing-size-value]').textContent = sizeInput.value; });
 dialog.addEventListener('keydown', event => {
  // The notebook's document-level shortcuts must not save or navigate behind this modal.
  event.stopPropagation();
  if (!confirm.hidden) {
   if (event.key === 'Escape') { event.preventDefault(); confirm.hidden = true; refresh(); canvas.focus(); }
   if (event.key === 'Tab') {
    event.preventDefault(); const keep = find('[data-drawing-action="keep-editing"]'), discard = find('[data-drawing-action="discard"]');
    (document.activeElement === keep ? discard : keep).focus();
   }
   return;
  }
  if (event.key === 'Escape') { event.preventDefault(); if (gesture) endGesture(true); else requestClose(); return; }
  if ((event.ctrlKey || event.metaKey) && !event.altKey) {
   const key = event.key.toLowerCase();
   if (key === 'k' || key === 'e') event.preventDefault();
   if (key === 's') { event.preventDefault(); void save(); }
   if (key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
   if (key === 'y') { event.preventDefault(); redo(); }
  }
 });
 dialog.addEventListener('keyup', event => event.stopPropagation());
 document.body.append(dialog); currentDialog = dialog;
 dialog.showModal();
 find('[data-drawing-action="cancel"]').focus();
 refresh(); observer.observe(stage);
 window.addEventListener('resize', resizeCanvas);
 window.addEventListener('beforeunload', beforeUnload);
 loadImage(imageUrl).then(loaded => {
  if (disposed) return;
  image = loaded; model = normalizePageAnnotations(annotations, image.naturalWidth, image.naturalHeight);
  initialItems = JSON.stringify(model.items);
  canvas.hidden = false; find('.page-drawing-loading').hidden = true; stage.setAttribute('aria-busy', 'false');
  refresh(); resizeCanvas(); canvas.focus({preventScroll:true});
 }).catch(error => {
  if (disposed) return;
  stage.setAttribute('aria-busy', 'false'); find('.page-drawing-loading').textContent = '이미지를 열지 못했습니다.';
  message(error?.message || '페이지 이미지를 열 수 없습니다.', true);
 });
 return closed;
}
