// Coordinates use a 1000-unit page width so drawings survive display resizing.
export const PAGE_DRAWING_WIDTH = 1000;
export const PAGE_DRAWING_MAX_ITEMS = 2000;
export const PAGE_DRAWING_MAX_POINTS = 200000;
export const PAGE_DRAWING_MAX_STROKE_POINTS = 20000;
const paths = new Set(['pen', 'highlighter']);
const shapes = new Set(['rectangle', 'ellipse', 'arrow']);
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function validatePageAnnotations(value) {
 if (!value || value.version !== 1 || value.width !== PAGE_DRAWING_WIDTH || !finite(value.height) || value.height <= 0 || value.height > 100000 || !Array.isArray(value.items) || value.items.length > PAGE_DRAWING_MAX_ITEMS) throw Error('그림 데이터 형식이 올바르지 않습니다.');
 const x = n => finite(n) && n >= 0 && n <= value.width;
 const y = n => finite(n) && n >= 0 && n <= value.height;
 let count = 0;
 for (const item of value.items) {
  if (!item || !finite(item.size) || item.size <= 0 || item.size > 200) throw Error('그림의 크기 정보가 올바르지 않습니다.');
  if (item.type === 'sticker') {
   if (typeof item.text !== 'string' || !item.text.trim() || item.text.length > 32 || !x(item.x) || !y(item.y)) throw Error('스티커 정보가 올바르지 않습니다.');
  } else {
   if (typeof item.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.color)) throw Error('그림의 색상 정보가 올바르지 않습니다.');
   if (paths.has(item.type)) {
    if (!Array.isArray(item.points) || !item.points.length || item.points.length > PAGE_DRAWING_MAX_STROKE_POINTS || item.points.some(point => !point || !x(point.x) || !y(point.y))) throw Error('펜의 좌표 정보가 올바르지 않습니다.');
    count += item.points.length;
   } else if (!shapes.has(item.type) || !x(item.x1) || !y(item.y1) || !x(item.x2) || !y(item.y2)) throw Error('도형 정보가 올바르지 않습니다.');
  }
 }
 if (count > PAGE_DRAWING_MAX_POINTS) throw Error('그림이 너무 복잡합니다. 일부 선을 지운 뒤 다시 저장해 주세요.');
 return value;
}

export function normalizePageAnnotations(value, imageWidth, imageHeight) {
 if (!finite(imageWidth) || !finite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) throw Error('이미지 크기를 확인할 수 없습니다.');
 const height = PAGE_DRAWING_WIDTH * imageHeight / imageWidth;
 if (value == null) return validatePageAnnotations({version: 1, width: PAGE_DRAWING_WIDTH, height, items: []});
 validatePageAnnotations(value);
 if (Math.abs(value.height - height) > Math.max(1, height * .002)) throw Error('저장된 그림과 원본 이미지의 비율이 다릅니다.');
 return structuredClone(value);
}

function arrowHead(item) {
 const angle = Math.atan2(item.y2 - item.y1, item.x2 - item.x1);
 const length = Math.min(Math.hypot(item.x2 - item.x1, item.y2 - item.y1) * .45, Math.max(14, item.size * 3));
 return [
  {x: item.x2 - length * Math.cos(angle - Math.PI / 6), y: item.y2 - length * Math.sin(angle - Math.PI / 6)},
  {x: item.x2 - length * Math.cos(angle + Math.PI / 6), y: item.y2 - length * Math.sin(angle + Math.PI / 6)}
 ];
}

export function drawPageAnnotation(ctx, item) {
 ctx.save();
 ctx.globalAlpha = item.type === 'highlighter' ? .3 : 1;
 ctx.lineCap = 'round';
 ctx.lineJoin = 'round';
 ctx.lineWidth = item.size;
 ctx.strokeStyle = item.color || '#000000';
 ctx.fillStyle = item.color || '#000000';
 ctx.beginPath();
 if (paths.has(item.type)) {
  const first = item.points[0];
  if (item.points.length === 1) {
   ctx.arc(first.x, first.y, item.size / 2, 0, Math.PI * 2);
   ctx.fill();
  } else {
   ctx.moveTo(first.x, first.y);
   for (const point of item.points.slice(1)) ctx.lineTo(point.x, point.y);
   ctx.stroke();
  }
 } else if (item.type === 'sticker') {
  ctx.font = `${item.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(item.text, item.x, item.y);
 } else if (item.type === 'rectangle') {
  ctx.strokeRect(Math.min(item.x1, item.x2), Math.min(item.y1, item.y2), Math.abs(item.x2 - item.x1), Math.abs(item.y2 - item.y1));
 } else if (item.type === 'ellipse') {
  ctx.ellipse((item.x1 + item.x2) / 2, (item.y1 + item.y2) / 2, Math.abs(item.x2 - item.x1) / 2, Math.abs(item.y2 - item.y1) / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
 } else if (item.type === 'arrow') {
  const [left, right] = arrowHead(item);
  ctx.moveTo(item.x1, item.y1); ctx.lineTo(item.x2, item.y2);
  ctx.moveTo(left.x, left.y); ctx.lineTo(item.x2, item.y2); ctx.lineTo(right.x, right.y);
  ctx.stroke();
 }
 ctx.restore();
}

export function drawPageAnnotations(ctx, value) {
 for (const item of value.items) drawPageAnnotation(ctx, item);
}

function distanceToSegment(point, from, to) {
 const dx = to.x - from.x, dy = to.y - from.y;
 const length = dx * dx + dy * dy;
 const t = length ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / length)) : 0;
 return Math.hypot(point.x - from.x - t * dx, point.y - from.y - t * dy);
}

export function hitTestPageAnnotation(item, point, tolerance = 8) {
 const radius = tolerance + item.size / 2;
 if (paths.has(item.type)) {
  if (item.points.length === 1) return Math.hypot(point.x - item.points[0].x, point.y - item.points[0].y) <= radius;
  return item.points.some((to, i) => i && distanceToSegment(point, item.points[i - 1], to) <= radius);
 }
 if (item.type === 'sticker') return Math.abs(point.x - item.x) <= item.size * .6 + tolerance && Math.abs(point.y - item.y) <= item.size * .6 + tolerance;
 const x1 = Math.min(item.x1, item.x2), x2 = Math.max(item.x1, item.x2);
 const y1 = Math.min(item.y1, item.y2), y2 = Math.max(item.y1, item.y2);
 if (item.type === 'rectangle') {
  return point.x >= x1 - radius && point.x <= x2 + radius && point.y >= y1 - radius && point.y <= y2 + radius && (Math.abs(point.x - x1) <= radius || Math.abs(point.x - x2) <= radius || Math.abs(point.y - y1) <= radius || Math.abs(point.y - y2) <= radius);
 }
 if (item.type === 'ellipse') {
  const rx = (x2 - x1) / 2, ry = (y2 - y1) / 2, cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  if (!rx || !ry) return distanceToSegment(point, {x: x1, y: y1}, {x: x2, y: y2}) <= radius;
  const dx = point.x - cx, dy = point.y - cy;
  const outer = dx * dx / ((rx + radius) ** 2) + dy * dy / ((ry + radius) ** 2);
  const inner = rx > radius && ry > radius ? dx * dx / ((rx - radius) ** 2) + dy * dy / ((ry - radius) ** 2) : 2;
  return outer <= 1 && inner >= 1;
 }
 if (item.type === 'arrow') {
  const end = {x: item.x2, y: item.y2}, [left, right] = arrowHead(item);
  return distanceToSegment(point, {x: item.x1, y: item.y1}, end) <= radius || distanceToSegment(point, left, end) <= radius || distanceToSegment(point, right, end) <= radius;
 }
 return false;
}
