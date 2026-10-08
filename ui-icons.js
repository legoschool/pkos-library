// Opaque, filled icons stay legible on both light and colored controls.
// icon-base / icon-glyph let primary buttons adapt to the selected accent.
const tile=(color,glyph)=>'<rect class="icon-base" x="2" y="2" width="20" height="20" rx="5" fill="'+color+'"/><g class="icon-glyph" fill="#fff">'+glyph+'</g>';
const definitions=Object.freeze({
 collapse:tile('#475569','<path d="m10.8 6.5-5.5 5.5 5.5 5.5 1.4-1.4L8.1 12l4.1-4.1zm6 0L11.3 12l5.5 5.5 1.4-1.4-4.1-4.1 4.1-4.1z"/>'),
 panel:tile('#2563eb','<path fill-rule="evenodd" d="M5 6h14v12H5V6Zm6 2v8h6V8h-6Z"/>'),
 chevron:'<path class="icon-glyph" d="m8 4 8 8-8 8-2-2 6-6-6-6z" fill="#64748b"/>',
 book:'<path class="icon-base" d="M5 2h13a2 2 0 0 1 2 2v18H6a3 3 0 0 1-3-3V5a3 3 0 0 1 2-3Z" fill="#2563eb"/><path d="M6 2h2v15H6a3 3 0 0 0-3 2V5a3 3 0 0 1 3-3Z" fill="#1d4ed8"/><path class="icon-glyph" d="M6 18h12v2H6a1 1 0 0 1 0-2Zm5-12h6v2h-6zm0 4h5v2h-5z" fill="#fff"/>',
 search:tile('#2563eb','<path fill-rule="evenodd" d="M10.5 5a5.5 5.5 0 1 0 3.1 10.05l4.85 4.85 1.4-1.4L15 13.6A5.5 5.5 0 0 0 10.5 5Zm0 2a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z"/>'),
 all:'<path class="icon-base" d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="#3b82f6"/><path d="M14 2v6h6Z" fill="#1d4ed8"/><path class="icon-glyph" d="M8 11h8v2H8zm0 4h8v2H8z" fill="#fff"/>',
 inbox:'<path class="icon-base" d="M6 3h12a2 2 0 0 1 1.9 1.4L22 12v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7l2.1-7.6A2 2 0 0 1 6 3Z" fill="#f59e0b"/><path class="icon-glyph" d="M7 6h10v8H7z" fill="#fff"/><path d="M2 12h6l2 3h4l2-3h6v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z" fill="#ea580c"/><path d="M9 8h6v1.5H9z" fill="#f59e0b"/>',
 clock:'<circle class="icon-base" cx="12" cy="12" r="10" fill="#0f766e"/><path class="icon-glyph" d="M11 5h2v6.4l4.2 2.4-1 1.8-5.2-3Z" fill="#fff"/><circle cx="12" cy="12" r="1.5" fill="#fff"/>',
 star:'<path class="icon-base" d="m12 1.8 3.2 6.5 7.2 1.1-5.2 5.1 1.2 7.2L12 18.3l-6.4 3.4 1.2-7.2-5.2-5.1 7.2-1.1Z" fill="#f4b51b"/><path d="m12 1.8 3.2 6.5 7.2 1.1-5.2 5.1 1.2 7.2-6.4-3.4 4.2-3.8-.4-5.2Z" fill="#e99a13"/>',
 folder:'<path class="icon-base" d="M2 6a2 2 0 0 1 2-2h5l2.2 2H20a2 2 0 0 1 2 2v11H2Z" fill="#d99a18"/><path d="M4 8h16v10H4Z" fill="#fff0bd"/><path d="M2 10h20v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z" fill="#f6bf35"/><path d="M2 10h20v2H2Z" fill="#ffd764"/>',
 graph:'<path d="m6 6 12 12m-12 0L18 6M6 6h12M6 18h12" fill="none" stroke="#64748b" stroke-width="2"/><circle class="icon-base" cx="6" cy="6" r="4" fill="#2563eb"/><circle cx="18" cy="6" r="4" fill="#e87919"/><circle cx="6" cy="18" r="4" fill="#0d9488"/><circle cx="18" cy="18" r="4" fill="#e04472"/>',
 plus:tile('var(--accent, #2563eb)','<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6Z"/>'),
 settings:tile('#64748b','<path d="M5 7h14v2H5zm0 8h14v2H5z"/><rect x="7" y="5" width="3" height="6" rx="1"/><rect x="14" y="13" width="3" height="6" rx="1"/>'),
 trash:'<path class="icon-base" d="M5 8h14l-1 12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Zm3-6h8v3h4v2H4V5h4V2Zm2 2v1h4V4Z" fill="#e05252"/><path class="icon-glyph" d="M9 10h2v9H9zm4 0h2v9h-2z" fill="#fff"/>',
 menu:tile('#475569','<rect x="6" y="6" width="12" height="2" rx="1"/><rect x="6" y="11" width="12" height="2" rx="1"/><rect x="6" y="16" width="12" height="2" rx="1"/>'),
 back:tile('#64748b','<path d="m11 5-7 7 7 7 1.4-1.4L7.8 13H20v-2H7.8l4.6-4.6Z"/>'),
 close:tile('#64748b','<path d="m7 5.6 5 5 5-5L18.4 7l-5 5 5 5-1.4 1.4-5-5-5 5L5.6 17l5-5-5-5Z"/>'),
 check:tile('#168264','<path d="m18.7 6.7 1.6 1.6-10.3 10.3-6.3-6.3 1.6-1.6L10 15.4Z"/>'),
 link:tile('#2563eb','<path fill-rule="evenodd" d="m14.1 4.7-3.2 3.2 1.4 1.4 3.2-3.2a2.2 2.2 0 0 1 3.1 3.1l-3.2 3.2 1.4 1.4 3.2-3.2a4.2 4.2 0 0 0-5.9-5.9ZM7.2 10.2 4 13.4a4.2 4.2 0 0 0 5.9 5.9l3.2-3.2-1.4-1.4-3.2 3.2a2.2 2.2 0 0 1-3.1-3.1l3.2-3.2Z"/><path d="m8.3 14.3 6-6 1.4 1.4-6 6z"/>'),
 file:'<path class="icon-base" d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="#64748b"/><path d="M14 2v6h6Z" fill="#94a3b8"/><path class="icon-glyph" d="M8 12h8v2H8zm0 4h5v2H8z" fill="#fff"/>',
 download:tile('#168264','<path d="M11 4h2v7h3l-4 4-4-4h3ZM5 15h2v3h10v-3h2v5H5Z"/>'),
 edit:'<path class="icon-base" d="m4.2 14.5 9.9-9.9 5.3 5.3-9.9 9.9L3 21Z" fill="#f0a322"/><path d="m14.1 4.6 2-2a2 2 0 0 1 2.8 0l2.5 2.5a2 2 0 0 1 0 2.8l-2 2Z" fill="#e45b71"/><path d="m3 21 1.2-6.5 5.3 5.3Z" fill="#f7ddb2"/><path d="m3 21 .5-2.7 2.2 2.2Z" fill="#475569"/><path class="icon-glyph" d="m13.4 5.3 1.4-1.4 5.3 5.3-1.4 1.4Z" fill="#fff"/>',
 more:'<circle class="icon-glyph" cx="5" cy="12" r="2" fill="#475569"/><circle class="icon-glyph" cx="12" cy="12" r="2" fill="#475569"/><circle class="icon-glyph" cx="19" cy="12" r="2" fill="#475569"/>',
 grid:'<rect class="icon-base" x="2" y="2" width="8.5" height="8.5" rx="2" fill="#2563eb"/><rect x="13.5" y="2" width="8.5" height="8.5" rx="2" fill="#0d9488"/><rect x="2" y="13.5" width="8.5" height="8.5" rx="2" fill="#e87919"/><rect x="13.5" y="13.5" width="8.5" height="8.5" rx="2" fill="#e04472"/>',
 list:tile('#0f766e','<circle cx="6.5" cy="7" r="1.25"/><circle cx="6.5" cy="12" r="1.25"/><circle cx="6.5" cy="17" r="1.25"/><rect x="10" y="6" width="8" height="2" rx="1"/><rect x="10" y="11" width="8" height="2" rx="1"/><rect x="10" y="16" width="8" height="2" rx="1"/>'),
 palette:'<path class="icon-base" d="M12 2C6.5 2 2 6.1 2 11.2A10.8 10.8 0 0 0 12.8 22c2.2 0 3.7-1.3 3.7-3.1 0-1.2-.8-1.7-.8-2.6 0-.8.6-1.3 1.5-1.3h1.5c2.2 0 3.3-1.8 3.3-3.8C22 6.1 17.5 2 12 2Z" fill="#eab952"/><circle cx="6.5" cy="10" r="2" fill="#e44d61"/><circle cx="10" cy="6.5" r="2" fill="#2563eb"/><circle cx="15" cy="6.5" r="2" fill="#0f766e"/><circle cx="18" cy="10.5" r="1.7" fill="#a346bd"/><circle class="icon-glyph" cx="8.5" cy="16.5" r="2" fill="#fff"/>',
 brand:'<rect class="icon-base" x="1" y="1" width="22" height="22" rx="6" fill="var(--accent, #2563eb)"/><path class="icon-glyph" d="M5 6.5c2.1-.8 4.3-.6 6 .4v11.2c-1.7-1-3.9-1.2-6-.4Zm14 0c-2.1-.8-4.3-.6-6 .4v11.2c1.7-1 3.9-1.2 6-.4Z" fill="#fff"/><path d="M6.5 9h3v1h-3zm0 3h3v1h-3z" fill="var(--accent, #2563eb)"/><path d="m15 9 2 3-2 3" fill="none" stroke="var(--accent, #2563eb)" stroke-width="1.2"/><circle cx="15" cy="9" r="1.1" fill="var(--accent, #2563eb)"/><circle cx="17" cy="12" r="1.1" fill="var(--accent, #2563eb)"/><circle cx="15" cy="15" r="1.1" fill="var(--accent, #2563eb)"/>'
});

export function uiIcon(name){
 const key=Object.hasOwn(definitions,name)?name:'file';
 return '<svg class="ui-icon icon-'+key+(key==='folder'?' folder-icon':'')+'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true" focusable="false">'+definitions[key]+'</svg>';
}
