(function () {
  'use strict';

  const PANEL_WIDTH_PX = 341;
  const MAIN_MARGIN_TRANSITION = 'margin-right 0.2s ease';
  const TASK_COMPLETE_ANIM_MS = 1200;
  const TASK_STATUSES = {
    planned: {
      label: 'Planned',
      className: 'gp-filter-chip--planned',
    },
    progress: {
      label: 'In progress',
      className: 'gp-filter-chip--progress',
    },
    done: {
      label: 'Done',
      className: 'gp-filter-chip--done',
    },
  };
  const FOLDER_LABELS = {
    today: 'Due Today',
    tomorrow: 'Due Tomorrow',
    later: 'Due Later',
    completed: 'Completed',
  };
  const KANBAN_STORAGE_KEY = 'gpKanbanBoardState';
  const KANBAN_COLUMN_DEFS = [
    { id: 'todo', label: 'TO-DO' },
    { id: 'progress', label: 'IN PROGRESS' },
    { id: 'done', label: 'DONE' },
  ];
  const KANBAN_CHIP_COLORS = {
    PSYC101: 'blue',
    MGT103: 'red',
    COGS14B: 'green',
    PS: 'yellow',
  };
  const KANBAN_LEGACY_CHIP_COLORS = {
    psych: 'blue',
    mgt: 'red',
    cogs: 'green',
    ps: 'yellow',
  };
  const KANBAN_COURSE_OPTIONS = ['PSYC101', 'MGT103', 'COGS14B', 'PS'];
  const MYTASKS_MESSAGE_SOURCE = 'mytasks-kanban-extension';
  const KANBAN_LIST_MATCHERS = [
    { id: 'all', pattern: /^\s*my tasks?\s*$/i },
    { id: 'todo', pattern: /\bto[\s-]*do\b/i },
    { id: 'progress', pattern: /\bin progress\b/i },
    { id: 'done', pattern: /^\s*done\s*$/i },
  ];
  const SIDEBAR_MARKUP = `
<div id="gp-panel" class="mytasks-sidebar" aria-hidden="true">
  <div class="gp-card" id="gp-card">
    <header class="gp-header gp-header--tasks">
      <h2 class="gp-header-title">My Tasks</h2>
      <button class="gp-icon-btn" id="gp-close-btn" type="button" title="Close" aria-label="Close tasks panel">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </header>

    <button type="button" class="gp-create-task-row" id="gp-create-task-btn">
      <span class="gp-create-task-icon" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </span>
      <span class="gp-create-task-label">Create task</span>
    </button>

    <div class="gp-tasks-accordion" id="gp-tasks-accordion">
      <section class="gp-task-folder open" data-folder="today">
        <div class="gp-task-folder-header">
          <button class="gp-task-folder-toggle" type="button" aria-expanded="true" aria-label="Toggle Due Today tasks">
            <svg class="gp-task-folder-chevron" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 6 15 12 9 18"></polyline>
            </svg>
          </button>
          <span class="gp-task-folder-label">Due Today (2)</span>
        </div>
        <div class="gp-task-folder-panel">
          <div class="gp-task-folder-panel-inner">
            <article class="gp-task-row" data-due-date="2026-05-21">
              <button type="button" class="gp-task-checkbox" aria-label="Mark Project Outline complete">
                <span class="gp-task-checkbox-icon" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"></circle>
                  </svg>
                </span>
              </button>
              <div class="gp-task-body">
                <div class="gp-task-text">
                  <p class="gp-task-title">Project Outline</p>
                  <p class="gp-task-subtitle">Due Thurs, May 21</p>
                </div>
                <div class="gp-task-meta">
                  <span class="gp-course-chip gp-course-chip--psych">PSYC101</span>
                  <div class="gp-filter-chip gp-filter-chip--planned" data-status="planned" role="group" aria-label="Status: Planned">
                    <span class="gp-filter-chip-dot" aria-hidden="true"></span>
                    <span class="gp-filter-chip-label">Planned</span>
                    <button type="button" class="gp-filter-chip-menu-btn" aria-haspopup="menu" aria-controls="gp-status-menu" aria-expanded="false" aria-label="Change task status">
                      <span class="gp-filter-chip-trailing" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </article>

            <article class="gp-task-row" data-due-date="2026-05-21">
              <button type="button" class="gp-task-checkbox" aria-label="Mark Project Outline complete">
                <span class="gp-task-checkbox-icon" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"></circle>
                  </svg>
                </span>
              </button>
              <div class="gp-task-body">
                <div class="gp-task-text">
                  <p class="gp-task-title">Project Outline</p>
                  <p class="gp-task-subtitle">Due Thurs, May 21</p>
                </div>
                <div class="gp-task-meta">
                  <span class="gp-course-chip gp-course-chip--cogs">COGS14B</span>
                  <div class="gp-filter-chip gp-filter-chip--progress" data-status="progress" role="group" aria-label="Status: In progress">
                    <span class="gp-filter-chip-dot" aria-hidden="true"></span>
                    <span class="gp-filter-chip-label">In progress</span>
                    <button type="button" class="gp-filter-chip-menu-btn" aria-haspopup="menu" aria-controls="gp-status-menu" aria-expanded="false" aria-label="Change task status">
                      <span class="gp-filter-chip-trailing" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section class="gp-task-folder open" data-folder="tomorrow">
        <div class="gp-task-folder-header">
          <button class="gp-task-folder-toggle" type="button" aria-expanded="true" aria-label="Toggle Due Tomorrow tasks">
            <svg class="gp-task-folder-chevron" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 6 15 12 9 18"></polyline>
            </svg>
          </button>
          <span class="gp-task-folder-label">Due Tomorrow (1)</span>
        </div>
        <div class="gp-task-folder-panel">
          <div class="gp-task-folder-panel-inner">
            <article class="gp-task-row" data-due-date="2026-05-21">
              <button type="button" class="gp-task-checkbox" aria-label="Mark Project Outline complete">
                <span class="gp-task-checkbox-icon" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"></circle>
                  </svg>
                </span>
              </button>
              <div class="gp-task-body">
                <div class="gp-task-text">
                  <p class="gp-task-title">Project Outline</p>
                  <p class="gp-task-subtitle">Due Thurs, May 21</p>
                </div>
                <div class="gp-task-meta">
                  <span class="gp-course-chip gp-course-chip--ps">PS</span>
                  <div class="gp-filter-chip gp-filter-chip--progress" data-status="progress" role="group" aria-label="Status: In progress">
                    <span class="gp-filter-chip-dot" aria-hidden="true"></span>
                    <span class="gp-filter-chip-label">In progress</span>
                    <button type="button" class="gp-filter-chip-menu-btn" aria-haspopup="menu" aria-controls="gp-status-menu" aria-expanded="false" aria-label="Change task status">
                      <span class="gp-filter-chip-trailing" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section class="gp-task-folder" data-folder="later">
        <div class="gp-task-folder-header">
          <button class="gp-task-folder-toggle" type="button" aria-expanded="false" aria-label="Toggle Due Later tasks">
            <svg class="gp-task-folder-chevron" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 6 15 12 9 18"></polyline>
            </svg>
          </button>
          <span class="gp-task-folder-label">Due Later (0)</span>
        </div>
        <div class="gp-task-folder-panel">
          <div class="gp-task-folder-panel-inner"></div>
        </div>
      </section>

      <section class="gp-task-folder" data-folder="completed">
        <div class="gp-task-folder-header">
          <button class="gp-task-folder-toggle" type="button" aria-expanded="false" aria-label="Toggle Completed tasks">
            <svg class="gp-task-folder-chevron" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 6 15 12 9 18"></polyline>
            </svg>
          </button>
          <span class="gp-task-folder-label">Completed (0)</span>
        </div>
        <div class="gp-task-folder-panel">
          <div class="gp-task-folder-panel-inner"></div>
        </div>
      </section>
    </div>
  </div>

  <div id="gp-status-menu" class="gp-status-menu" role="menu" aria-label="Task status" hidden>
    <button type="button" class="gp-status-menu-item" role="menuitemradio" data-status="planned" aria-checked="false">
      <span class="gp-status-menu-dot gp-status-menu-dot--planned" aria-hidden="true"></span>
      <span class="gp-status-menu-label">Planned</span>
      <span class="gp-status-menu-check" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </span>
    </button>
    <button type="button" class="gp-status-menu-item" role="menuitemradio" data-status="progress" aria-checked="false">
      <span class="gp-status-menu-dot gp-status-menu-dot--progress" aria-hidden="true"></span>
      <span class="gp-status-menu-label">In progress</span>
      <span class="gp-status-menu-check" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </span>
    </button>
    <button type="button" class="gp-status-menu-item" role="menuitemradio" data-status="done" aria-checked="false">
      <span class="gp-status-menu-dot gp-status-menu-dot--done" aria-hidden="true"></span>
      <span class="gp-status-menu-label">Done</span>
      <span class="gp-status-menu-check" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </span>
    </button>
  </div>
</div>
`.trim();

  let cachedCalendarMainEl = null;
  let calendarPushDebounce = null;
  let railMountDebounce = null;
  let nativeTasksKanbanDebounce = null;
  let nativeTasksObserver = null;
  let nativeTasksSyncInFlight = false;
  let nativeTasksResizeObserver = null;
  let activeNativeTasksHost = null;
  let kanbanStateCache = null;
  let kanbanStorageListenerWired = false;
  let closeTaskStatusMenu = null;

  const SIDE_APP_LABEL_RE = /\b(keep|tasks|contacts|maps|side panel|add-ons|jamboard)\b/i;

  function isVisibleElement(el) {
    if (!el || !el.isConnected) return false;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findSideAppAnchors() {
    const anchors = new Set();

    document.querySelectorAll('[aria-label], [data-tooltip]').forEach((el) => {
      if (!isVisibleElement(el)) return;

      const label = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('data-tooltip') || ''}`.trim();
      if (!SIDE_APP_LABEL_RE.test(label)) return;

      const rect = el.getBoundingClientRect();
      if (rect.right < window.innerWidth - 140) return;

      anchors.add(el);
    });

    return [...anchors];
  }

  function countRailActions(el) {
    return el.querySelectorAll('button, [role="button"], a[href]').length;
  }

  function scoreRailCandidate(el) {
    if (!isVisibleElement(el)) return -1;

    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const actions = countRailActions(el);

    if (actions < 1) return -1;
    if (rect.right < window.innerWidth - 120) return -1;
    if (rect.width > 160 || rect.height < 72) return -1;

    let score = 0;

    if (style.position === 'fixed' || style.position === 'sticky') score += 5;
    else if (style.position === 'absolute') score += 2;

    if (rect.right >= window.innerWidth - 8) score += 4;
    if (rect.width <= 72) score += 3;
    if (style.flexDirection === 'column') score += 3;
    score += Math.min(actions, 8);
    if (el.children.length >= 2) score += 2;

    return score;
  }

  function findRailFromAnchors(anchors) {
    let best = null;
    let bestScore = 2;

    anchors.forEach((anchor) => {
      let el = anchor;
      for (let depth = 0; depth < 12 && el; depth += 1) {
        const score = scoreRailCandidate(el);
        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
        el = el.parentElement;
      }
    });

    return best;
  }

  function findRailByStructure() {
    const anchors = findSideAppAnchors();
    const fromAnchors = findRailFromAnchors(anchors);
    if (fromAnchors) return fromAnchors;

    let best = null;
    let bestScore = 2;

    document.querySelectorAll('div, nav, aside, section').forEach((el) => {
      const score = scoreRailCandidate(el);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    });

    return best;
  }

  function ensureFallbackRailHost() {
    let host = document.getElementById('gp-sidebar-rail');
    if (host) return host;

    host = document.createElement('div');
    host.id = 'gp-sidebar-rail';
    host.dataset.fallback = 'true';
    document.body.appendChild(host);
    return host;
  }

  function positionFallbackRail(anchorEl) {
    const host = document.getElementById('gp-sidebar-rail');
    if (!host || host.dataset.fallback !== 'true') return;

    const anchor = anchorEl || findSideAppAnchors()[0];
    if (!anchor) {
      host.style.top = '120px';
      host.style.right = '8px';
      return;
    }

    const rect = anchor.getBoundingClientRect();
    host.style.top = `${Math.max(80, Math.round(rect.top))}px`;
    host.style.right = `${Math.max(4, Math.round(window.innerWidth - rect.right))}px`;
  }

  function getRailMountTarget() {
    const rail = findRailByStructure();
    if (rail) return rail;
    return ensureFallbackRailHost();
  }

  function createRailButton() {
    const btn = document.createElement('button');
    btn.id = 'gp-sidebar-btn';
    btn.type = 'button';
    btn.title = 'My Tasks';
    btn.setAttribute('aria-label', 'Open My Tasks');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 6h11"></path>
      <path d="M9 12h11"></path>
      <path d="M9 18h11"></path>
      <polyline points="4 6 5 7 7 5"></polyline>
      <polyline points="4 12 5 13 7 11"></polyline>
      <polyline points="4 18 5 19 7 17"></polyline>
    </svg>`;
    btn.addEventListener('click', () => {
      handleToggleRequest();
    });
    return btn;
  }

  function syncRailButtonState() {
    const btn = document.getElementById('gp-sidebar-btn');
    const panel = document.getElementById('gp-panel');
    if (!btn || !panel) return;

    const isOpen = panel.classList.contains('open');
    btn.classList.toggle('active', isOpen);
    btn.setAttribute('aria-pressed', isOpen ? 'true' : 'false');
  }

  function placeRailButton(rail, button) {
    if (button.parentElement !== rail || rail.firstElementChild !== button) {
      rail.prepend(button);
    }
  }

  function mountRailButton() {
    const existing = document.getElementById('gp-sidebar-btn');
    const rail = getRailMountTarget();

    if (existing) {
      placeRailButton(rail, existing);

      if (rail.id === 'gp-sidebar-rail') {
        positionFallbackRail();
      } else {
        const fallback = document.getElementById('gp-sidebar-rail');
        if (fallback) fallback.remove();
      }

      syncRailButtonState();
      return;
    }

    if (rail.id === 'gp-sidebar-rail') {
      positionFallbackRail();
    }

    placeRailButton(rail, createRailButton());
    syncRailButtonState();
  }

  function setupRailObserver() {
    const scheduleMount = () => {
      if (railMountDebounce) clearTimeout(railMountDebounce);
      railMountDebounce = setTimeout(() => {
        railMountDebounce = null;
        mountRailButton();
      }, 120);
    };

    const observer = new MutationObserver(scheduleMount);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', scheduleMount);
    scheduleMount();
  }

  function getCalendarMainEl() {
    if (cachedCalendarMainEl && document.contains(cachedCalendarMainEl)) {
      return cachedCalendarMainEl;
    }

    const candidates = [...document.querySelectorAll('[role="main"], main')]
      .filter((el) => !el.closest('.mytasks-sidebar, .mytasks-native-tasks-layout, #gp-panel'))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width >= 280 && rect.height >= 200;
      })
      .sort((left, right) => (
        (right.clientWidth * right.clientHeight) - (left.clientWidth * left.clientHeight)
      ));

    cachedCalendarMainEl = candidates[0] || null;
    return cachedCalendarMainEl;
  }

  function setCalendarPushed(open) {
    const mainEl = getCalendarMainEl();
    if (!mainEl) return;

    mainEl.style.transition = MAIN_MARGIN_TRANSITION;
    mainEl.style.marginRight = open ? `${PANEL_WIDTH_PX}px` : '';
  }

  function setupCalendarPushObserver() {
    const reapply = () => {
      const panel = document.getElementById('gp-panel');
      if (panel && panel.classList.contains('open')) {
        setCalendarPushed(true);
      }
    };

    const scheduleReapply = () => {
      if (calendarPushDebounce) clearTimeout(calendarPushDebounce);
      calendarPushDebounce = setTimeout(() => {
        calendarPushDebounce = null;
        if (cachedCalendarMainEl && !document.contains(cachedCalendarMainEl)) {
          cachedCalendarMainEl = null;
        }
        reapply();
      }, 120);
    };

    const observer = new MutationObserver(scheduleReapply);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', reapply);
  }

  const MONTH_LOOKUP = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };

  function normalizeDateOnly(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function parseTaskDueDate(subtitleText) {
    if (!subtitleText) return null;

    const match = subtitleText.trim().match(/^Due\s+\w+,?\s+([A-Za-z]+)\s+(\d{1,2})$/i);
    if (!match) return null;

    const monthKey = match[1].trim().toLowerCase();
    const day = Number(match[2]);
    const month = MONTH_LOOKUP[monthKey];
    if (month === undefined || Number.isNaN(day)) return null;

    const now = new Date();
    let year = now.getFullYear();
    const candidate = new Date(year, month, day);
    if (candidate < normalizeDateOnly(now) && month < now.getMonth()) {
      year += 1;
    }

    return new Date(year, month, day);
  }

  function getTaskDueDate(row) {
    if (!row) return null;

    if (row.dataset.dueDate) {
      const [year, month, day] = row.dataset.dueDate.split('-').map(Number);
      if (year && month && day) {
        return new Date(year, month - 1, day);
      }
    }

    const subtitle = row.querySelector('.gp-task-subtitle')?.textContent;
    return parseTaskDueDate(subtitle);
  }

  function getDeadlineFolderKey(dueDate, now = new Date()) {
    if (!dueDate) return 'later';

    const dueDay = normalizeDateOnly(dueDate);
    const today = normalizeDateOnly(now);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (dueDay < today) return 'today';
    if (dueDay.getTime() === today.getTime()) return 'today';
    if (dueDay.getTime() === tomorrow.getTime()) return 'tomorrow';
    return 'later';
  }

  function setCheckboxUncheckedVisual(checkbox) {
    const icon = checkbox.querySelector('.gp-task-checkbox-icon');
    if (!icon) return;

    icon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"></circle>
    </svg>`;
    checkbox.classList.remove('gp-task-checkbox--checked');
  }

  function restoreTaskFromCompleted(chip) {
    const row = chip.closest('.gp-task-row');
    const completedFolder = row?.closest('.gp-task-folder');
    const accordion = row?.closest('#gp-tasks-accordion');
    if (!row || !accordion || completedFolder?.dataset.folder !== 'completed') return;

    const targetFolderKey = getDeadlineFolderKey(getTaskDueDate(row));
    const targetFolder = accordion.querySelector(`[data-folder="${targetFolderKey}"]`);
    if (!targetFolder) return;

    const checkbox = row.querySelector('.gp-task-checkbox');
    if (checkbox) {
      checkbox.disabled = false;
      setCheckboxUncheckedVisual(checkbox);
    }

    row.classList.remove('gp-task-row--completed', 'gp-task-row--departing');
    row.dataset.completing = 'false';

    const targetInner = targetFolder.querySelector('.gp-task-folder-panel-inner');
    if (targetInner) {
      targetInner.appendChild(row);
    }

    syncFolderCounts(accordion);

    targetFolder.classList.add('open');
    const targetToggle = targetFolder.querySelector('.gp-task-folder-toggle');
    if (targetToggle) {
      targetToggle.setAttribute('aria-expanded', 'true');
    }
  }

  function applyTaskStatus(chip, statusKey, options = {}) {
    const status = TASK_STATUSES[statusKey];
    if (!chip || !status) return;

    const row = chip.closest('.gp-task-row');
    const folder = row?.closest('.gp-task-folder');
    const folderKey = folder?.dataset.folder;

    chip.dataset.status = statusKey;
    chip.classList.remove(
      'gp-filter-chip--planned',
      'gp-filter-chip--progress',
      'gp-filter-chip--done',
    );
    chip.classList.add(status.className);

    const label = chip.querySelector('.gp-filter-chip-label');
    if (label) {
      label.textContent = status.label;
    }

    chip.setAttribute('aria-label', `Status: ${status.label}`);

    const menuBtn = chip.querySelector('.gp-filter-chip-menu-btn');
    if (menuBtn) {
      menuBtn.setAttribute('aria-label', `Change task status: ${status.label}`);
    }

    if (statusKey === 'done' && !options.skipComplete) {
      const checkbox = row?.querySelector('.gp-task-checkbox');
      if (row && folderKey !== 'completed' && checkbox) {
        completeTask(checkbox);
      }
      return;
    }

    if (folderKey === 'completed' && statusKey !== 'done' && !options.skipRestore) {
      restoreTaskFromCompleted(chip);
    }
  }

  function positionStatusMenu(trigger, menu, panel) {
    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const menuWidth = menu.offsetWidth || 208;
    const menuHeight = menu.offsetHeight || 156;
    const edgePadding = 8;

    let left = triggerRect.right - panelRect.left - menuWidth;
    left = Math.max(edgePadding, Math.min(left, panelRect.width - menuWidth - edgePadding));

    let top = triggerRect.bottom - panelRect.top + 4;
    if (top + menuHeight > panelRect.height - edgePadding) {
      top = triggerRect.top - panelRect.top - menuHeight - 4;
    }
    top = Math.max(edgePadding, Math.min(top, panelRect.height - menuHeight - edgePadding));

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }

  function initTaskStatusMenus(panel) {
    const menu = panel.querySelector('#gp-status-menu');
    const accordion = panel.querySelector('#gp-tasks-accordion');
    const scrollContainer = panel.querySelector('.gp-card');
    if (!menu || !accordion || !scrollContainer || menu.dataset.wired === 'true') return;

    menu.dataset.wired = 'true';
    let activeTrigger = null;
    let activeChip = null;

    const closeStatusMenu = () => {
      if (activeTrigger) {
        activeTrigger.setAttribute('aria-expanded', 'false');
      }

      activeTrigger = null;
      activeChip = null;
      menu.classList.remove('gp-status-menu--open');
      menu.hidden = true;
      menu.setAttribute('aria-hidden', 'true');
    };

    const isStatusMenuOpen = () => menu.classList.contains('gp-status-menu--open');

    const openStatusMenu = (trigger) => {
      const chip = trigger?.closest('.gp-filter-chip');
      if (!chip || trigger.disabled || chip.closest('.gp-task-row--departing')) return;

      if (activeTrigger === trigger && isStatusMenuOpen()) {
        closeStatusMenu();
        return;
      }

      if (activeTrigger) {
        activeTrigger.setAttribute('aria-expanded', 'false');
      }

      activeTrigger = trigger;
      activeChip = chip;
      const currentStatus = chip.dataset.status || 'planned';

      menu.querySelectorAll('.gp-status-menu-item').forEach((item) => {
        const selected = item.dataset.status === currentStatus;
        item.setAttribute('aria-checked', selected ? 'true' : 'false');
      });

      menu.hidden = false;
      menu.setAttribute('aria-hidden', 'false');
      menu.classList.add('gp-status-menu--open');
      trigger.setAttribute('aria-expanded', 'true');

      requestAnimationFrame(() => {
        positionStatusMenu(trigger, menu, panel);
      });
    };

    menu.addEventListener('pointerdown', (event) => {
      const item = event.target.closest('.gp-status-menu-item');
      if (!item || !activeChip) return;

      event.preventDefault();
      event.stopPropagation();

      const chip = activeChip;
      const statusKey = item.dataset.status;
      closeStatusMenu();
      applyTaskStatus(chip, statusKey);
    });

    accordion.addEventListener('click', (event) => {
      const trigger = event.target.closest('.gp-filter-chip-menu-btn');
      if (!trigger || !accordion.contains(trigger)) return;

      event.preventDefault();
      event.stopPropagation();
      openStatusMenu(trigger);
    });

    panel.addEventListener('click', (event) => {
      if (!isStatusMenuOpen()) return;
      if (menu.contains(event.target) || event.target.closest('.gp-filter-chip-menu-btn')) return;
      closeStatusMenu();
    });

    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeStatusMenu();
      }
    });

    window.addEventListener('resize', () => {
      if (!activeTrigger || !isStatusMenuOpen()) return;
      positionStatusMenu(activeTrigger, menu, panel);
    });

    scrollContainer.addEventListener(
      'scroll',
      () => {
        if (!activeTrigger || !isStatusMenuOpen()) return;
        positionStatusMenu(activeTrigger, menu, panel);
      },
      { passive: true }
    );

    closeTaskStatusMenu = closeStatusMenu;
  }

  function getFolderTaskCount(folder) {
    const inner = folder?.querySelector('.gp-task-folder-panel-inner');
    if (!inner) return 0;

    return inner.querySelectorAll('.gp-task-row:not(.gp-task-row--departing)').length;
  }

  function syncFolderCount(folder) {
    const label = folder?.querySelector('.gp-task-folder-label');
    const folderKey = folder?.dataset.folder;
    const title = FOLDER_LABELS[folderKey];
    if (!label || !title) return;

    label.textContent = `${title} (${getFolderTaskCount(folder)})`;
    syncFolderEmptyState(folder);
  }

  function syncFolderEmptyState(folder) {
    const inner = folder?.querySelector('.gp-task-folder-panel-inner');
    if (!inner) return;

    const shouldShow = folder.classList.contains('open') && getFolderTaskCount(folder) === 0;
    let emptyState = inner.querySelector('.gp-task-folder-empty');

    if (!shouldShow) {
      emptyState?.remove();
      return;
    }

    if (!emptyState) {
      emptyState = document.createElement('p');
      emptyState.className = 'gp-task-folder-empty';
      emptyState.textContent = 'All Done!';
      inner.appendChild(emptyState);
    }
  }

  function syncFolderCounts(root) {
    if (!root) return;

    root.querySelectorAll('.gp-task-folder').forEach((folder) => {
      syncFolderCount(folder);
    });
  }

  function setCheckboxCheckedVisual(checkbox) {
    const icon = checkbox.querySelector('.gp-task-checkbox-icon');
    if (!icon) return;

    icon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="currentColor" stroke="currentColor" stroke-width="2"></circle>
      <path d="M8 12.25l2.25 2.25L16 8.75" stroke="var(--m3-on-primary, #ffffff)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>`;
    checkbox.classList.add('gp-task-checkbox--checked');
  }

  function getConfettiColors(panel) {
    const styles = getComputedStyle(panel);
    return [
      styles.getPropertyValue('--m3-primary').trim(),
      styles.getPropertyValue('--m3-on-course-psych-container').trim(),
      styles.getPropertyValue('--m3-on-course-cogs-container').trim(),
      styles.getPropertyValue('--m3-on-secondary-container').trim(),
      styles.getPropertyValue('--m3-chip-progress-outline').trim(),
      styles.getPropertyValue('--m3-chip-planned-outline').trim(),
    ].filter(Boolean);
  }

  function spawnConfetti(panel, x, y) {
    const burst = document.createElement('div');
    burst.className = 'gp-confetti-burst';
    burst.style.left = `${x}px`;
    burst.style.top = `${y}px`;

    const colors = getConfettiColors(panel);
    for (let i = 0; i < 26; i += 1) {
      const piece = document.createElement('span');
      piece.className = 'gp-confetti-piece';
      piece.style.setProperty('--gp-confetti-x', `${(Math.random() - 0.5) * 160}px`);
      piece.style.setProperty('--gp-confetti-y', `${-48 - Math.random() * 140}px`);
      piece.style.setProperty('--gp-confetti-rotation', `${Math.random() * 720 - 360}deg`);
      piece.style.background = colors[i % colors.length] || 'currentColor';
      piece.style.animationDelay = `${Math.random() * 140}ms`;
      burst.appendChild(piece);
    }

    panel.appendChild(burst);
    window.setTimeout(() => {
      burst.remove();
    }, TASK_COMPLETE_ANIM_MS + 500);
  }

  function ensureFlyLayer(panel) {
    let layer = panel.querySelector('.gp-fly-layer');
    if (layer) return layer;

    layer = document.createElement('div');
    layer.className = 'gp-fly-layer';
    layer.setAttribute('aria-hidden', 'true');
    panel.appendChild(layer);
    return layer;
  }

  function setFlyingRowPosition(row, x, y, scale, opacity) {
    row.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    row.style.opacity = String(opacity);
  }

  function completeTask(checkbox) {
    const row = checkbox.closest('.gp-task-row');
    const sourceFolder = row?.closest('.gp-task-folder');
    const accordion = row?.closest('#gp-tasks-accordion');
    const completedFolder = accordion?.querySelector('[data-folder="completed"]');
    const panel = row?.closest('#gp-panel');

    if (!row || !sourceFolder || !completedFolder || !panel || sourceFolder === completedFolder) {
      return;
    }

    if (row.dataset.completing === 'true' || checkbox.disabled) {
      return;
    }

    row.dataset.completing = 'true';
    checkbox.disabled = true;
    setCheckboxCheckedVisual(checkbox);

    const statusChip = row.querySelector('.gp-filter-chip');
    if (statusChip) {
      applyTaskStatus(statusChip, 'done', { skipComplete: true });
    }

    if (closeTaskStatusMenu) {
      closeTaskStatusMenu();
    }

    const rowRect = row.getBoundingClientRect();
    const targetRect = completedFolder.querySelector('.gp-task-folder-header')?.getBoundingClientRect();
    if (!targetRect) {
      row.dataset.completing = 'false';
      checkbox.disabled = false;
      return;
    }

    const flyLayer = ensureFlyLayer(panel);
    const flyingRow = row.cloneNode(true);
    flyingRow.classList.add('gp-task-row--flying');
    flyingRow.classList.remove('gp-task-row--departing', 'gp-task-row--completed');
    flyingRow.style.width = `${rowRect.width}px`;
    flyingRow.querySelectorAll('button').forEach((button) => {
      button.disabled = true;
    });
    flyLayer.appendChild(flyingRow);

    const startX = rowRect.left;
    const startY = rowRect.top;
    const endX = targetRect.left + targetRect.width / 2 - rowRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2 - rowRect.height / 2;

    setFlyingRowPosition(flyingRow, startX, startY, 1, 1);
    row.classList.add('gp-task-row--departing');
    syncFolderCounts(accordion);
    completedFolder.classList.add('gp-task-folder--receiving');

    const checkboxRect = checkbox.getBoundingClientRect();
    spawnConfetti(
      panel,
      checkboxRect.left + checkboxRect.width / 2,
      checkboxRect.top + checkboxRect.height / 2,
    );

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlyingRowPosition(flyingRow, endX, endY, 0.55, 0.2);
      });
    });

    const finishCompletion = () => {
      flyingRow.remove();
      row.classList.remove('gp-task-row--departing');
      row.classList.add('gp-task-row--completed');
      row.dataset.completing = 'false';

      const completedInner = completedFolder.querySelector('.gp-task-folder-panel-inner');
      if (completedInner) {
        completedInner.prepend(row);
      }

      syncFolderCounts(accordion);

      completedFolder.classList.add('open');
      const completedToggle = completedFolder.querySelector('.gp-task-folder-toggle');
      if (completedToggle) {
        completedToggle.setAttribute('aria-expanded', 'true');
      }

      completedFolder.classList.remove('gp-task-folder--receiving');
      checkbox.disabled = false;
    };

    let finished = false;
    const onFinish = () => {
      if (finished) return;
      finished = true;
      finishCompletion();
    };

    flyingRow.addEventListener('transitionend', onFinish, { once: true });
    window.setTimeout(onFinish, TASK_COMPLETE_ANIM_MS + 120);
  }

  function initTaskCompletion(root) {
    if (!root || root.dataset.completionWired === 'true') return;
    root.dataset.completionWired = 'true';

    root.addEventListener('click', (event) => {
      const checkbox = event.target.closest('.gp-task-checkbox');
      if (!checkbox || !root.contains(checkbox)) return;

      const row = checkbox.closest('.gp-task-row');
      const folder = row?.closest('.gp-task-folder');
      if (!row || folder?.dataset.folder === 'completed') return;

      event.preventDefault();
      completeTask(checkbox);
    });
  }

  function createDefaultKanbanCard(id, chip) {
    return {
      id,
      title: 'Project Outline',
      due: 'Due Thurs, May 21',
      chip,
      chipColor: KANBAN_CHIP_COLORS[chip] || 'blue',
      starred: false,
    };
  }

  function resolveKanbanChipColor(chip, chipColor, legacyCourseKey) {
    if (chipColor && ['blue', 'red', 'green', 'yellow'].includes(chipColor)) {
      return chipColor;
    }

    return KANBAN_CHIP_COLORS[chip]
      || KANBAN_LEGACY_CHIP_COLORS[legacyCourseKey]
      || 'blue';
  }

  function normalizeKanbanCard(card, fallbackId) {
    const chip = card?.chip || card?.course || 'PSYC101';

    return {
      id: card?.id || fallbackId,
      title: card?.title || 'Project Outline',
      due: card?.due || 'Due Thurs, May 21',
      chip,
      chipColor: resolveKanbanChipColor(chip, card?.chipColor, card?.courseKey),
      starred: Boolean(card?.starred),
    };
  }

  function getDefaultKanbanState() {
    return {
      columns: {
        todo: [
          createDefaultKanbanCard('todo-1', 'PSYC101'),
          createDefaultKanbanCard('todo-2', 'PS'),
          createDefaultKanbanCard('todo-3', 'MGT103'),
          createDefaultKanbanCard('todo-4', 'MGT103'),
        ],
        progress: [
          createDefaultKanbanCard('progress-1', 'MGT103'),
          createDefaultKanbanCard('progress-2', 'COGS14B'),
          createDefaultKanbanCard('progress-3', 'PSYC101'),
          createDefaultKanbanCard('progress-4', 'PS'),
          createDefaultKanbanCard('progress-5', 'PS'),
        ],
        done: [
          createDefaultKanbanCard('done-1', 'PSYC101'),
          createDefaultKanbanCard('done-2', 'COGS14B'),
          createDefaultKanbanCard('done-3', 'COGS14B'),
        ],
      },
      filters: {
        starredOnly: false,
        activeList: 'all',
      },
    };
  }

  function normalizeKanbanFilters(filters) {
    const activeList = KANBAN_COLUMN_DEFS.some(({ id }) => id === filters?.activeList) || filters?.activeList === 'all'
      ? (filters?.activeList || 'all')
      : 'all';

    return {
      starredOnly: Boolean(filters?.starredOnly),
      activeList,
    };
  }

  function normalizeKanbanState(state) {
    const defaults = getDefaultKanbanState();
    const columns = {};

    KANBAN_COLUMN_DEFS.forEach(({ id }) => {
      const savedCards = Array.isArray(state?.columns?.[id]) ? state.columns[id] : null;
      columns[id] = savedCards
        ? savedCards.map((card, index) => normalizeKanbanCard(card, `${id}-${index + 1}`))
        : defaults.columns[id];
    });

    return {
      columns,
      filters: normalizeKanbanFilters(state?.filters || defaults.filters),
    };
  }

  function readSidebarStorage(keys) {
    return new Promise((resolve) => {
      if (!chrome?.storage?.local) {
        resolve({});
        return;
      }

      chrome.storage.local.get(keys, (result) => {
        resolve(result || {});
      });
    });
  }

  function writeSidebarStorage(data) {
    return new Promise((resolve) => {
      if (!chrome?.storage?.local) {
        resolve();
        return;
      }

      chrome.storage.local.set(data, () => {
        resolve();
      });
    });
  }

  async function loadKanbanState() {
    const stored = await readSidebarStorage([KANBAN_STORAGE_KEY]);
    kanbanStateCache = normalizeKanbanState(stored[KANBAN_STORAGE_KEY]);
    return kanbanStateCache;
  }

  async function saveKanbanState(state) {
    kanbanStateCache = normalizeKanbanState(state);
    await writeSidebarStorage({
      [KANBAN_STORAGE_KEY]: kanbanStateCache,
    });
    return kanbanStateCache;
  }

  function renderCard(task) {
    const card = document.createElement('div');
    card.className = 'mk-card';
    card.draggable = false;
    card.dataset.cardId = task.id;
    card.dataset.chipColor = task.chipColor || resolveKanbanChipColor(task.chip, task.chipColor, task.courseKey);
    card.dataset.starred = task.starred ? 'true' : 'false';

    const header = document.createElement('div');
    header.className = 'mk-card-header';

    const title = document.createElement('span');
    title.className = 'mk-card-title';
    title.textContent = task.title;

    const starBtn = document.createElement('button');
    starBtn.type = 'button';
    starBtn.className = 'mk-star-btn';
    starBtn.draggable = false;
    starBtn.setAttribute('aria-label', 'Star task');
    starBtn.setAttribute('aria-pressed', task.starred ? 'true' : 'false');
    starBtn.textContent = task.starred ? '★' : '☆';
    starBtn.classList.toggle('is-starred', Boolean(task.starred));

    header.appendChild(title);
    header.appendChild(starBtn);

    const due = document.createElement('span');
    due.className = 'mk-card-due';
    due.textContent = task.due;

    const footer = document.createElement('div');
    footer.className = 'mk-card-footer';

    const chip = document.createElement('span');
    chip.className = `mk-chip mk-chip--${card.dataset.chipColor}`;
    chip.textContent = task.chip;

    footer.appendChild(chip);
    card.appendChild(header);
    card.appendChild(due);
    card.appendChild(footer);

    return card;
  }

  function serializeKanbanBoard(board) {
    const columns = {};

    KANBAN_COLUMN_DEFS.forEach(({ id }) => {
      const container = board.querySelector(`.mk-column-cards[data-column-id="${id}"]`);
      columns[id] = container
        ? [...container.querySelectorAll('.mk-card:not(.is-dragging)')].map((cardEl) => ({
            id: cardEl.dataset.cardId,
            title: cardEl.querySelector('.mk-card-title')?.textContent || 'Project Outline',
            due: cardEl.querySelector('.mk-card-due')?.textContent || 'Due Thurs, May 21',
            chip: cardEl.querySelector('.mk-chip')?.textContent || 'PSYC101',
            chipColor: cardEl.dataset.chipColor || 'blue',
            starred: cardEl.dataset.starred === 'true',
          }))
        : [];
    });

    return { columns };
  }

  function getVisibleKanbanColumns(state) {
    if (state.filters.activeList === 'all') {
      return KANBAN_COLUMN_DEFS;
    }

    return KANBAN_COLUMN_DEFS.filter(({ id }) => id === state.filters.activeList);
  }

  function getCardsForColumn(state, columnId) {
    const cards = state.columns[columnId] || [];
    if (!state.filters.starredOnly) return cards;
    return cards.filter((card) => card.starred);
  }

  function updateKanbanToolbar(toolbar, state) {
    if (!toolbar) return;

    const showStarred = state.filters.starredOnly;
    const showViewAll = state.filters.activeList !== 'all';
    const hasIndicator = showStarred || showViewAll;

    toolbar.hidden = !hasIndicator;
    toolbar.classList.toggle('is-visible', hasIndicator);

    const starredIndicator = toolbar.querySelector('.mytasks-kanban__filter-indicator--starred');
    const viewAllBtn = toolbar.querySelector('.mytasks-kanban__view-all-btn');

    if (starredIndicator) {
      starredIndicator.hidden = !showStarred;
    }

    if (viewAllBtn) {
      viewAllBtn.hidden = !showViewAll;
    }
  }

  function renderKanbanBoard(root, state) {
    const board = root?.querySelector('.mytasks-kanban__board');
    if (!board) return;

    const visibleColumns = getVisibleKanbanColumns(state);
    board.classList.toggle('mytasks-kanban__board--single-column', state.filters.activeList !== 'all');
    board.innerHTML = '';

    visibleColumns.forEach(({ id, label }) => {
      const column = document.createElement('div');
      column.className = 'mk-column';
      column.dataset.columnId = id;

      const title = document.createElement('h3');
      title.className = 'mk-column-header';
      title.textContent = label;

      const cards = document.createElement('div');
      cards.className = 'mk-column-cards';
      cards.dataset.columnId = id;

      getCardsForColumn(state, id).forEach((card) => {
        cards.appendChild(renderCard(card));
      });

      column.appendChild(title);
      column.appendChild(cards);
      board.appendChild(column);
    });

    updateKanbanToolbar(root.querySelector('.mytasks-kanban__toolbar'), state);
  }

  function createKanbanShell() {
    const root = document.createElement('div');
    root.className = 'mytasks-kanban';

    const toolbar = document.createElement('div');
    toolbar.className = 'mytasks-kanban__toolbar';
    toolbar.hidden = true;
    toolbar.innerHTML = `
      <div class="mytasks-kanban__filter-indicator mytasks-kanban__filter-indicator--starred" hidden>
        <span class="mytasks-kanban__filter-indicator-label">Showing starred tasks only</span>
        <button type="button" class="mytasks-kanban__filter-clear-btn" data-filter-clear="starred" aria-label="Clear starred filter">×</button>
      </div>
      <button type="button" class="mytasks-kanban__view-all-btn" hidden>View all</button>
    `;

    const board = document.createElement('div');
    board.className = 'mytasks-kanban__board';
    board.setAttribute('aria-label', 'Kanban board');

    const modal = document.createElement('div');
    modal.className = 'mytasks-kanban__modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="mytasks-kanban__modal-scrim" data-modal-dismiss="true"></div>
      <div class="mytasks-kanban__modal-dialog" role="dialog" aria-modal="true" aria-labelledby="mytasks-kanban-modal-title">
        <h2 class="mytasks-kanban__modal-title" id="mytasks-kanban-modal-title">Create task</h2>
        <form class="mytasks-kanban__modal-form">
          <label class="mytasks-kanban__field">
            <span class="mytasks-kanban__field-label">Task title</span>
            <input class="mytasks-kanban__field-input" name="title" type="text" required autocomplete="off">
          </label>
          <label class="mytasks-kanban__field">
            <span class="mytasks-kanban__field-label">Due date</span>
            <input class="mytasks-kanban__field-input" name="dueDate" type="date" required>
          </label>
          <label class="mytasks-kanban__field">
            <span class="mytasks-kanban__field-label">Course tag</span>
            <select class="mytasks-kanban__field-input" name="course">
              <option value="PSYC101">PSYC101</option>
              <option value="MGT103">MGT103</option>
              <option value="COGS14B">COGS14B</option>
              <option value="PS">PS</option>
            </select>
          </label>
          <label class="mytasks-kanban__field">
            <span class="mytasks-kanban__field-label">Column</span>
            <select class="mytasks-kanban__field-input" name="column">
              <option value="todo">TO-DO</option>
              <option value="progress">IN PROGRESS</option>
              <option value="done">DONE</option>
            </select>
          </label>
          <div class="mytasks-kanban__modal-actions">
            <button type="button" class="mytasks-kanban__btn mytasks-kanban__btn--text" data-modal-dismiss="true">Cancel</button>
            <button type="submit" class="mytasks-kanban__btn mytasks-kanban__btn--filled">Create</button>
          </div>
        </form>
      </div>
    `;

    root.appendChild(toolbar);
    root.appendChild(board);
    root.appendChild(modal);
    return root;
  }

  function formatKanbanDueLabel(value) {
    if (!value) return 'Due date not set';
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return 'Due date not set';
    return `Due ${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
  }

  function getDefaultCreateColumnId(state) {
    if (state.filters.activeList !== 'all') return state.filters.activeList;
    return 'todo';
  }

  function openCreateTaskModal(root, preferredColumnId) {
    const modal = root.querySelector('.mytasks-kanban__modal');
    const form = modal?.querySelector('.mytasks-kanban__modal-form');
    if (!modal || !form) return;

    const state = kanbanStateCache || getDefaultKanbanState();
    const columnField = form.querySelector('[name="column"]');
    if (columnField) {
      columnField.value = preferredColumnId || getDefaultCreateColumnId(state);
    }

    modal.hidden = false;
    root.classList.add('is-modal-open');
    form.querySelector('[name="title"]')?.focus();
  }

  function closeCreateTaskModal(root) {
    const modal = root.querySelector('.mytasks-kanban__modal');
    const form = modal?.querySelector('.mytasks-kanban__modal-form');
    if (!modal || !form) return;

    form.reset();
    modal.hidden = true;
    root.classList.remove('is-modal-open');
  }

  async function submitCreateTaskModal(root, form) {
    const title = form.querySelector('[name="title"]')?.value.trim();
    const dueDate = form.querySelector('[name="dueDate"]')?.value;
    const course = form.querySelector('[name="course"]')?.value || 'PSYC101';
    const columnId = form.querySelector('[name="column"]')?.value || 'todo';

    if (!title || !dueDate) return;

    const state = await loadKanbanState();
    const card = {
      id: `task-${Date.now()}`,
      title,
      due: formatKanbanDueLabel(dueDate),
      chip: course,
      chipColor: KANBAN_CHIP_COLORS[course] || 'blue',
      starred: false,
    };

    state.columns[columnId] = [...(state.columns[columnId] || []), card];
    await saveKanbanState(state);
    renderKanbanBoard(root, kanbanStateCache);
    const board = root.querySelector('.mytasks-kanban__board');
    board.dataset.dndWired = 'false';
    wireKanbanDragAndDrop(board);
    closeCreateTaskModal(root);
  }

  async function toggleKanbanCardStar(root, cardId) {
    const state = await loadKanbanState();
    let changed = false;

    KANBAN_COLUMN_DEFS.forEach(({ id }) => {
      state.columns[id] = (state.columns[id] || []).map((card) => {
        if (card.id !== cardId) return card;
        changed = true;
        return { ...card, starred: !card.starred };
      });
    });

    if (!changed) return;
    await saveKanbanState(state);
    renderKanbanBoard(root, kanbanStateCache);
    const board = root.querySelector('.mytasks-kanban__board');
    board.dataset.dndWired = 'false';
    wireKanbanDragAndDrop(board);
  }

  function getActiveKanbanRoot() {
    return activeNativeTasksHost?.querySelector(':scope > .mytasks-kanban')
      || document.querySelector('.mytasks-native-tasks-layout > .mytasks-kanban');
  }

  function isStarredNavLabel(label) {
    return /\bstarred\b/i.test(label) && !/\bunstarred\b/i.test(label);
  }

  function isAllTasksNavLabel(label) {
    return /\ball tasks?\b/i.test(label);
  }

  async function setKanbanStarredFilter(root, starredOnly) {
    const state = await loadKanbanState();
    state.filters.starredOnly = Boolean(starredOnly);
    if (starredOnly) {
      state.filters.activeList = 'all';
    }
    await saveKanbanState(state);
    renderKanbanBoard(root, kanbanStateCache);
    const board = root.querySelector('.mytasks-kanban__board');
    board.dataset.dndWired = 'false';
    wireKanbanDragAndDrop(board);
  }

  async function setKanbanActiveList(root, activeList) {
    const state = await loadKanbanState();
    state.filters.activeList = activeList;
    if (activeList === 'all') {
      state.filters.starredOnly = false;
    }
    await saveKanbanState(state);
    renderKanbanBoard(root, kanbanStateCache);
    const board = root.querySelector('.mytasks-kanban__board');
    board.dataset.dndWired = 'false';
    wireKanbanDragAndDrop(board);
  }

  function wireKanbanInteractions(root) {
    if (!root || root.dataset.interactionsWired === 'true') return;
    root.dataset.interactionsWired = 'true';

    root.addEventListener('click', (event) => {
      const starBtn = event.target.closest('.mk-star-btn');
      if (starBtn && root.contains(starBtn)) {
        event.preventDefault();
        event.stopPropagation();
        const card = starBtn.closest('.mk-card');
        if (card?.dataset.cardId) {
          toggleKanbanCardStar(root, card.dataset.cardId);
        }
        return;
      }

      if (event.target.closest('[data-filter-clear="starred"]')) {
        event.preventDefault();
        setKanbanStarredFilter(root, false);
        return;
      }

      if (event.target.closest('.mytasks-kanban__view-all-btn')) {
        event.preventDefault();
        setKanbanActiveList(root, 'all');
        return;
      }

      if (event.target.closest('[data-modal-dismiss="true"]')) {
        event.preventDefault();
        closeCreateTaskModal(root);
      }
    });

    const form = root.querySelector('.mytasks-kanban__modal-form');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      submitCreateTaskModal(root, form);
    });
  }

  async function persistKanbanBoard(board) {
    const nextState = {
      ...(kanbanStateCache || getDefaultKanbanState()),
      columns: serializeKanbanBoard(board).columns,
    };
    await saveKanbanState(nextState);
  }

  function wireKanbanDragAndDrop(board) {
    if (!board || board.dataset.dndWired === 'true') return;
    board.dataset.dndWired = 'true';

    const DRAG_THRESHOLD_PX = 6;

    let draggedCard = null;
    let dragGhost = null;
    let dragClone = null;
    let pendingCard = null;
    let dragActive = false;
    let activePointerId = null;
    let pointerX = 0;
    let pointerY = 0;
    let startX = 0;
    let startY = 0;
    let cloneOffsetX = 0;
    let cloneOffsetY = 0;
    let hoveredColumn = null;
    let activeDropColumn = null;
    let originContainer = null;
    let originNextSibling = null;

    function getColumnCards(container) {
      return [...container.querySelectorAll('.mk-card')];
    }

    function getGhostInsertBefore(container, clientY) {
      const cards = getColumnCards(container);
      for (let index = 0; index < cards.length; index += 1) {
        const card = cards[index];
        const rect = card.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if (midpoint > clientY) {
          return card;
        }
      }
      return null;
    }

    function isGhostInPosition(container, insertBefore) {
      if (!dragGhost || dragGhost.parentElement !== container) return false;
      if (!insertBefore) return dragGhost === container.lastElementChild;
      return dragGhost.nextElementSibling === insertBefore;
    }

    function recordCardTops(scope) {
      const tops = new Map();
      scope.querySelectorAll('.mk-card').forEach((card) => {
        tops.set(card, card.getBoundingClientRect().top);
      });
      return tops;
    }

    function playFlip(scope, beforeTops) {
      const animations = [];
      scope.querySelectorAll('.mk-card').forEach((card) => {
        const firstTop = beforeTops.get(card);
        if (firstTop === undefined) return;
        const lastTop = card.getBoundingClientRect().top;
        const delta = firstTop - lastTop;
        if (Math.abs(delta) < 0.5) return;
        animations.push({ card, delta });
      });

      if (!animations.length) return;

      animations.forEach(({ card, delta }) => {
        card.style.transition = 'none';
        card.style.transform = `translateY(${delta}px)`;
      });

      requestAnimationFrame(() => {
        animations.forEach(({ card }) => {
          card.style.transition = '';
          card.style.transform = '';
        });
      });
    }

    function createDragGhost(height) {
      const ghost = document.createElement('div');
      ghost.className = 'mk-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.height = `${height}px`;
      return ghost;
    }

    function createDragClone(card, rect) {
      const clone = card.cloneNode(true);
      clone.classList.remove('is-dragging', 'is-drop-snap');
      clone.classList.add('mk-drag-clone');
      clone.style.width = `${rect.width}px`;
      clone.style.left = `${rect.left}px`;
      clone.style.top = `${rect.top}px`;
      document.body.appendChild(clone);
      return clone;
    }

    function updateDragClonePosition() {
      if (!dragClone) return;
      dragClone.style.left = `${pointerX - cloneOffsetX}px`;
      dragClone.style.top = `${pointerY - cloneOffsetY}px`;
    }

    function clearDropTargets() {
      board.querySelectorAll('.mk-column-cards.is-drop-target').forEach((column) => {
        column.classList.remove('is-drop-target');
      });
    }

    function placeDragGhost(container, clientY) {
      if (!dragGhost || !container) return;

      const insertBefore = getGhostInsertBefore(container, clientY);
      if (isGhostInPosition(container, insertBefore)) return;

      const beforeTops = recordCardTops(board);
      if (dragGhost.parentElement && dragGhost.parentElement !== container) {
        dragGhost.remove();
      }

      if (insertBefore) {
        container.insertBefore(dragGhost, insertBefore);
      } else {
        container.appendChild(dragGhost);
      }

      playFlip(board, beforeTops);
    }

    function getDropColumnAt(clientX, clientY) {
      const target = document.elementFromPoint(clientX, clientY);
      const container = target?.closest('.mk-column-cards');
      if (container && board.contains(container)) return container;
      if (hoveredColumn && board.contains(hoveredColumn)) return hoveredColumn;
      if (activeDropColumn && board.contains(activeDropColumn)) return activeDropColumn;
      return null;
    }

    function finishDraggedCardSnap() {
      if (!draggedCard) return;
      draggedCard.classList.remove('is-dragging');
      draggedCard.classList.add('is-drop-snap');
      window.setTimeout(() => {
        draggedCard?.classList.remove('is-drop-snap');
      }, 150);
    }

    function resetDragState() {
      draggedCard = null;
      dragGhost = null;
      dragClone = null;
      pendingCard = null;
      dragActive = false;
      activePointerId = null;
      hoveredColumn = null;
      activeDropColumn = null;
      originContainer = null;
      originNextSibling = null;
      document.body.classList.remove('mytasks-kanban-dragging');
    }

    function detachPointerListeners() {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
    }

    function beginDrag(card, event) {
      dragActive = true;
      draggedCard = card;
      pointerX = event.clientX;
      pointerY = event.clientY;

      const rect = card.getBoundingClientRect();
      cloneOffsetX = event.clientX - rect.left + 8;
      cloneOffsetY = event.clientY - rect.top + 8;

      originContainer = card.parentElement;
      originNextSibling = card.nextSibling;

      dragGhost = createDragGhost(rect.height);
      dragClone = createDragClone(card, rect);
      updateDragClonePosition();

      if (!originContainer?.classList.contains('mk-column-cards')) {
        cancelDrag();
        return;
      }

      originContainer.replaceChild(dragGhost, card);
      card.classList.add('is-dragging');

      hoveredColumn = originContainer;
      activeDropColumn = originContainer;
      document.body.classList.add('mytasks-kanban-dragging');
    }

    function commitDrag() {
      if (!draggedCard || !dragGhost?.parentElement) {
        cancelDrag();
        return;
      }

      const beforeTops = recordCardTops(board);
      dragGhost.replaceWith(draggedCard);
      playFlip(board, beforeTops);

      if (dragClone) {
        dragClone.remove();
        dragClone = null;
      }

      clearDropTargets();
      finishDraggedCardSnap();
      persistKanbanBoard(board);
      resetDragState();
    }

    function cancelDrag() {
      const beforeTops = recordCardTops(board);

      if (dragGhost?.parentElement && draggedCard) {
        dragGhost.replaceWith(draggedCard);
      } else if (originContainer && draggedCard) {
        if (originNextSibling && originNextSibling.parentElement === originContainer) {
          originContainer.insertBefore(draggedCard, originNextSibling);
        } else {
          originContainer.appendChild(draggedCard);
        }
      }

      if (draggedCard) {
        draggedCard.classList.remove('is-dragging', 'is-drop-snap');
      }

      if (dragClone) {
        dragClone.remove();
        dragClone = null;
      }

      clearDropTargets();
      playFlip(board, beforeTops);
      resetDragState();
    }

    function clearPointerSelection() {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      selection.removeAllRanges();
    }

    function onPointerMove(event) {
      if (event.pointerId !== activePointerId) return;

      if (!dragActive) {
        if (!pendingCard) return;
        const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
        if (distance < DRAG_THRESHOLD_PX) return;
        event.preventDefault();
        beginDrag(pendingCard, event);
        pendingCard = null;
      } else {
        event.preventDefault();
      }

      clearPointerSelection();

      pointerX = event.clientX;
      pointerY = event.clientY;
      updateDragClonePosition();

      const container = getDropColumnAt(pointerX, pointerY);
      if (!container) {
        clearDropTargets();
        return;
      }

      hoveredColumn = container;
      activeDropColumn = container;
      clearDropTargets();
      container.classList.add('is-drop-target');
      placeDragGhost(container, pointerY);
    }

    function onPointerUp(event) {
      if (event.pointerId !== activePointerId) return;

      detachPointerListeners();

      if (!dragActive) {
        pendingCard = null;
        activePointerId = null;
        document.body.classList.remove('mytasks-kanban-dragging');
        clearPointerSelection();
        return;
      }

      const container = getDropColumnAt(pointerX, pointerY) || activeDropColumn;
      if (container && dragGhost?.parentElement) {
        commitDrag();
      } else {
        cancelDrag();
      }

      activePointerId = null;
    }

    function onPointerDown(event) {
      if (event.button !== 0) return;

      const card = event.target.closest('.mk-card');
      if (!card || !board.contains(card)) return;
      if (event.target.closest('.mk-star-btn')) return;

      pendingCard = card;
      activePointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;

      event.preventDefault();
      clearPointerSelection();
      document.body.classList.add('mytasks-kanban-dragging');

      document.addEventListener('pointermove', onPointerMove, { passive: false });
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
    }

    board.addEventListener('pointerdown', onPointerDown);
  }

  async function loadKanbanBoard(root) {
    const kanbanRoot = root?.classList?.contains('mytasks-kanban')
      ? root
      : root?.closest('.mytasks-kanban');
    if (!kanbanRoot) return;

    const state = await loadKanbanState();
    const board = kanbanRoot.querySelector('.mytasks-kanban__board');
    if (!board) return;

    board.dataset.dndWired = 'false';
    renderKanbanBoard(kanbanRoot, state);
    wireKanbanDragAndDrop(board);
    wireKanbanInteractions(kanbanRoot);
  }

  function getElementLabel(el) {
    if (!el) return '';
    return `${el.getAttribute('aria-label') || ''} ${el.getAttribute('data-tooltip') || ''} ${el.getAttribute('title') || ''}`.trim();
  }

  function isExtensionTasksControl(el) {
    return Boolean(
      el?.closest('#gp-panel, .mytasks-sidebar, #gp-sidebar-btn, #gp-sidebar-rail')
      || /\bmy tasks\b/i.test(getElementLabel(el)),
    );
  }

  function isGoogleTasksRailControl(el) {
    if (!el || isExtensionTasksControl(el) || !isVisibleElement(el)) return false;

    const label = getElementLabel(el);
    if (!/\btasks?\b/i.test(label)) return false;

    const rect = el.getBoundingClientRect();
    return rect.right >= window.innerWidth - 220;
  }

  function isTasksRailControlActive(el) {
    if (!el) return false;

    if (el.getAttribute('aria-pressed') === 'true') return true;
    if (el.getAttribute('aria-selected') === 'true') return true;
    if (el.getAttribute('aria-expanded') === 'true') return true;
    if (el.getAttribute('aria-current') === 'true') return true;

    const selectedAncestor = el.closest('[aria-pressed="true"], [aria-selected="true"], [aria-expanded="true"], [aria-current="true"]');
    return Boolean(selectedAncestor && selectedAncestor.contains(el) && isGoogleTasksRailControl(el));
  }

  function findActiveGoogleTasksRailControl() {
    const controls = [...document.querySelectorAll('button, [role="button"], div[role="button"]')]
      .filter(isGoogleTasksRailControl);

    return controls.find(isTasksRailControlActive) || controls[0] || null;
  }

  function getTasksPanelDescriptor(el) {
    if (!el) return '';

    const pieces = [
      el.getAttribute('aria-label'),
      el.getAttribute('data-tooltip'),
      el.getAttribute('title'),
      el.getAttribute('role'),
    ];
    const heading = el.querySelector('h1, h2, h3, [role="heading"]');
    if (heading) {
      pieces.push(heading.textContent);
    }

    return pieces.filter(Boolean).join(' ').trim();
  }

  function hasTasksPanelSignals(el) {
    if (!el) return false;

    const descriptor = getTasksPanelDescriptor(el);
    if (/\btasks?\b/i.test(descriptor)) return true;

    if (el.querySelector('iframe[src*="tasks.google"], iframe[src*="tasks"]')) return true;

    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (/\badd a task\b/i.test(text)) return true;
    if (/\bcreate (a )?task\b/i.test(text)) return true;
    if (/\bmy lists?\b/i.test(text)) return true;

    return [...el.querySelectorAll('h1, h2, h3, [role="heading"], [role="tab"], button, [role="button"]')]
      .some((node) => /^\s*tasks?\s*$/i.test((node.textContent || '').trim()));
  }

  function isTasksSurfaceVisible(el) {
    if (!el || !isVisibleElement(el)) return false;
    if (el.closest('#gp-panel, .mytasks-sidebar')) return false;

    const calendarMain = getCalendarMainEl();
    if (calendarMain && (el === calendarMain || el.contains(calendarMain))) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width < 180 || rect.height < 120) return false;

    const onRightSide = rect.left >= window.innerWidth * 0.45 && rect.right >= window.innerWidth - 56;
    const hasTaskIframe = Boolean(el.querySelector('iframe[src*="tasks.google"], iframe[src*="tasks"]'));

    return onRightSide || hasTaskIframe;
  }

  function scoreTasksPanelCandidate(el, railActive) {
    if (!isTasksSurfaceVisible(el)) return -1;

    const hasSignals = hasTasksPanelSignals(el);
    if (!hasSignals && !railActive) return -1;

    const rect = el.getBoundingClientRect();
    let score = rect.width * rect.height;

    if (hasSignals) score += 200_000;
    if (el.querySelector('iframe[src*="tasks.google"], iframe[src*="tasks"]')) score += 1_000_000;
    if (/\btasks?\b/i.test(getTasksPanelDescriptor(el))) score += 50_000;
    if (rect.right >= window.innerWidth - 24) score += 10_000;
    if (railActive) score += 25_000;

    return score;
  }

  function pickBestTasksPanel(candidates, railActive) {
    let best = null;
    let bestScore = -1;

    candidates.forEach((candidate) => {
      const score = scoreTasksPanelCandidate(candidate, railActive);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    });

    return best;
  }

  function findTasksPanelFromRailControl(control, railActive) {
    if (!control) return null;

    const candidates = new Set();
    let ancestor = control.parentElement;

    for (let depth = 0; depth < 14 && ancestor; depth += 1) {
      if (isTasksSurfaceVisible(ancestor) && (hasTasksPanelSignals(ancestor) || railActive)) {
        candidates.add(ancestor);
      }

      ancestor.querySelectorAll('[role="complementary"], aside, div[data-ved], iframe[src*="tasks.google"], iframe[src*="tasks"]').forEach((node) => {
        const panel = node.matches('iframe')
          ? node.parentElement
          : node;

        if (panel && isTasksSurfaceVisible(panel) && (hasTasksPanelSignals(panel) || railActive)) {
          candidates.add(panel);
        }
      });

      ancestor = ancestor.parentElement;
    }

    return pickBestTasksPanel(candidates, railActive);
  }

  function findVisibleGoogleTasksPanel() {
    const candidates = new Set();
    const activeControl = findActiveGoogleTasksRailControl();
    const railActive = Boolean(activeControl && isTasksRailControlActive(activeControl));

    document.querySelectorAll('iframe[src*="tasks.google"], iframe[src*="tasks"]').forEach((iframe) => {
      if (!isVisibleElement(iframe)) return;

      let host = iframe.parentElement;
      for (let depth = 0; depth < 8 && host; depth += 1) {
        if (isTasksSurfaceVisible(host)) {
          candidates.add(host);
          break;
        }
        host = host.parentElement;
      }
    });

    document.querySelectorAll('[role="complementary"], aside, div[data-ved]').forEach((el) => {
      if (!isTasksSurfaceVisible(el) || !hasTasksPanelSignals(el)) return;
      candidates.add(el);
    });

    const panelFromRail = findTasksPanelFromRailControl(activeControl, railActive);
    if (panelFromRail) {
      candidates.add(panelFromRail);
    }

    return pickBestTasksPanel(candidates, railActive);
  }

  function findNativeTasksIframe(scope) {
    if (!scope) return null;
    return scope.querySelector('iframe[src*="tasks.google"], iframe[src*="tasks"]');
  }

  function isNativeTasksManagedElement(el) {
    if (!(el instanceof Element)) return false;
    return Boolean(
      el.closest('.mytasks-kanban, .mytasks-native-tasks-nav, .mytasks-native-tasks-layout, #gp-panel, .mytasks-sidebar'),
    );
  }

  function shouldScheduleNativeTasksKanbanSync(mutations) {
    return mutations.some((mutation) => {
      if (isNativeTasksManagedElement(mutation.target)) return false;

      if (mutation.type === 'attributes'
        && mutation.target instanceof Element
        && mutation.target.hasAttribute('data-mytasks-native-hidden')) {
        return false;
      }

      if (mutation.type === 'childList') {
        const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
        if (changedNodes.some((node) => isNativeTasksManagedElement(node))) return false;
      }

      return true;
    });
  }

  function isNativeTasksLayoutStable(host) {
    if (!host?.classList.contains('mytasks-native-tasks-layout')) return false;

    const navShell = host.querySelector(':scope > .mytasks-native-tasks-nav');
    const iframe = navShell ? findNativeTasksIframe(navShell) : null;
    const board = host.querySelector(':scope > .mytasks-kanban .mytasks-kanban__board');

    return Boolean(navShell && iframe && board);
  }

  function ensureNativeTasksLayout(host) {
    if (!host) return;
    host.classList.add('mytasks-native-tasks-layout');
  }

  function restoreNativeTasksIframe(scope) {
    if (!scope) return;

    scope.querySelectorAll('iframe[src*="tasks.google"], iframe[src*="tasks"]').forEach((iframe) => {
      iframe.removeAttribute('data-mytasks-hidden-native');
      iframe.style.removeProperty('display');
    });
  }

  function ensureNativeTasksNavShell(host) {
    if (!host) return null;

    let navShell = host.querySelector(':scope > .mytasks-native-tasks-nav');
    const iframe = findNativeTasksIframe(host);

    if (!iframe) {
      return navShell;
    }

    if (!navShell) {
      navShell = document.createElement('div');
      navShell.className = 'mytasks-native-tasks-nav';

      const kanban = host.querySelector(':scope > .mytasks-kanban');
      if (kanban) {
        host.insertBefore(navShell, kanban);
      } else {
        host.prepend(navShell);
      }
    }

    if (iframe.parentElement !== navShell) {
      navShell.appendChild(iframe);
    }

    restoreNativeTasksIframe(navShell);
    return navShell;
  }

  function findTasksInjectHost(panel) {
    if (!panel) return null;

    const existingLayout = panel.querySelector('.mytasks-native-tasks-layout');
    if (existingLayout) return existingLayout;

    const iframe = findNativeTasksIframe(panel);
    if (iframe) {
      let host = iframe.parentElement;
      while (host && host !== panel) {
        if (host.classList.contains('mytasks-native-tasks-nav') || host.classList.contains('mytasks-kanban')) {
          host = host.parentElement;
          continue;
        }
        break;
      }

      if (host) return host;
    }

    const explicit = panel.querySelector('[role="main"], [role="region"][aria-label*="Task" i]');
    if (explicit) return explicit;

    let bestChild = panel;
    let bestScore = panel.clientHeight * panel.clientWidth;

    panel.querySelectorAll('div').forEach((child) => {
      if (child.classList.contains('mytasks-kanban')
        || child.classList.contains('mytasks-native-tasks-nav')
        || child.classList.contains('mytasks-native-tasks-layout')
        || child.closest('.mytasks-kanban')) return;

      const style = window.getComputedStyle(child);
      const scrollable = style.overflowY === 'auto' || style.overflowY === 'scroll';
      const score = (child.clientHeight * child.clientWidth) + (scrollable ? 10000 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestChild = child;
      }
    });

    return bestChild;
  }

  function restoreNativeTaskListSurfaces(scope) {
    const root = scope || document;
    root.querySelectorAll('[data-mytasks-native-hidden]').forEach((el) => {
      el.removeAttribute('data-mytasks-native-hidden');
      el.style.removeProperty('display');
    });
  }

  function hideNativeTaskListSurfaces(panel, host) {
    if (!host) return;

    const calendarMain = getCalendarMainEl();

    host.querySelectorAll(':scope > *').forEach((child) => {
      if (!(child instanceof Element)) return;
      if (child.classList.contains('mytasks-kanban') || child.classList.contains('mytasks-native-tasks-nav')) return;
      if (calendarMain && (child === calendarMain || child.contains(calendarMain))) return;

      child.setAttribute('data-mytasks-native-hidden', 'true');
      child.style.setProperty('display', 'none', 'important');
    });

    if (!panel || !panel.contains(host)) return;

    panel.querySelectorAll('iframe[src*="tasks.google"], iframe[src*="tasks"]').forEach((iframe) => {
      if (host.contains(iframe)) return;
      iframe.setAttribute('data-mytasks-native-hidden', 'true');
      iframe.style.setProperty('display', 'none', 'important');
    });
  }

  function syncKanbanHostSize(host) {
    const kanban = host?.querySelector(':scope > .mytasks-kanban');
    if (!host || !kanban) return;

    const rect = host.getBoundingClientRect();
    if (!rect.height) return;

    kanban.style.height = `${rect.height}px`;
    kanban.style.minHeight = `${rect.height}px`;
  }

  function observeNativeTasksHost(host) {
    if (!host || nativeTasksResizeObserver) return;

    nativeTasksResizeObserver = new ResizeObserver(() => {
      syncKanbanHostSize(host);
    });
    nativeTasksResizeObserver.observe(host);
    syncKanbanHostSize(host);
  }

  function setupKanbanStorageListener() {
    if (kanbanStorageListenerWired || !chrome?.storage?.onChanged) return;
    kanbanStorageListenerWired = true;

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[KANBAN_STORAGE_KEY]) return;

      kanbanStateCache = normalizeKanbanState(changes[KANBAN_STORAGE_KEY].newValue);
      const root = activeNativeTasksHost?.querySelector(':scope > .mytasks-kanban')
        || document.querySelector('.mytasks-native-tasks-layout > .mytasks-kanban');
      if (!root || root.querySelector('.mk-card.is-dragging')) return;

      renderKanbanBoard(root, kanbanStateCache);
      const board = root.querySelector('.mytasks-kanban__board');
      if (!board) return;
      board.dataset.dndWired = 'false';
      wireKanbanDragAndDrop(board);
    });
  }

  function handleNativeTasksFrameMessage(event) {
    if (!event?.data || event.data.source !== MYTASKS_MESSAGE_SOURCE) return;
    if (!/\.google\.com$/.test(event.origin || '')) return;

    const root = getActiveKanbanRoot();
    if (!root) return;

    if (event.data.type === 'MYTASKS_NATIVE_CREATE') {
      openCreateTaskModal(root, event.data.columnId);
      return;
    }

    if (event.data.type === 'MYTASKS_NATIVE_STARRED') {
      const starredOnly = event.data.active === undefined ? true : Boolean(event.data.active);
      setKanbanStarredFilter(root, starredOnly);
      return;
    }

    if (event.data.type === 'MYTASKS_NATIVE_LIST') {
      setKanbanActiveList(root, event.data.listId || 'all');
    }
  }

  function setupNativeTasksFrameBridge() {
    window.addEventListener('message', handleNativeTasksFrameMessage);
    setupKanbanStorageListener();
  }

  async function injectKanbanIntoNativeTasksPanel(host) {
    if (!host || host.closest('#gp-panel, .mytasks-sidebar')) return;

    ensureNativeTasksLayout(host);
    ensureNativeTasksNavShell(host);
    hideNativeTaskListSurfaces(findVisibleGoogleTasksPanel(), host);

    const existingRoot = host.querySelector(':scope > .mytasks-kanban');
    if (existingRoot) {
      await loadKanbanBoard(existingRoot);
      observeNativeTasksHost(host);
      activeNativeTasksHost = host;
      return;
    }

    const root = createKanbanShell();
    host.appendChild(root);
    activeNativeTasksHost = host;
    await loadKanbanBoard(root);
    observeNativeTasksHost(host);
  }

  async function syncNativeTasksKanban() {
    if (nativeTasksSyncInFlight) return;

    const panel = findVisibleGoogleTasksPanel();
    if (!panel) {
      activeNativeTasksHost = null;
      restoreNativeTaskListSurfaces(document);
      if (nativeTasksResizeObserver) {
        nativeTasksResizeObserver.disconnect();
        nativeTasksResizeObserver = null;
      }
      return;
    }

    if (activeNativeTasksHost && !activeNativeTasksHost.isConnected) {
      activeNativeTasksHost = null;
    }

    const host = findTasksInjectHost(panel);
    if (!host) return;

    hideNativeTaskListSurfaces(panel, host);

    if (isNativeTasksLayoutStable(host)) {
      ensureNativeTasksNavShell(host);
      syncKanbanHostSize(host);
      activeNativeTasksHost = host;
      return;
    }

    nativeTasksSyncInFlight = true;
    nativeTasksObserver?.disconnect();

    try {
      await injectKanbanIntoNativeTasksPanel(host);
    } catch (error) {
      console.error('My Tasks kanban sync failed.', error);
    } finally {
      nativeTasksSyncInFlight = false;
      nativeTasksObserver?.observe(document.documentElement, nativeTasksObserverConfig);
    }
  }

  const nativeTasksObserverConfig = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'aria-hidden', 'aria-expanded', 'aria-selected', 'aria-pressed', 'aria-current'],
  };

  function scheduleNativeTasksKanbanSync() {
    window.clearTimeout(nativeTasksKanbanDebounce);
    nativeTasksKanbanDebounce = window.setTimeout(() => {
      syncNativeTasksKanban();
    }, 120);
  }

  function setupNativeTasksKanbanObserver() {
    if (nativeTasksObserver) {
      scheduleNativeTasksKanbanSync();
      return;
    }

    nativeTasksObserver = new MutationObserver((mutations) => {
      if (!shouldScheduleNativeTasksKanbanSync(mutations)) return;
      scheduleNativeTasksKanbanSync();
    });

    nativeTasksObserver.observe(document.documentElement, nativeTasksObserverConfig);

    document.addEventListener('click', (event) => {
      const control = event.target.closest('button, [role="button"], div[role="button"]');
      if (!control || !isGoogleTasksRailControl(control)) return;

      scheduleNativeTasksKanbanSync();
      window.setTimeout(scheduleNativeTasksKanbanSync, 250);
    }, true);

    scheduleNativeTasksKanbanSync();
  }

  function isNativeTasksEmbedFrame() {
    return window.location.hostname.includes('tasks.google.com') && window !== window.top;
  }

  function isCalendarTopFrame() {
    return window.location.hostname.includes('calendar.google.com') && window === window.top;
  }

  function initNativeTasksEmbedFrame() {
    if (window.__gpTasksEmbedReady) return;
    window.__gpTasksEmbedReady = true;

    const postToParent = (payload) => {
      window.parent.postMessage({
        source: MYTASKS_MESSAGE_SOURCE,
        ...payload,
      }, '*');
    };

    let lastPostedStarredFilter = null;

    const postStarredFilterState = (active) => {
      if (lastPostedStarredFilter === active) return;
      lastPostedStarredFilter = active;
      postToParent({ type: 'MYTASKS_NATIVE_STARRED', active });
    };

    const getControlLabel = (el) => {
      if (!(el instanceof Element)) return '';
      return `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${el.textContent || ''}`.replace(/\s+/g, ' ').trim();
    };

    const isNavControlSelected = (control) => (
      control.getAttribute('aria-selected') === 'true'
      || control.getAttribute('aria-current') === 'true'
      || control.getAttribute('aria-pressed') === 'true'
    );

    const syncEmbedNavSelection = () => {
      let starredSelected = false;
      let allTasksSelected = false;

      document.querySelectorAll('[data-mytasks-embed-nav="true"]').forEach((control) => {
        if (!isNavControlSelected(control)) return;

        const label = getControlLabel(control);
        if (isStarredNavLabel(label)) {
          starredSelected = true;
          return;
        }

        if (isAllTasksNavLabel(label)) {
          allTasksSelected = true;
        }
      });

      if (starredSelected) {
        postStarredFilterState(true);
        return;
      }

      if (allTasksSelected) {
        postStarredFilterState(false);
      }
    };

    const matchListId = (label) => {
      const matcher = KANBAN_LIST_MATCHERS.find(({ pattern }) => pattern.test(label));
      return matcher?.id || null;
    };

    const hideEmbedTaskPane = () => {
      document.querySelectorAll('[role="main"], main, [role="region"]').forEach((el) => {
        if (!(el instanceof Element)) return;
        if (el.closest('[data-mytasks-embed-nav]')) return;

        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        if (rect.left >= 240 && rect.width > 200) {
          el.setAttribute('data-mytasks-embed-hidden', 'true');
          el.style.setProperty('display', 'none', 'important');
        }
      });

      document.querySelectorAll('button, [role="button"], a, [role="menuitem"], li, [role="listitem"]').forEach((el) => {
        if (!(el instanceof Element)) return;
        const rect = el.getBoundingClientRect();
        if (rect.left < 260) {
          el.setAttribute('data-mytasks-embed-nav', 'true');
        }
      });
    };

    document.addEventListener('click', (event) => {
      const control = event.target.closest('button, [role="button"], a, [role="menuitem"], li, [role="listitem"]');
      if (!control) return;

      const label = getControlLabel(control);
      if (!label) return;

      if (/\b(create|add)\b.{0,24}\b(task|list)\b/i.test(label) || /\bcreate (a )?new (task|list)\b/i.test(label)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        postToParent({ type: 'MYTASKS_NATIVE_CREATE' });
        return;
      }

      if (isAllTasksNavLabel(label)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        postStarredFilterState(false);
        postToParent({ type: 'MYTASKS_NATIVE_LIST', listId: 'all' });
        return;
      }

      if (isStarredNavLabel(label)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        postStarredFilterState(true);
        return;
      }

      const listId = matchListId(label);
      if (listId) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        postToParent({ type: 'MYTASKS_NATIVE_LIST', listId });
      }
    }, true);

    const embedObserver = new MutationObserver(() => {
      hideEmbedTaskPane();
      syncEmbedNavSelection();
    });

    embedObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'aria-hidden', 'class', 'style', 'aria-selected', 'aria-current', 'aria-pressed'],
    });

    hideEmbedTaskPane();
    syncEmbedNavSelection();
  }

  function initTasksAccordion(root) {
    if (!root || root.dataset.wired === 'true') return;
    root.dataset.wired = 'true';

    root.querySelectorAll('.gp-task-folder').forEach((folder) => {
      const toggle = folder.querySelector('.gp-task-folder-toggle');
      if (!toggle) return;

      toggle.addEventListener('click', () => {
        const isOpen = folder.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        syncFolderEmptyState(folder);
      });
    });
  }

  function wireSidebarEvents(panel) {
    const closeBtn = panel.querySelector('#gp-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => closePanel());
    }

    const createTaskBtn = panel.querySelector('#gp-create-task-btn');
    if (createTaskBtn) {
      createTaskBtn.addEventListener('click', () => {
        createTaskBtn.blur();
      });
    }

    initTasksAccordion(panel.querySelector('#gp-tasks-accordion'));
    initTaskStatusMenus(panel);
    initTaskCompletion(panel.querySelector('#gp-tasks-accordion'));
    syncFolderCounts(panel.querySelector('#gp-tasks-accordion'));
  }

  function mountSidebar() {
    let existing = document.getElementById('gp-panel');
    if (existing && existing.querySelector('#gp-view-kanban-btn, #gp-screen-kanban')) {
      existing.remove();
      existing = null;
    }

    if (existing) {
      wireSidebarEvents(existing);
      return existing;
    }

    const template = document.createElement('template');
    template.innerHTML = SIDEBAR_MARKUP;
    const panel = template.content.firstElementChild;
    if (!panel) {
      throw new Error('Sidebar markup is empty.');
    }

    const mountTarget = document.body || document.documentElement;
    mountTarget.appendChild(panel);
    wireSidebarEvents(panel);
    setupCalendarPushObserver();
    return panel;
  }

  function openPanel() {
    const panel = mountSidebar();
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    setCalendarPushed(true);
    requestAnimationFrame(() => setCalendarPushed(true));
    syncRailButtonState();
    return true;
  }

  function closePanel() {
    const panel = document.getElementById('gp-panel');
    if (!panel) return false;

    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    setCalendarPushed(false);
    syncRailButtonState();
    return false;
  }

  function togglePanel() {
    const panel = document.getElementById('gp-panel');
    if (!panel) {
      return openPanel();
    }

    if (panel.classList.contains('open')) {
      return closePanel();
    }

    return openPanel();
  }

  function handleToggleRequest() {
    try {
      return togglePanel();
    } catch (error) {
      console.error('My Tasks sidebar failed to load.', error);
      return false;
    }
  }

  if (isNativeTasksEmbedFrame()) {
    initNativeTasksEmbedFrame();
    return;
  }

  if (!isCalendarTopFrame()) {
    return;
  }

  if (window.__gpTasksSidebarReady) {
    return;
  }
  window.__gpTasksSidebarReady = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'PING_SIDEBAR') {
      sendResponse({ ready: true });
      return true;
    }

    if (message?.type !== 'TOGGLE_SIDEBAR') {
      return false;
    }

    sendResponse({ open: handleToggleRequest() });
    return true;
  });

  setupNativeTasksFrameBridge();
  mountSidebar();
  setupRailObserver();
  setupNativeTasksKanbanObserver();
})();
