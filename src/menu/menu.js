// Renders the right-click menu sent by the main process (see ../context-menu.js).
const ICONS = {
  back: '<path d="M10 3 5 8l5 5M5 8h9" />',
  forward: '<path d="m6 3 5 5-5 5M11 8H2" />',
  refresh: '<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3.5H10" />',
  check: '<path d="M3 8.5 6.5 12 13 4.5" />',
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const menu = document.getElementById('menu');

function button(item) {
  const b = document.createElement('button');
  b.setAttribute('role', item.checked === undefined ? 'menuitem' : 'menuitemcheckbox');
  if (item.checked !== undefined) b.setAttribute('aria-checked', String(item.checked));
  b.disabled = item.enabled === false;
  if (item.label) {
    const span = document.createElement('span');
    span.textContent = item.label;
    // A checkbox item shows a tick in the icon column while it's on.
    const iconName = item.checked === undefined ? item.icon : item.checked && 'check';
    if (iconName) b.innerHTML = icon(iconName);
    else b.classList.add('text-only');
    b.append(span);
  } else {
    // Icon-only button (back / forward): the label is for screen readers and the tooltip.
    b.innerHTML = icon(item.icon);
    b.title = item.title;
    b.setAttribute('aria-label', item.title);
  }
  b.addEventListener('click', () => window.menuApi.choose(item.id));
  return b;
}

window.menuApi.onShow((model) => {
  menu.replaceChildren();
  const nav = document.createElement('div');
  nav.className = 'nav';
  nav.append(...model.nav.map(button));
  menu.append(nav);
  for (const item of model.items) menu.append(item.separator ? document.createElement('hr') : button(item));
  const { width, height } = document.body.getBoundingClientRect();
  window.menuApi.ready(Math.ceil(width), Math.ceil(height));
});

// Keyboard: Up/Down (and Left/Right) move between items, Enter/Space activate, Escape closes.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') return window.menuApi.close();
  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
  if (!step) return;
  e.preventDefault();
  const items = [...menu.querySelectorAll('button:not(:disabled)')];
  const i = items.indexOf(document.activeElement);
  items[i < 0 ? (step > 0 ? 0 : items.length - 1) : (i + step + items.length) % items.length]?.focus();
});
