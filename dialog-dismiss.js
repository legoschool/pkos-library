const installations = new WeakMap();

// Backdrop dismissal follows the same cancellable path as Escape, so each dialog
// keeps control of unfinished work, media cleanup and pending Promise resolution.
export function installDialogBackdropDismiss(root = document) {
 if (installations.has(root)) return installations.get(root);
 let press = null;
 const outside = (dialog, event) => {
  const rect = dialog.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
 };
 const modalAt = event => {
  const dialog = event.target;
  return dialog?.localName === 'dialog' && dialog.open && dialog.matches(':modal') && outside(dialog, event) ? dialog : null;
 };
 const down = event => {
  press = null;
  if (!event.isPrimary || event.button !== 0) return;
  const dialog = modalAt(event);
  if (dialog) press = {dialog, pointerId:event.pointerId, released:false};
 };
 const up = event => {
  if (!press || press.pointerId !== event.pointerId || modalAt(event) !== press.dialog) { press = null; return; }
  press.released = true;
 };
 const reset = () => { press = null; };
 const click = event => {
  const started = press;
  press = null;
  if (!started?.released || event.button !== 0 || modalAt(event) !== started.dialog) return;
  // Wait for click rather than closing on pointerup: the click must never reach
  // a control behind a dialog that has just disappeared.
  event.preventDefault();
  event.stopPropagation();
  const dialog = started.dialog;
  const cancelled = new Event('cancel', {cancelable:true});
  if (dialog.dispatchEvent(cancelled) && dialog.open) dialog.close();
 };
 root.addEventListener('pointerdown', down, true);
 root.addEventListener('pointerup', up, true);
 root.addEventListener('pointercancel', reset, true);
 root.addEventListener('click', click, true);
 const uninstall = () => {
  root.removeEventListener('pointerdown', down, true);
  root.removeEventListener('pointerup', up, true);
  root.removeEventListener('pointercancel', reset, true);
  root.removeEventListener('click', click, true);
  press = null;
  installations.delete(root);
 };
 installations.set(root, uninstall);
 return uninstall;
}
