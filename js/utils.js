/** @returns {string} */
export function uuid() {
  return crypto.randomUUID();
}

/** @param {string} iso */
export function formatDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/** @param {string} iso */
export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** @param {HTMLElement} el */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}
