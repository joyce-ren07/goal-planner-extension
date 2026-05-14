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
          <span class="gp-task-folder-label">Due Today (3)</span>
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

      <section class="gp-task-folder" data-folder="tomorrow">
        <div class="gp-task-folder-header">
          <button class="gp-task-folder-toggle" type="button" aria-expanded="false" aria-label="Toggle Due Tomorrow tasks">
            <svg class="gp-task-folder-chevron" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 6 15 12 9 18"></polyline>
            </svg>
          </button>
          <span class="gp-task-folder-label">Due Tomorrow (1)</span>
        </div>
        <div class="gp-task-folder-panel">
          <div class="gp-task-folder-panel-inner"></div>
        </div>
      </section>

      <section class="gp-task-folder" data-folder="later">
        <div class="gp-task-folder-header">
          <button class="gp-task-folder-toggle" type="button" aria-expanded="false" aria-label="Toggle Due Later tasks">
            <svg class="gp-task-folder-chevron" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 6 15 12 9 18"></polyline>
            </svg>
          </button>
          <span class="gp-task-folder-label">Due Later (2)</span>
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
          <span class="gp-task-folder-label">Completed (15)</span>
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

    const candidates = [
      document.querySelector('[role="main"]'),
      document.querySelector('main'),
    ].filter(Boolean);

    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.width >= 280 && rect.height >= 200) {
        cachedCalendarMainEl = el;
        return el;
      }
    }

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

    adjustFolderCount(completedFolder, -1);
    adjustFolderCount(targetFolder, 1);

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

  function adjustFolderCount(folder, delta) {
    const label = folder?.querySelector('.gp-task-folder-label');
    if (!label) return;

    const match = label.textContent.match(/^(.*)\((\d+)\)\s*$/);
    if (!match) return;

    const next = Math.max(0, Number(match[2]) + delta);
    label.textContent = `${match[1].trim()} (${next})`;
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

      adjustFolderCount(sourceFolder, -1);
      adjustFolderCount(completedFolder, 1);

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

  function initTasksAccordion(root) {
    if (!root || root.dataset.wired === 'true') return;
    root.dataset.wired = 'true';

    root.querySelectorAll('.gp-task-folder').forEach((folder) => {
      const toggle = folder.querySelector('.gp-task-folder-toggle');
      if (!toggle) return;

      toggle.addEventListener('click', () => {
        const isOpen = folder.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
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
  }

  function mountSidebar() {
    const existing = document.getElementById('gp-panel');
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

  mountSidebar();
  setupRailObserver();
})();
