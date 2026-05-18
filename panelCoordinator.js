/**
 * panelCoordinator.js — layout sync when Goal Planner (#gp-panel) and
 * My Tasks / kanban (#gp-kanban-panel) are both open.
 *
 * Both panels share the right side of Calendar. They are placed side-by-side
 * (kanban left of goals, goals next to the icon rail) and the calendar main
 * column is inset by the combined width.
 */
(function () {
  'use strict';

  const GOAL_PANEL_ID = 'gp-panel';
  const KANBAN_PANEL_ID = 'gp-kanban-panel';
  const PANEL_GAP_PX = 8;

  function panelIsOpen(id) {
    const el = document.getElementById(id);
    return !!(el && el.classList.contains('open'));
  }

  function panelWidthPx(id, fallback) {
    const el = document.getElementById(id);
    if (!el || !el.classList.contains('open')) return 0;
    const w = Math.round(el.getBoundingClientRect().width);
    if (w >= 200 && w <= 720) return w;
    return fallback;
  }

  function syncDualPanelLayout() {
    const goalOpen = panelIsOpen(GOAL_PANEL_ID);
    const kanbanOpen = panelIsOpen(KANBAN_PANEL_ID);

    document.body.classList.toggle('gp-dual-panels-goals-open', goalOpen);
    document.body.classList.toggle('gp-dual-panels-kanban-open', kanbanOpen);

    const goalW = goalOpen ? panelWidthPx(GOAL_PANEL_ID, 320) : 0;
    const offset = goalOpen && kanbanOpen ? goalW + PANEL_GAP_PX : 0;
    document.documentElement.style.setProperty('--gp-dual-goal-offset', `${offset}px`);

    document.dispatchEvent(new CustomEvent('gp:sync-calendar-push'));
  }

  const PANEL_WAIT_MS = 60_000;

  function watch(panelId) {
    const observer = new MutationObserver(() => syncDualPanelLayout());

    function tryAttach() {
      const panel = document.getElementById(panelId);
      if (panel) {
        observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
        syncDualPanelLayout();
        return true;
      }
      return false;
    }

    if (tryAttach()) return;

    const bodyObs = new MutationObserver(() => {
      if (tryAttach()) {
        bodyObs.disconnect();
        clearTimeout(timeoutId);
      }
    });
    bodyObs.observe(document.documentElement, { childList: true, subtree: true });

    const timeoutId = setTimeout(() => {
      tryAttach();
      bodyObs.disconnect();
    }, PANEL_WAIT_MS);
  }

  watch(GOAL_PANEL_ID);
  watch(KANBAN_PANEL_ID);
})();
