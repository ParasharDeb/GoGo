// Inline SVG icons, drawn on a 20x20 grid in the style of Notion's UI icons.
(function () {
  const s = (body, vb = 20) => `<svg class="i" viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const f = (body, vb = 20) => `<svg class="i" viewBox="0 0 ${vb} ${vb}" fill="currentColor">${body}</svg>`;

  window.I = {
    search: s('<circle cx="8.75" cy="8.75" r="5.25"/><path d="M12.6 12.6 16.5 16.5"/>'),
    home: s('<path d="M3.5 8.6 10 3.5l6.5 5.1V16a.9.9 0 0 1-.9.9H12.2V12H7.8v4.9H4.4a.9.9 0 0 1-.9-.9z"/>'),
    doc: s('<path d="M5.5 2.75h6l3.75 3.75v9.85c0 .5-.4.9-.9.9H5.5a.9.9 0 0 1-.9-.9V3.65c0-.5.4-.9.9-.9z"/><path d="M11.25 2.9v3.85h3.85M7.4 10.25h5.2M7.4 13.25h5.2"/>'),
    chevron: f('<path d="M7.6 5.4a.75.75 0 0 1 1.06 0l4.07 4.07a.75.75 0 0 1 0 1.06l-4.07 4.07a.75.75 0 1 1-1.06-1.06L11.14 10 7.6 6.46a.75.75 0 0 1 0-1.06z"/>'),
    chevronDown: f('<path d="M5.4 7.6a.75.75 0 0 1 1.06 0L10 11.14l3.54-3.54a.75.75 0 1 1 1.06 1.06l-4.07 4.07a.75.75 0 0 1-1.06 0L5.4 8.66a.75.75 0 0 1 0-1.06z"/>'),
    plus: s('<path d="M10 4.25v11.5M4.25 10h11.5"/>'),
    more: f('<circle cx="4.5" cy="10" r="1.4"/><circle cx="10" cy="10" r="1.4"/><circle cx="15.5" cy="10" r="1.4"/>'),
    grip: f('<circle cx="7.5" cy="5" r="1.25"/><circle cx="12.5" cy="5" r="1.25"/><circle cx="7.5" cy="10" r="1.25"/><circle cx="12.5" cy="10" r="1.25"/><circle cx="7.5" cy="15" r="1.25"/><circle cx="12.5" cy="15" r="1.25"/>'),
    trash: s('<path d="M3.75 5.5h12.5M8 5.5V3.9c0-.4.3-.65.65-.65h2.7c.35 0 .65.25.65.65V5.5M5.25 5.5l.7 10.4c.05.5.45.85.9.85h6.3c.45 0 .85-.35.9-.85l.7-10.4M8.4 8.75v5M11.6 8.75v5"/>'),
    table: s('<rect x="3" y="3.75" width="14" height="12.5" rx="1.5"/><path d="M3 8h14M3 12.1h14M8 8v8.25"/>'),
    board: s('<rect x="3" y="3.75" width="4" height="12.5" rx="1"/><rect x="8" y="3.75" width="4" height="8.5" rx="1"/><rect x="13" y="3.75" width="4" height="10.5" rx="1"/>'),
    clock: s('<circle cx="10" cy="10" r="6.75"/><path d="M10 6.25V10l2.5 1.75"/>'),
    timer: s('<circle cx="10" cy="11" r="6"/><path d="M10 7.75V11l2 1.25M8 2.75h4M15 5.25l1.1-1.1"/>'),
    status: s('<circle cx="10" cy="10" r="6.5" stroke-dasharray="2.6 2.1"/><circle cx="10" cy="10" r="2.25" fill="currentColor" stroke="none"/>'),
    calendar: s('<rect x="3.25" y="4.5" width="13.5" height="12" rx="1.5"/><path d="M3.25 8.25h13.5M7 2.75v3M13 2.75v3"/>'),
    folder: s('<path d="M2.9 5.6c0-.55.45-1 1-1h3.9l1.6 1.75h7.7c.55 0 1 .45 1 1v8.05c0 .55-.45 1-1 1H3.9c-.55 0-1-.45-1-1z"/>'),
    title: f('<text x="1.5" y="14.6" font-size="11.5" font-family="Segoe UI, sans-serif" font-weight="600">Aa</text>'),
    play: f('<path d="M6.25 4.4v11.2c0 .62.67 1 1.2.68l9.1-5.6a.8.8 0 0 0 0-1.36l-9.1-5.6a.8.8 0 0 0-1.2.68z"/>'),
    pause: f('<rect x="5" y="4" width="3.6" height="12" rx="1"/><rect x="11.4" y="4" width="3.6" height="12" rx="1"/>'),
    reset: s('<path d="M4.25 10a5.75 5.75 0 1 0 1.7-4.07"/><path d="M4.1 3.75v3.4h3.4"/>'),
    check: s('<path d="m4.5 10.5 3.5 3.5 7.5-8"/>'),
    open: s('<path d="M11 3.75h5.25V9M16 4 10 10M8.5 4.5H5a1 1 0 0 0-1 1V15a1 1 0 0 0 1 1h9.5a1 1 0 0 0 1-1v-3.5"/>'),
    dbl: s('<path d="m10.5 5.5-4.5 4.5 4.5 4.5M15 5.5 10.5 10l4.5 4.5"/>'),
    menu: s('<path d="M3.75 5.5h12.5M3.75 10h12.5M3.75 14.5h12.5"/>'),
    compose: s('<path d="M9.5 3.75H5a1.25 1.25 0 0 0-1.25 1.25v10A1.25 1.25 0 0 0 5 16.25h10A1.25 1.25 0 0 0 16.25 15v-4.5"/><path d="M14.6 3.1a1.5 1.5 0 0 1 2.1 2.1L10.5 11.4 7.75 12.25 8.6 9.5z"/>'),
    smile: s('<circle cx="10" cy="10" r="6.75"/><path d="M7.25 11.75c.65 1 1.6 1.5 2.75 1.5s2.1-.5 2.75-1.5"/><circle cx="7.6" cy="8.25" r=".6" fill="currentColor"/><circle cx="12.4" cy="8.25" r=".6" fill="currentColor"/>'),
    paw: f('<ellipse cx="10" cy="13.4" rx="3.6" ry="3"/><ellipse cx="5.2" cy="9.2" rx="1.6" ry="2"/><ellipse cx="14.8" cy="9.2" rx="1.6" ry="2"/><ellipse cx="7.8" cy="5.6" rx="1.6" ry="2.1"/><ellipse cx="12.2" cy="5.6" rx="1.6" ry="2.1"/>'),
    pencil: s('<path d="M13.6 3.6a1.6 1.6 0 0 1 2.3 2.3l-9.2 9.2-3 .7.7-3z"/>'),
    focus: s('<circle cx="10" cy="10" r="6.75"/><circle cx="10" cy="10" r="3"/><circle cx="10" cy="10" r=".5" fill="currentColor"/>'),
  };
})();
