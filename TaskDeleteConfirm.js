/**
 * Shared task delete confirmation UI for kanban cards and sidebar task rows.
 */
(function (global) {
  'use strict';

  const AUTO_CANCEL_MS = 5000;

  const TRASH_ICON_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

  let confirmHost = null;
  let confirmTimeoutId = null;
  let confirmOutsideHandler = null;
  let confirmEscapeHandler = null;

  function getDeleteConfirmAnchorEl(host) {
    if (!host) return null;
    if (host.classList.contains('gp-task-row')) {
      return host.querySelector('.gp-task-due-btn, .gp-task-subtitle');
    }
    return host.querySelector('.mk-card-due, .mk-card-due-btn');
  }

  function createTrashButton() {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'mk-delete-btn';
    deleteBtn.draggable = false;
    deleteBtn.setAttribute('aria-label', 'Delete task');
    deleteBtn.innerHTML = TRASH_ICON_SVG;
    return deleteBtn;
  }

  function createConfirmBar() {
    const deleteConfirm = document.createElement('div');
    deleteConfirm.className = 'mk-card-delete-confirm';
    deleteConfirm.setAttribute('aria-hidden', 'true');

    const deleteConfirmText = document.createElement('span');
    deleteConfirmText.className = 'mk-card-delete-confirm__text';
    deleteConfirmText.textContent = 'Delete this task?';

    const deleteConfirmActions = document.createElement('div');
    deleteConfirmActions.className = 'mk-card-delete-confirm__actions';

    const deleteConfirmBtn = document.createElement('button');
    deleteConfirmBtn.type = 'button';
    deleteConfirmBtn.className = 'mk-card-delete-confirm__delete';
    deleteConfirmBtn.textContent = 'Delete';

    const deleteCancelBtn = document.createElement('button');
    deleteCancelBtn.type = 'button';
    deleteCancelBtn.className = 'mk-card-delete-confirm__cancel';
    deleteCancelBtn.textContent = 'Cancel';

    deleteConfirmActions.appendChild(deleteConfirmBtn);
    deleteConfirmActions.appendChild(deleteCancelBtn);
    deleteConfirm.appendChild(deleteConfirmText);
    deleteConfirm.appendChild(deleteConfirmActions);

    return deleteConfirm;
  }

  function mountOnHost(host) {
    if (!host) return host;

    if (!host.querySelector('.mk-card-delete-confirm')) {
      host.appendChild(createConfirmBar());
    }

    return host;
  }

  function clear() {
    if (confirmTimeoutId) {
      clearTimeout(confirmTimeoutId);
      confirmTimeoutId = null;
    }

    if (confirmOutsideHandler) {
      document.removeEventListener('pointerdown', confirmOutsideHandler, true);
      confirmOutsideHandler = null;
    }

    if (confirmEscapeHandler) {
      document.removeEventListener('keydown', confirmEscapeHandler);
      confirmEscapeHandler = null;
    }

    if (confirmHost) {
      const confirmBar = confirmHost.querySelector('.mk-card-delete-confirm');
      confirmHost.classList.remove('is-delete-confirm');
      confirmHost.style.removeProperty('--mk-delete-confirm-top');
      if (confirmBar) {
        confirmBar.setAttribute('aria-hidden', 'true');
      }
      confirmHost = null;
    }
  }

  function syncOverlay(host) {
    if (!host) return;

    const anchorEl = getDeleteConfirmAnchorEl(host);
    if (!anchorEl) return;

    const hostRect = host.getBoundingClientRect();
    const anchorRect = anchorEl.getBoundingClientRect();
    const topPx = Math.max(0, Math.round(anchorRect.top - hostRect.top));
    host.style.setProperty('--mk-delete-confirm-top', `${topPx}px`);
  }

  function open(host) {
    if (!host) return;
    clear();

    confirmHost = host;
    host.style.setProperty('--mk-delete-confirm-top', `${host.offsetHeight}px`);

    host.classList.add('is-delete-confirm');
    const confirmBar = host.querySelector('.mk-card-delete-confirm');
    if (confirmBar) {
      confirmBar.setAttribute('aria-hidden', 'false');
    }

    requestAnimationFrame(() => {
      syncOverlay(host);
    });

    confirmTimeoutId = window.setTimeout(() => {
      clear();
    }, AUTO_CANCEL_MS);

    confirmOutsideHandler = (event) => {
      if (host.contains(event.target)) return;
      clear();
    };
    document.addEventListener('pointerdown', confirmOutsideHandler, true);

    confirmEscapeHandler = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      clear();
    };
    document.addEventListener('keydown', confirmEscapeHandler);
  }

  function getTaskIdFromHost(host) {
    if (!host) return '';
    return host.dataset.cardId || host.dataset.taskId || '';
  }

  global.GpTaskDeleteConfirm = {
    AUTO_CANCEL_MS,
    TRASH_ICON_SVG,
    createTrashButton,
    createConfirmBar,
    mountOnHost,
    clear,
    open,
    syncOverlay,
    getDeleteConfirmAnchorEl,
    getTaskIdFromHost,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
