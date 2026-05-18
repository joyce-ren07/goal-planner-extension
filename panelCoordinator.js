/**
 * panelCoordinator.js — keeps the Goal Planner panel (#gp-panel) and the
 * kanban / My Tasks panel (#gp-kanban-panel) mutually exclusive.
 *
 * Both panels live in Google Calendar's right rail and both shrink the
 * calendar main column when open. Letting both be open at once doubles the
 * inset and squashes the calendar, so we enforce: opening one closes the
 * other. The class watched is `.open` on each panel element, which is the
 * activation class both feature modules already use.
 *
 * This file is intentionally tiny and stateless — it observes class changes
 * and dispatches the existing close paths each module exposes.
 */
(function () {
  'use strict';

  const GOAL_PANEL_ID = 'gp-panel';
  const KANBAN_PANEL_ID = 'gp-kanban-panel';

  let suppressingMutations = false;

  function isOpen(el) {
    return !!(el && el.classList && el.classList.contains('open'));
  }

  function closeGoalPanel() {
    const p = document.getElementById(GOAL_PANEL_ID);
    if (!p || !isOpen(p)) return;
    suppressingMutations = true;
    p.classList.remove('open');
    // Dispatch a synthetic event so the goal module can run its own teardown
    // (push observer reset, ghost preview cleanup, etc.) if it listens.
    document.dispatchEvent(new CustomEvent('gp:panel-coordinator-close', { detail: { id: GOAL_PANEL_ID } }));
    queueMicrotask(() => { suppressingMutations = false; });
  }

  function closeKanbanPanel() {
    const p = document.getElementById(KANBAN_PANEL_ID);
    if (!p || !isOpen(p)) return;
    suppressingMutations = true;
    p.classList.remove('open');
    document.dispatchEvent(new CustomEvent('gp:panel-coordinator-close', { detail: { id: KANBAN_PANEL_ID } }));
    queueMicrotask(() => { suppressingMutations = false; });
  }

  function watch(panelId, closeOther) {
    const observer = new MutationObserver(() => {
      if (suppressingMutations) return;
      const panel = document.getElementById(panelId);
      if (isOpen(panel)) closeOther();
    });

    function tryAttach() {
      const panel = document.getElementById(panelId);
      if (panel) {
        observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
        return true;
      }
      return false;
    }

    if (!tryAttach()) {
      // Either module may mount its panel after our content script runs.
      // Watch the body for child additions until the panel appears.
      const bodyObs = new MutationObserver(() => {
        if (tryAttach()) bodyObs.disconnect();
      });
      bodyObs.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  watch(GOAL_PANEL_ID, closeKanbanPanel);
  watch(KANBAN_PANEL_ID, closeGoalPanel);
})();
