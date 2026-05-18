/**
 * Shared subtask indicator chrome and task-detail popup API for kanban + sidebar hosts.
 * Popup DOM/event implementation is registered from content.js (single document.body instance).
 */
(function (global) {
  'use strict';

  const SUBTASK_CHECKLIST_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path><path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"></path><path d="M9 12h6"></path><path d="M9 16h6"></path><path d="m14 11 2 2 4-4"></path></svg>`;

  /** @type {null | { open: Function, close: Function }} */
  let popupApi = null;

  function getSubtaskStats(subtasks) {
    const list = Array.isArray(subtasks) ? subtasks : [];
    const total = list.length;
    const completed = list.filter((item) => Boolean(item?.done)).length;
    return {
      total,
      completed,
      allDone: total > 0 && completed === total,
    };
  }

  function syncSubtaskDataset(hostEl, subtasks) {
    if (!hostEl) return;
    const list = Array.isArray(subtasks) ? subtasks : [];
    if (list.length) {
      hostEl.dataset.subtasks = JSON.stringify(list);
    } else {
      delete hostEl.dataset.subtasks;
    }
  }

  /**
   * @param {HTMLElement} hostEl
   * @param {Array} subtasks
   * @param {{ tagHexByKey: Record<string, string>, normalizeHexColor: (hex: string) => string | null }} colorHelpers
   */
  function attachSubtaskIndicator(hostEl, subtasks, colorHelpers) {
    if (!hostEl || !colorHelpers) return;

    const list = Array.isArray(subtasks) ? subtasks : [];
    const existing = hostEl.querySelector('.mk-subtask-indicator');
    if (!list.length) {
      existing?.remove();
      return;
    }

    const stats = getSubtaskStats(list);
    const { tagHexByKey, normalizeHexColor } = colorHelpers;
    const categoryColor = hostEl.dataset.chipColor === 'custom' && hostEl.dataset.chipCustomHex
      ? normalizeHexColor(hostEl.dataset.chipCustomHex) || tagHexByKey.grey
      : tagHexByKey[hostEl.dataset.chipColor] || tagHexByKey.blue;

    let btn = existing;
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mk-subtask-indicator';
      btn.setAttribute('aria-label', 'View subtasks');
      btn.draggable = false;
      btn.innerHTML = `
        <span class="mk-subtask-indicator-icon" aria-hidden="true">${SUBTASK_CHECKLIST_ICON_SVG}</span>
        <span class="mk-subtask-indicator-badge"></span>
      `;
      hostEl.appendChild(btn);
    }

    btn.style.setProperty('--mk-category-color', categoryColor);
    btn.classList.toggle('mk-subtask-indicator--complete', stats.allDone);
    btn.querySelector('.mk-subtask-indicator-badge').textContent = `${stats.completed}/${stats.total}`;
    btn.setAttribute('aria-label', `View subtasks, ${stats.completed} of ${stats.total} complete`);
  }

  function registerPopupApi(api) {
    popupApi = api;
  }

  function open(anchorEl, taskId) {
    popupApi?.open(anchorEl, taskId);
  }

  function close() {
    popupApi?.close();
  }

  global.GpTaskDetailPopup = {
    SUBTASK_CHECKLIST_ICON_SVG,
    getSubtaskStats,
    syncSubtaskDataset,
    attachSubtaskIndicator,
    registerPopupApi,
    open,
    close,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
