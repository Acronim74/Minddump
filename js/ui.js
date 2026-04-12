import { escapeHtml, formatDateShort } from './utils.js';

const COLOR_PRESETS = [
  '#5ef5c0',
  '#7eb8ff',
  '#c49bff',
  '#ffb86c',
  '#ff7ab6',
  '#f5e56e',
  '#8be9fd',
  '#bd93f9',
];

export { COLOR_PRESETS };

/**
 * @param {object} params
 * @param {HTMLElement} params.container
 * @param {Array<{id:string,name:string,color:string}>} params.categories
 * @param {Array<{id:string,name:string,categoryId:string}>} params.topics
 * @param {Array<object>} params.notes
 * @param {Map<string, number>} [params.actionCounts]
 * @param {string} params.filterCategoryId
 * @param {string} params.filterStatus
 * @param {string} params.search
 * @param {string} params.sort
 * @param {(id: string) => void} params.onOpen
 * @param {(id: string) => void} params.onDelete
 * @param {(id: string) => void} params.onDone
 */
export function renderNotesList(params) {
  const {
    container,
    categories,
    topics,
    notes,
    actionCounts = new Map(),
    filterCategoryId,
    filterStatus,
    search,
    sort,
    onOpen,
    onDelete,
    onDone,
  } = params;

  const catMap = new Map(categories.map((c) => [c.id, c]));
  const topicMap = new Map(topics.map((t) => [t.id, t]));

  let list = [...notes];
  const q = (search || '').trim().toLowerCase();
  if (q) {
    list = list.filter((n) => (n.title || '').toLowerCase().includes(q));
  }
  if (filterCategoryId) {
    list = list.filter((n) => n.categoryId === filterCategoryId);
  }
  if (filterStatus) {
    list = list.filter((n) => n.status === filterStatus);
  }

  list.sort((a, b) => {
    if (sort === 'category') {
      const ca = catMap.get(a.categoryId)?.name || '';
      const cb = catMap.get(b.categoryId)?.name || '';
      if (ca !== cb) return ca.localeCompare(cb, 'ru');
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    }
    if (sort === 'status') {
      const order = { open: 0, done: 1, archived: 2 };
      const sa = order[a.status] ?? 9;
      const sb = order[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    }
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });

  container.innerHTML = list
    .map((n) => {
      const cat = catMap.get(n.categoryId);
      const topic = topicMap.get(n.topicId);
      const catName = cat?.name || '—';
      const topicName = topic?.name || '—';
      const ac = actionCounts.get(n.id) ?? 0;
      const actionsLabel =
        ac === 0 ? 'нет действий' : ac === 1 ? '1 действие' : `${ac} действий`;
      const dateStr = formatDateShort(n.updatedAt || n.createdAt);
      return `
        <article class="note-card fade-in" data-note-id="${escapeHtml(n.id)}" tabindex="0" role="button">
          <div class="note-card__inner">
            <div class="note-card__head">
              <span class="note-card__no">#${n.no}</span>
              <h3 class="note-card__title">${escapeHtml(n.title || 'Без названия')}</h3>
            </div>
            <p class="note-card__meta">
              <span>${escapeHtml(topicName)}</span>
              <span class="dot">·</span>
              <span class="note-card__cat" style="--chip:${escapeHtml(cat?.color || '#5ef5c0')}">${escapeHtml(catName)}</span>
            </p>
            <p class="note-card__foot">${escapeHtml(actionsLabel)} · ${escapeHtml(dateStr)}</p>
            <div class="note-card__actions">
              <button type="button" class="link-btn" data-action="done">Выполнено</button>
              <button type="button" class="link-btn link-btn--danger" data-action="delete">Удалить</button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  container.querySelectorAll('.note-card').forEach((el) => {
    const id = el.dataset.noteId;
    el.querySelectorAll('.note-card__actions button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.dataset.action === 'delete') {
          if (confirm('Удалить заметку?')) onDelete(id);
        } else if (btn.dataset.action === 'done') onDone(id);
      });
    });
    el.addEventListener('click', (e) => {
      if (el.dataset.suppressClick === '1') {
        delete el.dataset.suppressClick;
        return;
      }
      onOpen(id);
    });
    attachSwipe(el, {
      onLeft: () => {
        if (confirm('Удалить заметку?')) onDelete(id);
      },
      onRight: () => onDone(id),
    });
  });
}

function attachSwipe(el, { onLeft, onRight }) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  el.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
    },
    { passive: true }
  );

  el.addEventListener(
    'touchend',
    (e) => {
      if (!tracking || e.changedTouches.length !== 1) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < 60 || Math.abs(dy) > 50) return;
      el.dataset.suppressClick = '1';
      setTimeout(() => delete el.dataset.suppressClick, 400);
      if (dx < 0) onLeft();
      else onRight();
    },
    { passive: true }
  );
}

/**
 * @param {object} p
 * @param {HTMLElement} p.container
 * @param {Array} p.categories
 * @param {Map<string, Array>} p.topicsByCategory
 * @param {(categoryId: string) => void} p.onAddTopic
 * @param {(cat: object) => void} p.onEditCategory
 * @param {(topic: object) => void} p.onEditTopic
 */
function findTopicInMap(topicsByCategory, tid) {
  for (const arr of topicsByCategory.values()) {
    const t = arr.find((x) => x.id === tid);
    if (t) return t;
  }
  return null;
}

export function renderCategoriesAccordion(p) {
  const { container, categories, topicsByCategory, onAddTopic, onEditCategory, onEditTopic } =
    p;

  container.innerHTML = categories
    .map((cat) => {
      const topics = topicsByCategory.get(cat.id) || [];
      const topicsHtml = topics
        .map(
          (t) => `
        <li class="topic-row" data-topic-id="${escapeHtml(t.id)}">
          <button type="button" class="topic-row__btn">${escapeHtml(t.name)}</button>
        </li>`
        )
        .join('');
      return `
      <div class="accordion" data-category-id="${escapeHtml(cat.id)}">
        <div class="accordion__head">
          <button type="button" class="accordion__expand" aria-expanded="true" aria-label="Развернуть">▼</button>
          <button type="button" class="accordion__cat">
            <span class="accordion__marker" style="background:${escapeHtml(cat.color)}"></span>
            <span class="accordion__title">${escapeHtml(cat.name)}</span>
          </button>
        </div>
        <div class="accordion__body">
          <ul class="topic-list">${topicsHtml}</ul>
          <button type="button" class="btn btn--ghost btn--sm add-topic-btn" data-category-id="${escapeHtml(cat.id)}">+ Добавить тему</button>
        </div>
      </div>`;
    })
    .join('');

  container.querySelectorAll('.accordion__expand').forEach((btn) => {
    btn.addEventListener('click', () => {
      const acc = btn.closest('.accordion');
      const body = acc.querySelector('.accordion__body');
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      body.hidden = open;
      btn.textContent = open ? '▶' : '▼';
    });
  });

  container.querySelectorAll('.accordion__cat').forEach((btn) => {
    btn.addEventListener('click', () => {
      const acc = btn.closest('.accordion');
      const id = acc.dataset.categoryId;
      const cat = categories.find((c) => c.id === id);
      if (cat) onEditCategory(cat);
    });
  });

  container.querySelectorAll('.topic-row__btn').forEach((b) => {
    b.addEventListener('click', () => {
      const row = b.closest('.topic-row');
      const tid = row.dataset.topicId;
      const topic = findTopicInMap(topicsByCategory, tid);
      if (topic) onEditTopic(topic);
    });
  });

  container.querySelectorAll('.add-topic-btn').forEach((btn) => {
    btn.addEventListener('click', () => onAddTopic(btn.dataset.categoryId));
  });
}

export function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.hidden = false;
    el.setAttribute('aria-hidden', 'false');
  }
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
  }
}
