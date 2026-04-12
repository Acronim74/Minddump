import * as db from './db.js';
import {
  renderNotesList,
  renderCategoriesAccordion,
  openModal,
  closeModal,
  COLOR_PRESETS,
} from './ui.js';
import { escapeHtml } from './utils.js';

const APP_VERSION = '1.0.0';

const state = {
  tab: 'notes',
  categories: [],
  topics: [],
  notes: [],
  actionsByNote: new Map(),
  filterCategoryId: '',
  filterStatus: '',
  search: '',
  sort: 'date',
  editingNoteId: null,
  resetConfirmStep: 0,
};

const els = {};

function $(id) {
  return document.getElementById(id);
}

async function refreshData() {
  const [categories, topics, notes] = await Promise.all([
    db.getAllCategories(),
    db.getAllTopics(),
    db.getAllNotes(),
  ]);
  state.categories = categories.sort((a, b) =>
    a.name.localeCompare(b.name, 'ru')
  );
  state.topics = topics;
  state.notes = notes;
  const counts = new Map();
  for (const n of notes) {
    const acts = await db.getActionsByNote(n.id);
    counts.set(n.id, acts.length);
  }
  state.actionCounts = counts;
}

function topicsByCategoryMap() {
  const m = new Map();
  for (const c of state.categories) m.set(c.id, []);
  for (const t of state.topics) {
    if (!m.has(t.categoryId)) m.set(t.categoryId, []);
    m.get(t.categoryId).push(t);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }
  return m;
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.nav__btn').forEach((b) => {
    b.classList.toggle('nav__btn--active', b.dataset.tab === tab);
    b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false');
  });
  $('screen-notes').hidden = tab !== 'notes';
  $('screen-categories').hidden = tab !== 'categories';
  $('screen-settings').hidden = tab !== 'settings';
  const show = (id, on) => {
    const el = $(id);
    if (el) el.classList.toggle('hidden', !on);
  };
  show('header-actions-notes', tab === 'notes');
  show('header-actions-categories', tab === 'categories');
  show('header-actions-settings', tab === 'settings');
  if (tab === 'notes') renderNotesScreen();
  if (tab === 'categories') renderCategoriesScreen();
}

function renderFilterChips() {
  const wrap = $('filter-chips');
  const parts = [
    `<button type="button" class="chip${!state.filterCategoryId && !state.filterStatus ? ' chip--active' : ''}" data-filter="all">Все</button>`,
  ];
  for (const c of state.categories) {
    const active = state.filterCategoryId === c.id;
    parts.push(
      `<button type="button" class="chip${active ? ' chip--active' : ''}" data-cat="${c.id}" style="--chip:${escapeAttr(c.color)}">${escapeHtml(c.name)}</button>`
    );
  }
  const stOpen = state.filterStatus === 'open';
  const stDone = state.filterStatus === 'done';
  parts.push(
    `<button type="button" class="chip${stOpen ? ' chip--active' : ''}" data-status="open">Открытые</button>`,
    `<button type="button" class="chip${stDone ? ' chip--active' : ''}" data-status="done">Выполненные</button>`
  );
  wrap.innerHTML = parts.join('');
  wrap.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.filter === 'all') {
        state.filterCategoryId = '';
        state.filterStatus = '';
      } else if (btn.dataset.cat) {
        state.filterCategoryId = btn.dataset.cat;
        state.filterStatus = '';
      } else if (btn.dataset.status) {
        state.filterStatus = btn.dataset.status;
        state.filterCategoryId = '';
      }
      renderNotesScreen();
    });
  });
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function syncCategoryColorUI() {
  const current = ($('cat-modal-color')?.value || COLOR_PRESETS[0]).toLowerCase();
  document.querySelectorAll('.color-swatch').forEach((btn) => {
    const hex = (btn.dataset.hex || '').toLowerCase();
    btn.classList.toggle('color-swatch--active', hex === current);
  });
}

function fillTopicModalCategorySelect(selectedId) {
  const sel = $('topic-modal-category');
  if (!sel) return;
  sel.innerHTML = state.categories
    .map(
      (c) =>
        `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(
          c.name
        )}</option>`
    )
    .join('');
}

function renderNotesScreen() {
  renderFilterChips();
  const sortEl = $('notes-sort');
  if (sortEl) sortEl.value = state.sort;

  renderNotesList({
    container: $('notes-list'),
    categories: state.categories,
    topics: state.topics,
    notes: state.notes,
    actionCounts: state.actionCounts,
    filterCategoryId: state.filterCategoryId,
    filterStatus: state.filterStatus,
    search: state.search,
    sort: state.sort,
    onOpen: (id) => openDetail(id),
    onDelete: async (id) => {
      await db.deleteNote(id);
      await refreshData();
      renderNotesScreen();
    },
    onDone: async (id) => {
      await db.updateNote(id, { status: 'done' });
      await refreshData();
      renderNotesScreen();
    },
  });
}

function renderCategoriesScreen() {
  const m = topicsByCategoryMap();
  renderCategoriesAccordion({
    container: $('categories-list'),
    categories: state.categories,
    topicsByCategory: m,
    onAddTopic: (categoryId) => {
      fillTopicModalCategorySelect(categoryId);
      $('topic-modal-name').value = '';
      $('topic-modal-title').textContent = 'Новая тема';
      $('topic-modal').dataset.editId = '';
      $('topic-modal-delete').hidden = true;
      openModal('topic-modal');
    },
    onEditCategory: (cat) => {
      $('cat-modal-name').value = cat.name;
      $('cat-modal-id').value = cat.id;
      $('cat-modal-color').value = cat.color || COLOR_PRESETS[0];
      syncCategoryColorUI();
      $('cat-modal-title').textContent = 'Категория';
      $('cat-modal-delete').hidden = false;
      openModal('category-modal');
    },
    onEditTopic: (topic) => {
      fillTopicModalCategorySelect(topic.categoryId);
      $('topic-modal-name').value = topic.name;
      $('topic-modal-title').textContent = 'Тема';
      $('topic-modal').dataset.editId = topic.id;
      $('topic-modal-delete').hidden = false;
      openModal('topic-modal');
    },
  });
}

async function openDetail(noteId) {
  state.editingNoteId = noteId;
  const note = await db.getNote(noteId);
  if (!note) return;
  const actions = await db.getActionsByNote(noteId);
  $('detail-title').value = note.title || '';
  $('detail-category').innerHTML = state.categories
    .map(
      (c) =>
        `<option value="${c.id}" ${c.id === note.categoryId ? 'selected' : ''}>${escapeHtml(
          c.name
        )}</option>`
    )
    .join('');
  const tid = note.topicId;
  populateTopicSelect(note.categoryId, tid);
  $('detail-status').value = note.status || 'open';
  renderDetailActions(actions);
  $('screen-detail').hidden = false;
  $('screen-detail').setAttribute('aria-hidden', 'false');
}

function populateTopicSelect(categoryId, selectedTopicId) {
  const sel = $('detail-topic');
  const topics = state.topics.filter((t) => t.categoryId === categoryId);
  sel.innerHTML = topics
    .map(
      (t) =>
        `<option value="${t.id}" ${t.id === selectedTopicId ? 'selected' : ''}>${escapeHtml(
          t.name
        )}</option>`
    )
    .join('');
  if (topics.length === 0) {
    sel.innerHTML = '<option value="">— нет тем —</option>';
  }
}

function renderDetailActions(actions) {
  const list = $('detail-actions-list');
  list.innerHTML = actions
    .map(
      (a) => `
    <li class="action-row" data-action-id="${a.id}">
      <label class="action-row__check">
        <input type="checkbox" ${a.done ? 'checked' : ''} data-toggle="${a.id}" />
        <span class="action-row__text" data-edit="${a.id}">${escapeHtml(a.text)}</span>
      </label>
      <button type="button" class="icon-btn" data-del-action="${a.id}" aria-label="Удалить">×</button>
    </li>`
    )
    .join('');

  list.querySelectorAll('input[data-toggle]').forEach((inp) => {
    inp.addEventListener('change', async () => {
      await db.toggleAction(inp.dataset.toggle);
      await refreshData();
    });
  });

  list.querySelectorAll('[data-edit]').forEach((span) => {
    span.addEventListener('click', async () => {
      const id = span.dataset.edit;
      const text = prompt('Текст действия', span.textContent);
      if (text == null) return;
      await db.updateAction(id, { text });
      await openDetail(state.editingNoteId);
    });
  });

  list.querySelectorAll('[data-del-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await db.deleteAction(btn.dataset.delAction);
      await openDetail(state.editingNoteId);
      await refreshData();
    });
  });
}

function closeDetail() {
  $('screen-detail').hidden = true;
  $('screen-detail').setAttribute('aria-hidden', 'true');
  state.editingNoteId = null;
}

async function saveDetail() {
  const id = state.editingNoteId;
  if (!id) return;
  const title = $('detail-title').value.trim();
  const categoryId = $('detail-category').value;
  const topicId = $('detail-topic').value;
  const status = $('detail-status').value;
  if (categoryId && !topicId) {
    alert('Выберите тему для заметки');
    return;
  }
  await db.updateNote(id, { title, categoryId, topicId, status });
  await refreshData();
  closeDetail();
  if (state.tab === 'notes') renderNotesScreen();
}

async function addDetailAction() {
  const id = state.editingNoteId;
  const text = $('detail-new-action').value.trim();
  if (!id || !text) return;
  await db.addAction({ noteId: id, text });
  $('detail-new-action').value = '';
  await openDetail(id);
  await refreshData();
}

function fillCategorySelect(selectEl, selectedId) {
  selectEl.innerHTML = state.categories
    .map(
      (c) =>
        `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(
          c.name
        )}</option>`
    )
    .join('');
}

async function exportJson() {
  const data = await db.exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `minddump-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function wireSettings() {
  $('btn-export').addEventListener('click', () => exportJson());
  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!confirm('Импорт заменит все текущие данные. Продолжить?')) return;
      await db.importData(data);
      await refreshData();
      setTab(state.tab);
      alert('Импорт выполнен');
    } catch (err) {
      alert('Ошибка импорта: ' + (err.message || err));
    }
  });
  $('btn-reset').addEventListener('click', async () => {
    if (state.resetConfirmStep === 0) {
      if (!confirm('Удалить ВСЕ данные? Это действие необратимо.')) return;
      state.resetConfirmStep = 1;
      $('btn-reset').textContent = 'Нажмите ещё раз для подтверждения';
      setTimeout(() => {
        state.resetConfirmStep = 0;
        $('btn-reset').textContent = 'Сбросить все данные';
      }, 5000);
      return;
    }
    await db.clearAllData();
    state.resetConfirmStep = 0;
    $('btn-reset').textContent = 'Сбросить все данные';
    await refreshData();
    setTab('notes');
    alert('Данные очищены');
  });
  $('app-version').textContent = APP_VERSION;
}

function wireNav() {
  document.querySelectorAll('.nav__btn').forEach((b) => {
    b.addEventListener('click', () => setTab(b.dataset.tab));
  });
}

function wireNotesHeader() {
  $('btn-add-note').addEventListener('click', () => {
    if (state.categories.length === 0) {
      alert('Сначала создайте категорию на вкладке «Категории»');
      return;
    }
    $('new-note-title').value = '';
    fillCategorySelect($('new-note-category'), state.categories[0]?.id || '');
    const cid = $('new-note-category').value;
    fillTopicSelectForNewNote(cid);
    openModal('new-note-modal');
  });
  $('btn-search-toggle').addEventListener('click', () => {
    const bar = $('search-bar');
    bar.hidden = !bar.hidden;
    if (!bar.hidden) $('search-input').focus();
  });
  $('search-input').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderNotesScreen();
  });
  $('notes-sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderNotesScreen();
  });
}

function fillTopicSelectForNewNote(categoryId) {
  const sel = $('new-note-topic');
  const topics = state.topics.filter((t) => t.categoryId === categoryId);
  sel.innerHTML = topics
    .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
    .join('');
  if (topics.length === 0) {
    sel.innerHTML = '<option value="">— добавьте тему —</option>';
  }
}

function wireNewNoteModal() {
  $('new-note-category').addEventListener('change', (e) => {
    fillTopicSelectForNewNote(e.target.value);
  });
  $('new-note-save').addEventListener('click', async () => {
    const title = $('new-note-title').value.trim();
    const categoryId = $('new-note-category').value;
    const topicId = $('new-note-topic').value;
    if (!categoryId) return;
    if (!topicId) {
      alert('Выберите тему или создайте её в категориях');
      return;
    }
    await db.addNote({ title, categoryId, topicId });
    closeModal('new-note-modal');
    await refreshData();
    renderNotesScreen();
  });
  $('new-note-cancel').addEventListener('click', () => closeModal('new-note-modal'));
}

function wireCategoryModal() {
  $('btn-add-category').addEventListener('click', () => {
    $('cat-modal-name').value = '';
    $('cat-modal-id').value = '';
    $('cat-modal-color').value = COLOR_PRESETS[0];
    syncCategoryColorUI();
    $('cat-modal-title').textContent = 'Новая категория';
    $('cat-modal-delete').hidden = true;
    openModal('category-modal');
  });
  document.querySelectorAll('.color-swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('cat-modal-color').value = btn.dataset.hex || COLOR_PRESETS[0];
      syncCategoryColorUI();
    });
  });
  $('cat-modal-save').addEventListener('click', async () => {
    const name = $('cat-modal-name').value.trim();
    if (!name) return;
    const color = $('cat-modal-color').value || COLOR_PRESETS[0];
    const id = $('cat-modal-id').value;
    if (id) {
      await db.updateCategory(id, { name, color });
    } else {
      await db.addCategory({ name, color });
    }
    closeModal('category-modal');
    await refreshData();
    renderCategoriesScreen();
  });
  $('cat-modal-delete').addEventListener('click', async () => {
    const id = $('cat-modal-id').value;
    if (!id) return;
    if (!confirm('Удалить категорию и все вложенные темы и заметки?')) return;
    await db.deleteCategory(id);
    closeModal('category-modal');
    await refreshData();
    renderCategoriesScreen();
    if (state.tab === 'notes') renderNotesScreen();
  });
  $('cat-modal-cancel').addEventListener('click', () => closeModal('category-modal'));
}

function wireTopicModal() {
  $('topic-modal-save').addEventListener('click', async () => {
    const name = $('topic-modal-name').value.trim();
    const categoryId = $('topic-modal-category').value;
    if (!name || !categoryId) return;
    const editId = $('topic-modal').dataset.editId;
    if (editId) {
      await db.updateTopic(editId, { name, categoryId });
    } else {
      await db.addTopic({ name, categoryId });
    }
    closeModal('topic-modal');
    await refreshData();
    renderCategoriesScreen();
  });
  $('topic-modal-delete').addEventListener('click', async () => {
    const editId = $('topic-modal').dataset.editId;
    if (!editId) return;
    if (!confirm('Удалить тему и все заметки в ней?')) return;
    await db.deleteTopic(editId);
    closeModal('topic-modal');
    await refreshData();
    renderCategoriesScreen();
    if (state.tab === 'notes') renderNotesScreen();
  });
  $('topic-modal-cancel').addEventListener('click', () => closeModal('topic-modal'));
}

function wireDetail() {
  $('detail-back').addEventListener('click', () => closeDetail());
  $('detail-save').addEventListener('click', () => saveDetail());
  $('detail-category').addEventListener('change', (e) => {
    const firstTopic = state.topics.find((t) => t.categoryId === e.target.value);
    populateTopicSelect(e.target.value, firstTopic?.id || '');
  });
  $('detail-add-action').addEventListener('click', () => addDetailAction());
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (e) {
    console.warn('SW register failed', e);
  }
}

function wireModalBackdrops() {
  document.querySelectorAll('.modal__backdrop[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeModal(el.dataset.close));
  });
}

async function init() {
  wireNav();
  wireNotesHeader();
  wireNewNoteModal();
  wireCategoryModal();
  wireTopicModal();
  wireDetail();
  wireSettings();
  wireModalBackdrops();
  await refreshData();
  setTab('notes');
  await registerSW();
}

init();
