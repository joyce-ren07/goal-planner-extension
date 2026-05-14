// Goal Planner v3 — content.js
// Screens: empty → goal name + schedule → recurrence overlay → suggested sessions

(function () {
  'use strict';

  const GP_PANEL_W = 320;
  // Match the panel's CSS transition so calendar push and panel slide stay in sync
  const GP_PUSH_EASING = '0.3s cubic-bezier(0.4,0,0.2,1)';

  /** Height of the GCal top nav bar — derived from live DOM, falls back to 65px. */
  function getGCalHeaderBottom() {
    const main = document.querySelector('[role="main"]');
    if (main) {
      const t = Math.round(main.getBoundingClientRect().top);
      if (t >= 40 && t <= 140) return t;
    }
    const banner = document.querySelector('[role="banner"]');
    if (banner) {
      const b = Math.round(banner.getBoundingClientRect().bottom);
      if (b >= 40 && b <= 140) return b;
    }
    return 65;
  }

  /** Width of the GCal right icon rail — derived from live DOM, falls back to 56px. */
  function getGCalRailWidth() {
    const rail = findRailByStructure();
    if (rail) {
      const w = Math.round(rail.getBoundingClientRect().width);
      if (w > 20 && w < 120) return w;
    }
    return 56;
  }

  // ── State ──
  let state = {
    goalTitle: '',
    recurrence: null,   // { every: 1, period: 'week', days: ['MO','WE','FR'], time: '21:00', sessionMins: 60, ends: 'on', endDate: '', occurrences: 13 }
    suggestions: [],    // [{ date, startTime, endTime, isoStart, isoEnd }]
    editingGoalId: null, // null = create mode, string = editing existing goal by id
  };
  let pendingDeleteId = null;
  let ctxMenuGoalId = null;

  // ── Inject once ──
  function inject() {
    if (document.getElementById('gp-panel')) return;
    const btn = createRailBtn();
    const panel = createPanel();
    const modal = createRecurrenceModal();
    const deleteModal = createDeleteModal();
    const ctxMenu = createCtxMenu();
    const stdTimeDd = document.createElement('div');
    stdTimeDd.id = 'gp-std-time-dd';
    stdTimeDd.className = 'gp-time-dropdown';
    document.body.appendChild(panel);
    document.body.appendChild(modal);
    document.body.appendChild(deleteModal);
    document.body.appendChild(ctxMenu);
    document.body.appendChild(stdTimeDd);
    migrateGoals();

    // Try immediate insertion at the TOP of GCal's icon strip.
    // If the strip hasn't rendered yet, fall back to a fixed wrapper so the button
    // is always visible. The MutationObserver will move it into the real strip once
    // GCal renders it, and will re-insert on every subsequent navigation.
    if (!insertRailBtn(btn)) {
      const wrap = document.createElement('div');
      wrap.id = 'gp-rail-fallback';
      wrap.style.cssText = 'position:fixed;right:8px;top:120px;z-index:999;display:flex;flex-direction:column;gap:8px;align-items:center;';
      wrap.appendChild(btn);
      document.body.appendChild(wrap);
    }
    setupRailBtnObserver(btn);

    wireEvents();
    renderHomeScreen();
    setupCalendarPushObserver();
    setupNativeSidebarObserver();
  }

  /** Main calendar region that natively shrinks when Tasks/Notes opens — push layout, not overlay. */
  let cachedCalendarMainEl = null;
  function getCalendarMainEl() {
    if (cachedCalendarMainEl && document.contains(cachedCalendarMainEl)) return cachedCalendarMainEl;

    // GCal toolbar is ~60px tall. We only want the grid area BELOW it, not any
    // wrapper that also contains the toolbar.  Qualifying element must:
    //   • start at or below the toolbar (top >= 50px)
    //   • span most of the viewport width
    //   • be tall enough to contain the day/time grid
    const isGridEl = (el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 50 && r.width >= window.innerWidth * 0.5 && r.height >= 300 && r.left < 200;
    };

    // Ordered list — GCal-specific grid selectors first, generic fallbacks last.
    const selectors = [
      '.FtZfle',           // GCal scrollable time-grid container (below toolbar)
      '.M7Vc1b',           // GCal week/day view grid wrapper
      '.ZCaJde',           // GCal calendar content area
      '.rbBFqb',           // GCal main calendar body (below nav)
      '[data-viewfamily]', // GCal view family wrapper
      '.KF4T6b',           // known GCal grid class
      '.k6Zj8d',
      '.h5v6H',
      '[role="main"]',
      'main',
    ];

    for (const sel of selectors) {
      const els = [...document.querySelectorAll(sel)];
      for (const el of els) {
        if (isGridEl(el)) {
          cachedCalendarMainEl = el;
          return el;
        }
      }
    }

    // Last-resort: find the widest element that passes the grid test and isn't our panel
    const fallback = [...document.querySelectorAll('div')].reduce((best, el) => {
      if (el.id === 'gp-panel') return best;
      if (!isGridEl(el)) return best;
      return (!best || el.getBoundingClientRect().width > best.getBoundingClientRect().width) ? el : best;
    }, null);

    cachedCalendarMainEl = fallback;
    return cachedCalendarMainEl;
  }

  function setCalendarPushed(open) {
    const mainEl = getCalendarMainEl();
    if (!mainEl) return;
    mainEl.style.transition = `margin-right ${GP_PUSH_EASING}`;
    mainEl.style.marginRight = open ? `${GP_PANEL_W}px` : '';
  }

  let calendarPushDebounce = null;
  function setupCalendarPushObserver() {
    const reapply = () => {
      const panel = document.getElementById('gp-panel');
      if (panel && panel.classList.contains('open')) setCalendarPushed(true);
    };
    const scheduleReapply = () => {
      if (calendarPushDebounce) clearTimeout(calendarPushDebounce);
      calendarPushDebounce = setTimeout(() => {
        calendarPushDebounce = null;
        if (cachedCalendarMainEl && !document.contains(cachedCalendarMainEl)) cachedCalendarMainEl = null;
        reapply();
      }, 120);
    };
    const mo = new MutationObserver(scheduleReapply);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', reapply);
  }

  function findRailByStructure() {
    // Narrow fixed/sticky strip on the far right with ≥1 child — same heuristic as before.
    return [...document.querySelectorAll('*')].find(el => {
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (s.position === 'fixed' || s.position === 'sticky')
        && r.right > window.innerWidth - 80 && r.width < 80 && el.children.length >= 1;
    }) || null;
  }

  // ── Rail button insertion ──
  // Inserts our icon at the TOP of the strip immediately, with a MutationObserver
  // that re-inserts it whenever GCal re-renders the strip (e.g. on navigation).
  let _railBtnObserver = null;
  let _railBtnTimer    = null;

  function insertRailBtn(btn) {
    const rail = findRailByStructure();
    if (!rail) return false;
    if (rail.firstElementChild === btn) return true; // already in correct position
    rail.insertBefore(btn, rail.firstElementChild);  // move/insert at TOP
    // Clean up the fallback wrapper if it's now empty
    const fallback = document.getElementById('gp-rail-fallback');
    if (fallback && !fallback.contains(btn)) fallback.remove();
    return true;
  }

  function setupRailBtnObserver(btn) {
    function schedule() {
      clearTimeout(_railBtnTimer);
      _railBtnTimer = setTimeout(() => insertRailBtn(btn), 200);
    }

    if (_railBtnObserver) _railBtnObserver.disconnect();
    _railBtnObserver = new MutationObserver(schedule);
    _railBtnObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ── Rail button ──
  function createRailBtn() {
    const btn = document.createElement('button');
    btn.id = 'gp-sidebar-btn';
    btn.title = 'Goal Planner';
    btn.setAttribute('aria-label', 'Goal Planner');
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#444746" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>
      <circle cx="12" cy="12" r="1.5" fill="#444746" stroke="none"/>
      <line x1="12" y1="3" x2="12" y2="1"/>
    </svg>`;
    return btn;
  }

  // ── Panel HTML ──
  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'gp-panel';
    panel.innerHTML = `
      <div class="gp-card" id="gp-card">

        <!-- Header -->
        <div class="gp-header">
          <div class="gp-header-title">
            <span class="gp-header-eyebrow">GOAL PLANNER</span>
            <h2>My goals</h2>
          </div>
          <button class="gp-icon-btn gp-close-icon-btn" id="gp-close-btn" title="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="gp-divider"></div>

        <!-- ── SCREEN 1: Empty / home ── -->
        <div class="gp-screen active" id="gp-screen-home">
          <div class="gp-empty-body" id="gp-empty-state">
            <div class="gp-illustration">
              <svg viewBox="0 0 177 147" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="24" y="28" width="129" height="100" rx="14" fill="#e8f0fe"/>
                <rect x="24" y="28" width="129" height="32" rx="14" fill="#0b56cf"/>
                <rect x="24" y="46" width="129" height="14" fill="#0b56cf"/>
                <circle cx="50" cy="44" r="5" fill="white" opacity="0.9"/>
                <circle cx="127" cy="44" r="5" fill="white" opacity="0.9"/>
                <rect x="46" y="20" width="6" height="18" rx="3" fill="#5a8dee"/>
                <rect x="125" y="20" width="6" height="18" rx="3" fill="#5a8dee"/>
                <rect x="38" y="72" width="16" height="10" rx="3" fill="#0b56cf" opacity="0.15"/>
                <rect x="62" y="72" width="16" height="10" rx="3" fill="#0b56cf" opacity="0.15"/>
                <rect x="86" y="72" width="16" height="10" rx="3" fill="#0b56cf" opacity="0.5"/>
                <rect x="110" y="72" width="16" height="10" rx="3" fill="#0b56cf" opacity="0.15"/>
                <rect x="38" y="90" width="16" height="10" rx="3" fill="#0b56cf" opacity="0.15"/>
                <rect x="62" y="90" width="40" height="10" rx="3" fill="#0b56cf" opacity="0.6"/>
                <rect x="110" y="90" width="16" height="10" rx="3" fill="#0b56cf" opacity="0.15"/>
                <rect x="38" y="108" width="16" height="10" rx="3" fill="#0b56cf" opacity="0.15"/>
                <circle cx="148" cy="28" r="18" fill="#fff8e1"/>
                <text x="148" y="34" text-anchor="middle" font-size="16">🎯</text>
              </svg>
            </div>
            <div class="gp-cta">
              <div class="gp-text">
                <h3>Plan a long-term goal</h3>
                <p>Set a goal and automatically block focused work sessions on your calendar.</p>
              </div>
              <button class="gp-btn-primary" id="gp-set-goal-btn">Set a Goal</button>
            </div>
          </div>
          <div class="gp-goals-list" id="gp-goals-list"></div>
        </div>

        <!-- ── SCREEN 2: Goal name + schedule ── -->
        <div class="gp-screen" id="gp-screen-form">
          <div class="gp-form-edit-header" id="gp-form-edit-header">
            <button class="gp-icon-btn" id="gp-form-back-btn" title="Back to goals" aria-label="Back to goals">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span class="gp-form-edit-label">Edit goal</span>
          </div>
          <div class="gp-field-group">
            <div class="gp-field">
              <span class="gp-field-label">Goal Name</span>
              <div class="gp-input-box" id="gp-name-box">
                <input type="text" id="gp-goal-title" placeholder="e.g. Internship Apps" maxlength="60" autocomplete="off"/>
              </div>
            </div>
            <div class="gp-field">
              <span class="gp-field-label">Schedule</span>
              <button class="gp-schedule-btn" id="gp-open-recurrence">
                <span class="placeholder" id="gp-recurrence-summary">Select recurrence</span>
                <span class="gp-chevron">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                </span>
              </button>
            </div>
          </div>
          <div class="gp-action-group">
            <button class="gp-btn-primary gp-btn-full" id="gp-to-suggestions" disabled>Create goal</button>
          </div>
        </div>

        <!-- ── SCREEN 3: Suggested sessions ── -->
        <div class="gp-screen" id="gp-screen-suggestions">
          <div class="gp-field">
            <span class="gp-field-label">Goal Name</span>
            <div class="gp-input-box" id="gp-confirm-name-box">
              <input type="text" id="gp-confirm-title-input" maxlength="60" autocomplete="off" placeholder="Goal name"/>
            </div>
          </div>
          <div class="gp-field" style="margin-top:16px;">
            <span class="gp-field-label">Schedule</span>
            <button class="gp-confirm-chip" id="gp-confirm-schedule">
              <span class="gp-confirm-chip-label"></span>
              <svg class="gp-confirm-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="gp-confirm-chip" id="gp-confirm-ends">
              <span class="gp-confirm-chip-label"></span>
              <svg class="gp-confirm-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
          <div class="gp-field" style="margin-top:20px;">
            <div class="gp-section-header">
              <span class="gp-section-label">Suggested Sessions</span>
              <button class="gp-edit-btn" id="gp-edit-sessions-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>
            <div id="gp-suggestions-list"></div>
          </div>
          <div class="gp-std-time-section" id="gp-std-time-section">
            <div class="gp-std-time-header">
              <span class="gp-section-label">Standardize time</span>
              <span class="gp-std-time-hint">optional</span>
            </div>
            <div class="gp-std-chips">
              <button class="gp-std-chip" data-hour="9" data-min="0">Morning<br><small>9 AM</small></button>
              <button class="gp-std-chip" data-hour="14" data-min="0">Afternoon<br><small>2 PM</small></button>
              <button class="gp-std-chip" data-hour="19" data-min="0">Evening<br><small>7 PM</small></button>
              <button class="gp-std-chip gp-std-chip--custom" id="gp-std-custom-chip">Custom<br><small id="gp-std-custom-time">—</small></button>
            </div>
          </div>
          <div class="gp-action-group" style="margin-top:12px;">
            <button class="gp-btn-primary gp-btn-full gp-btn-calendar" id="gp-confirm-add">Create goal</button>
            <div class="gp-toast" id="gp-toast">✅ Sessions added to your calendar!</div>
          </div>
        </div>

      </div>`;
    return panel;
  }

  // ── Recurrence modal (appended to document.body so it centers over the full page) ──
  function createRecurrenceModal() {
    const overlay = document.createElement('div');
    overlay.id = 'gp-recurrence-overlay';
    overlay.innerHTML = `
      <div class="gp-recurrence-sheet">
        <div class="gp-rec-inner">
          <p class="gp-rec-title">Select recurrence</p>

          <div>
            <span class="gp-rec-label">Repeats every</span>
            <div class="gp-rec-freq">
              <input class="gp-rec-num-input" type="number" id="gp-freq-num" value="1" min="1" max="12"/>
              <select class="gp-rec-period-select" id="gp-freq-period">
                <option value="day">day</option>
                <option value="week" selected>week</option>
                <option value="month">month</option>
              </select>
            </div>
          </div>

          <div>
            <span class="gp-rec-label">Repeat on</span>
            <div class="gp-days" id="gp-days-selector">
              ${['S','M','T','W','T','F','S'].map((d,i) =>
                `<button class="gp-day-btn${['M','W','F'].includes(d) && i !== 0 && i !== 6 ? ' selected' : ''}" data-day="${['SU','MO','TU','WE','TH','FR','SA'][i]}">${d}</button>`
              ).join('')}
            </div>
          </div>

          <div>
            <span class="gp-rec-label">Session length</span>
            <div class="gp-session-row">
              <input class="gp-session-input" type="number" id="gp-session-mins" value="60" min="15" max="240" step="15"/>
              <span class="gp-session-unit">minutes</span>
            </div>
          </div>

          <div class="gp-ends">
            <span class="gp-rec-label">Ends</span>
            <div class="gp-radio-row">
              <input type="radio" name="gp-ends" id="gp-ends-never" value="never"/>
              <label for="gp-ends-never">Never</label>
            </div>
            <div class="gp-radio-row">
              <input type="radio" name="gp-ends" id="gp-ends-on" value="on" checked/>
              <label for="gp-ends-on">On</label>
              <div class="gp-date-picker-wrapper" id="gp-date-picker-wrapper">
                <button class="gp-date-chip" id="gp-end-date-chip" type="button">${formatDate(defaultEndDate())}</button>
                <input type="hidden" id="gp-end-date" value="${defaultEndDate()}"/>
              </div>
            </div>
            <div class="gp-radio-row">
              <input type="radio" name="gp-ends" id="gp-ends-after" value="after"/>
              <label for="gp-ends-after">After</label>
              <input class="gp-occur-input" type="number" id="gp-occurrences" value="13" min="1" max="100"/>
              <span class="gp-session-unit">sessions</span>
            </div>
          </div>

          <div class="gp-rec-actions">
            <button class="gp-btn-text" id="gp-rec-cancel">Cancel</button>
            <button class="gp-btn-filled-pill" id="gp-rec-done">Done</button>
          </div>
        </div>
      </div>
      <div class="gp-cal-popover" id="gp-date-popover">
        <div class="gp-cal-header">
          <button class="gp-cal-nav" id="gp-cal-prev" type="button">&#8249;</button>
          <span class="gp-cal-month-year" id="gp-cal-month-year"></span>
          <button class="gp-cal-nav" id="gp-cal-next" type="button">&#8250;</button>
        </div>
        <div class="gp-cal-weekdays">
          ${['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => `<span>${d}</span>`).join('')}
        </div>
        <div class="gp-cal-days" id="gp-cal-days"></div>
      </div>`;
    return overlay;
  }

  // ── Delete confirmation modal ──
  function createDeleteModal() {
    const overlay = document.createElement('div');
    overlay.id = 'gp-delete-overlay';
    overlay.innerHTML = `
      <div class="gp-delete-sheet">
        <p class="gp-delete-title">Delete goal?</p>
        <p class="gp-delete-body">All sessions for this goal will be removed from your calendar and Goal Planner.</p>
        <div class="gp-delete-actions">
          <button class="gp-btn-text" id="gp-delete-cancel">Cancel</button>
          <button class="gp-btn-danger" id="gp-delete-confirm">Delete</button>
        </div>
      </div>`;
    return overlay;
  }

  // ── Contextual action menu (shared, singleton) ──
  function createCtxMenu() {
    const menu = document.createElement('div');
    menu.id = 'gp-ctx-menu';
    menu.className = 'gp-ctx-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <button class="gp-ctx-item" data-ctx-action="edit" role="menuitem">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Edit goal
      </button>
      <div class="gp-ctx-divider"></div>
      <button class="gp-ctx-item" data-ctx-action="delete" role="menuitem">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
        Delete goal
      </button>`;
    return menu;
  }

  // ── Wire all events ──
  function wireEvents() {
    // Rail btn
    document.getElementById('gp-sidebar-btn').addEventListener('click', togglePanel);
    document.getElementById('gp-close-btn').addEventListener('click', closePanel);
    document.getElementById('gp-set-goal-btn').addEventListener('click', () => { resetEditMode(); showScreen('form'); });

    // Edit mode — back button
    document.getElementById('gp-form-back-btn').addEventListener('click', () => { resetEditMode(); showScreen('home'); });

    // Delete confirmation modal
    document.getElementById('gp-delete-cancel').addEventListener('click', closeDeleteConfirm);
    document.getElementById('gp-delete-confirm').addEventListener('click', confirmDeleteGoal);
    document.getElementById('gp-delete-overlay').addEventListener('click', e => {
      if (e.target === document.getElementById('gp-delete-overlay')) closeDeleteConfirm();
    });

    // Contextual menu — item clicks
    document.getElementById('gp-ctx-menu').addEventListener('click', e => {
      const item = e.target.closest('[data-ctx-action]');
      if (!item || !ctxMenuGoalId) return;
      const goalId = ctxMenuGoalId;
      closeCtxMenu();
      if (item.dataset.ctxAction === 'edit') openEditGoal(goalId);
      if (item.dataset.ctxAction === 'delete') openDeleteConfirm(goalId);
    });

    // Contextual menu — outside click + Escape to close
    document.addEventListener('click', e => {
      const menu = document.getElementById('gp-ctx-menu');
      if (menu && menu.classList.contains('open')) {
        if (!e.target.closest('#gp-ctx-menu') && !e.target.closest('.gp-goal-kebab')) {
          closeCtxMenu();
        }
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeCtxMenu();
    });

    // Screen 2 — goal name input
    const titleInput = document.getElementById('gp-goal-title');
    const nameBox = document.getElementById('gp-name-box');
    titleInput.addEventListener('focus', () => nameBox.classList.add('focused'));
    titleInput.addEventListener('blur', () => nameBox.classList.remove('focused'));
    titleInput.addEventListener('input', updateFormBtns);

    // Open recurrence modal
    document.getElementById('gp-open-recurrence').addEventListener('click', openRecurrence);

    // Day buttons (in body-level modal)
    document.querySelectorAll('#gp-recurrence-overlay .gp-day-btn').forEach(btn => {
      btn.addEventListener('click', () => btn.classList.toggle('selected'));
    });

    // Recurrence modal — Cancel / Done / backdrop click
    document.getElementById('gp-rec-cancel').addEventListener('click', closeRecurrence);
    document.getElementById('gp-rec-done').addEventListener('click', saveRecurrence);
    document.getElementById('gp-recurrence-overlay').addEventListener('click', e => {
      const inPicker = e.target.closest(
        '.gp-date-picker-wrapper,#gp-date-popover,#gp-cal-prev,#gp-cal-next'
      );
      if (!inPicker) closeDropdowns();
      if (e.target === document.getElementById('gp-recurrence-overlay')) closeRecurrence();
    });

    // Screen 2 — Add to Calendar
    document.getElementById('gp-to-suggestions').addEventListener('click', goToSuggestions);

    // Screen 3 — editable title input focus ring
    const confirmNameInput = document.getElementById('gp-confirm-title-input');
    const confirmNameBox   = document.getElementById('gp-confirm-name-box');
    confirmNameInput.addEventListener('focus', () => confirmNameBox.classList.add('focused'));
    confirmNameInput.addEventListener('blur',  () => confirmNameBox.classList.remove('focused'));

    // Screen 3 — schedule chips open recurrence modal directly
    document.getElementById('gp-confirm-schedule').addEventListener('click', openRecurrence);
    document.getElementById('gp-confirm-ends').addEventListener('click', openRecurrence);

    // Screen 3 — confirm add
    document.getElementById('gp-confirm-add').addEventListener('click', confirmAddToCalendar);

    initDatePicker();
    initStdTimeChips();
    initStdTimePicker();
  }

  // ── Panel toggle ──
  function togglePanel() {
    const p = document.getElementById('gp-panel');
    p.classList.contains('open') ? closePanel() : openPanel();
  }
  function openPanel() {
    closeGCalNativeSidebar();
    cachedCalendarMainEl = null; // re-probe in case GCal re-rendered since last open

    // Snap panel position to live GCal layout before the CSS transition fires
    const panel = document.getElementById('gp-panel');
    const headerH = getGCalHeaderBottom();
    const railW   = getGCalRailWidth();
    panel.style.top   = headerH + 'px';
    panel.style.right = railW   + 'px';
    // Keep the hidden transform in sync with the measured rail width
    if (!panel.classList.contains('open')) {
      panel.style.transform = `translateX(calc(100% + ${railW}px))`;
    }

    panel.classList.add('open');
    document.getElementById('gp-sidebar-btn').classList.add('active');
    setCalendarPushed(true);
    requestAnimationFrame(() => setCalendarPushed(true));
  }
  function closePanel() {
    document.getElementById('gp-panel').classList.remove('open');
    document.getElementById('gp-sidebar-btn').classList.remove('active');
    setCalendarPushed(false);
    closeCtxMenu();
    resetEditMode();
  }

  // ── Screen routing ──
  function showScreen(name) {
    ['home','form','suggestions'].forEach(s => {
      document.getElementById(`gp-screen-${s}`).classList.toggle('active', s === name);
    });
    if (name === 'home') renderHomeScreen();
  }

  // ── Home screen ──
  async function renderHomeScreen() {
    const goals = await getGoals();
    const emptyEl = document.getElementById('gp-empty-state');
    const listEl = document.getElementById('gp-goals-list');
    if (!goals.length) {
      emptyEl.style.display = 'flex';
      listEl.classList.remove('visible');
      listEl.innerHTML = '';
      return;
    }
    emptyEl.style.display = 'none';
    listEl.classList.add('visible');
    const now = new Date();

    listEl.innerHTML = goals.map(g => {
      const fallbackEnd = new Date(g.created);
      fallbackEnd.setMonth(fallbackEnd.getMonth() + 3);
      const deadline = new Date(g.endDate || g.deadline || fallbackEnd.toISOString());
      const totalDays = Math.max(1, Math.ceil((deadline - new Date(g.created)) / 86400000));
      const elapsed = Math.ceil((now - new Date(g.created)) / 86400000);
      const pct = Math.min(100, Math.round((elapsed / totalDays) * 100));
      const daysLeft = Math.max(0, Math.ceil((deadline - now) / 86400000));
      return `<div class="gp-goal-row" data-goal-id="${g.id}">
        <div class="gp-goal-row-main">
          <div class="gp-goal-row-info">
            <p class="gp-goal-chip-name">🎯 ${g.title}</p>
            <p class="gp-goal-chip-sub">${g.scheduleLabel} · ${daysLeft}d left</p>
          </div>
          <button class="gp-goal-kebab" data-goal-id="${g.id}" aria-label="More options" title="More options">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
            </svg>
          </button>
        </div>
        <div class="gp-progress-bar"><div class="gp-progress-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');

    // Event delegation — kebab menu trigger
    listEl.onclick = e => {
      const kebab = e.target.closest('.gp-goal-kebab');
      if (kebab) {
        e.stopPropagation();
        const goalId = kebab.dataset.goalId;
        const menu = document.getElementById('gp-ctx-menu');
        if (menu && menu.classList.contains('open') && ctxMenuGoalId === goalId) {
          closeCtxMenu();
        } else {
          openCtxMenu(goalId, kebab);
        }
        return;
      }
    };

    const addBtn = document.createElement('button');
    addBtn.className = 'gp-add-another';
    addBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add another goal`;
    addBtn.addEventListener('click', () => { resetEditMode(); showScreen('form'); });
    listEl.appendChild(addBtn);
  }

  // ── Contextual menu open/close ──
  function openCtxMenu(goalId, triggerEl) {
    closeCtxMenu();
    ctxMenuGoalId = goalId;
    const menu = document.getElementById('gp-ctx-menu');
    if (!menu) return;

    const rect = triggerEl.getBoundingClientRect();
    const menuWidth = 180;
    let left = rect.right - menuWidth;
    let top = rect.bottom + 4;
    if (left < 8) left = 8;
    if (top + 96 > window.innerHeight) top = rect.top - 100;

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.classList.add('open');
    triggerEl.classList.add('menu-open');
  }

  function closeCtxMenu() {
    ctxMenuGoalId = null;
    const menu = document.getElementById('gp-ctx-menu');
    if (menu) menu.classList.remove('open');
    document.querySelectorAll('.gp-goal-kebab.menu-open').forEach(el => el.classList.remove('menu-open'));
  }

  // ── Goal ID generator ──
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // ── Migrate old goal objects to include id + recurrence fields ──
  async function migrateGoals() {
    const goals = await getGoals();
    let changed = false;
    for (const g of goals) {
      if (!g.id) { g.id = generateId(); changed = true; }
    }
    if (changed) await saveGoals(goals);
  }

  // ── Open edit mode for an existing goal ──
  async function openEditGoal(goalId) {
    const goals = await getGoals();
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    state.editingGoalId = goalId;
    state.goalTitle = goal.title;

    // Pre-fill Screen 2 input (goToSuggestions reads from it even though we skip Screen 2)
    document.getElementById('gp-goal-title').value = goal.title;

    if (goal.recurrence) {
      state.recurrence = { ...goal.recurrence };
      populateRecurrenceForm(goal.recurrence);
    } else {
      state.recurrence = null;
    }

    // Set confirm button label for edit mode
    document.getElementById('gp-confirm-add').textContent = 'Save changes';

    // Skip form screen — jump straight to review/suggestions screen
    goToSuggestions();
  }

  // ── Pre-fill the recurrence modal with stored values ──
  function populateRecurrenceForm(r) {
    document.getElementById('gp-freq-num').value = r.every || 1;
    document.getElementById('gp-freq-period').value = r.period || 'week';

    document.querySelectorAll('#gp-recurrence-overlay .gp-day-btn').forEach(btn => {
      btn.classList.toggle('selected', (r.days || []).includes(btn.dataset.day));
    });

    document.getElementById('gp-session-mins').value = r.sessionMins || 60;

    const endsVal = r.ends || 'on';
    const endsRadio = document.querySelector(`input[name="gp-ends"][value="${endsVal}"]`);
    if (endsRadio) endsRadio.checked = true;

    if (r.endDate) {
      document.getElementById('gp-end-date').value = r.endDate;
      const chipEl = document.getElementById('gp-end-date-chip');
      if (chipEl) chipEl.textContent = formatDate(r.endDate);
    }
    if (r.occurrences) {
      document.getElementById('gp-occurrences').value = r.occurrences;
    }
  }

  // ── Update the recurrence summary pill from a recurrence object ──
  function updateRecurrenceSummaryFromR(r) {
    const dayNames = { SU:'Sun', MO:'Mon', TU:'Tue', WE:'Wed', TH:'Thu', FR:'Fri', SA:'Sat' };
    const dayStr = (r.days || []).length ? r.days.map(d => dayNames[d]).join(', ') : 'selected days';
    const label = r.every === 1 ? `Weekly on ${dayStr}` : `Every ${r.every} ${r.period}s on ${dayStr}`;
    const summaryEl = document.getElementById('gp-recurrence-summary');
    summaryEl.textContent = label;
    summaryEl.classList.remove('placeholder');
  }

  // ── Reset all edit-mode state and UI ──
  function resetEditMode() {
    state.editingGoalId = null;
    state.recurrence = null;
    state.goalTitle = '';

    const toSuggBtn = document.getElementById('gp-to-suggestions');
    if (toSuggBtn) toSuggBtn.textContent = 'Create goal';
    const confirmBtn = document.getElementById('gp-confirm-add');
    if (confirmBtn) confirmBtn.textContent = 'Create goal';
    const editHeader = document.getElementById('gp-form-edit-header');
    if (editHeader) editHeader.style.display = 'none';

    const titleInput = document.getElementById('gp-goal-title');
    if (titleInput) titleInput.value = '';
    const summaryEl = document.getElementById('gp-recurrence-summary');
    if (summaryEl) { summaryEl.textContent = 'Select recurrence'; summaryEl.classList.add('placeholder'); }

    updateFormBtns();
  }

  // ── Delete confirmation ──
  function openDeleteConfirm(goalId) {
    pendingDeleteId = goalId;
    document.getElementById('gp-delete-overlay').classList.add('open');
  }

  function closeDeleteConfirm() {
    pendingDeleteId = null;
    document.getElementById('gp-delete-overlay').classList.remove('open');
  }

  async function confirmDeleteGoal() {
    if (!pendingDeleteId) return;
    const goalId = pendingDeleteId;
    pendingDeleteId = null;
    document.getElementById('gp-delete-overlay').classList.remove('open');

    const goals = await getGoals();
    const goal = goals.find(g => g.id === goalId);

    // Delete calendar events (best-effort — don't block on failure)
    if (goal?.calEventIds?.length) {
      try {
        const token = await getAuthToken();
        await deleteCalendarEvents(goal.calEventIds, token);
      } catch (e) {
        console.warn('GoalPlanner: could not delete calendar events', e);
      }
    }

    await saveGoals(goals.filter(g => g.id !== goalId));
    await renderHomeScreen();
  }

  // ── Delete a list of Calendar event IDs (parallel, best-effort) ──
  async function deleteCalendarEvents(eventIds, token) {
    await Promise.allSettled(
      eventIds.map(id =>
        fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
      )
    );
  }

  // ── Form helpers ──
  function updateFormBtns() {
    const hasTitle = document.getElementById('gp-goal-title').value.trim().length > 0;
    const hasRecurrence = state.recurrence !== null;
    document.getElementById('gp-to-suggestions').disabled = !(hasTitle && hasRecurrence);
  }

  // ── Recurrence overlay ──
  function openRecurrence() {
    closeDropdowns();
    document.getElementById('gp-recurrence-overlay').classList.add('open');
  }
  function closeRecurrence() {
    closeDropdowns();
    document.getElementById('gp-recurrence-overlay').classList.remove('open');
  }
  function saveRecurrence() {
    const every = parseInt(document.getElementById('gp-freq-num').value) || 1;
    const period = document.getElementById('gp-freq-period').value;
    const days = [...document.querySelectorAll('.gp-day-btn.selected')].map(b => b.dataset.day);
    const sessionMins = parseInt(document.getElementById('gp-session-mins').value) || 60;
    const endsVal = document.querySelector('input[name="gp-ends"]:checked').value;
    const endDate = document.getElementById('gp-end-date').value;
    const occurrences = parseInt(document.getElementById('gp-occurrences').value) || 13;

    state.recurrence = { every, period, days, sessionMins, ends: endsVal, endDate, occurrences };

    // Update summary pill
    const dayNames = { SU:'Sun', MO:'Mon', TU:'Tue', WE:'Wed', TH:'Thu', FR:'Fri', SA:'Sat' };
    const dayStr = days.length ? days.map(d => dayNames[d]).join(', ') : 'selected days';
    const label = every === 1 ? `Weekly on ${dayStr}` : `Every ${every} ${period}s on ${dayStr}`;
    const summaryEl = document.getElementById('gp-recurrence-summary');
    summaryEl.textContent = label;
    summaryEl.classList.remove('placeholder');

    closeRecurrence();
    updateFormBtns();
    updateConfirmChips();
  }

  // ── Go to suggestions screen ──
  async function goToSuggestions() {
    state.goalTitle = document.getElementById('gp-goal-title').value.trim();

    if (!state.recurrence) {
      state.recurrence = {
        every: 1, period: 'week', days: ['MO','WE','FR'],
        sessionMins: 60, ends: 'on',
        endDate: defaultEndDate(), occurrences: 13,
      };
    }

    const r = state.recurrence;
    const dayNames = { SU:'Sun', MO:'Mon', TU:'Tue', WE:'Wed', TH:'Thu', FR:'Fri', SA:'Sat' };
    const dayStr = r.days.map(d => dayNames[d]).join(', ');
    const schedLabel = r.every === 1 ? `Weekly on ${dayStr}` : `Every ${r.every} ${r.period}s on ${dayStr}`;

    // Populate the editable title input on Screen 3
    const confirmTitleInput = document.getElementById('gp-confirm-title-input');
    if (confirmTitleInput) confirmTitleInput.value = state.goalTitle;

    let endsLabel = 'Never ends';
    if (r.ends === 'on' && r.endDate) {
      endsLabel = `Ends ${formatDate(r.endDate)}`;
    } else if (r.ends === 'after') {
      endsLabel = `Ends after ${r.occurrences} sessions`;
    }
    updateConfirmChips(schedLabel, endsLabel);

    // Show the screen immediately with skeleton cards (one per selected day)
    showScreen('suggestions');
    resetStdTimeChips();
    const sessionCount = Math.max(1, r.days.length);
    renderSkeletons(sessionCount);

    // Fetch freebusy data and generate calendar-aware suggestions
    try {
      const token = await getAuthToken();
      const busySlots = await fetchBusySlots(token);
      state.suggestions = generateSmartSuggestions(r, busySlots);
    } catch (e) {
      console.warn('GoalPlanner: freebusy unavailable, using preferred time.', e);
      state.suggestions = generateFallbackSuggestions(r);
    }
    renderSuggestions();
  }

  // ── Update Schedule chips on Screen 3 from current state.recurrence ──
  function updateConfirmChips(schedLabel, endsLabel) {
    if (!schedLabel || !endsLabel) {
      const r = state.recurrence;
      if (!r) return;
      const dayNames = { SU:'Sun', MO:'Mon', TU:'Tue', WE:'Wed', TH:'Thu', FR:'Fri', SA:'Sat' };
      const dayStr = r.days.map(d => dayNames[d]).join(', ');
      schedLabel = schedLabel || (r.every === 1 ? `Weekly on ${dayStr}` : `Every ${r.every} ${r.period}s on ${dayStr}`);
      if (!endsLabel) {
        endsLabel = 'Never ends';
        if (r.ends === 'on' && r.endDate) endsLabel = `Ends ${formatDate(r.endDate)}`;
        else if (r.ends === 'after') endsLabel = `Ends after ${r.occurrences} sessions`;
      }
    }
    const schedEl = document.getElementById('gp-confirm-schedule');
    if (schedEl) schedEl.querySelector('.gp-confirm-chip-label').textContent = schedLabel;
    const endsEl = document.getElementById('gp-confirm-ends');
    if (endsEl) endsEl.querySelector('.gp-confirm-chip-label').textContent = endsLabel;
  }

  // ── FreeBusy fetch ──
  async function fetchBusySlots(token) {
    const now = new Date();
    const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const resp = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin: now.toISOString(),
        timeMax: weekOut.toISOString(),
        items: [{ id: 'primary' }],
      }),
    });
    const data = await resp.json();
    return (data.calendars && data.calendars.primary && data.calendars.primary.busy) || [];
  }

  function overlapsWithBusy(start, end, busySlots) {
    return busySlots.some(slot => {
      const bStart = new Date(slot.start);
      const bEnd   = new Date(slot.end);
      return start < bEnd && end > bStart;
    });
  }

  // ── Smart suggestions using freebusy data ──
  // Returns exactly N sessions: one per selected day-of-week (first upcoming occurrence).
  // Preferred times: 9 AM → 2 PM → 7 PM → any free block 8am–9pm.
  function generateSmartSuggestions(r, busySlots) {
    const dayMap = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };
    const targetDays = r.days.map(d => dayMap[d]);
    const sessionMins = r.sessionMins || 60;
    const preferredStarts = [
      { h: 9,  m: 0 },
      { h: 14, m: 0 },
      { h: 19, m: 0 },
    ];

    const sessions = [];
    const now = new Date();
    const seenDows = new Set();

    for (let i = 1; i <= 14 && seenDows.size < targetDays.length; i++) {
      const day = new Date(now);
      day.setDate(now.getDate() + i);
      const dow = day.getDay();

      if (!targetDays.includes(dow) || seenDows.has(dow)) continue;
      seenDows.add(dow);

      // Busy slots that fall on this calendar date
      const dayBusy = busySlots.filter(slot => {
        const s = new Date(slot.start);
        return s.getFullYear() === day.getFullYear()
            && s.getMonth()    === day.getMonth()
            && s.getDate()     === day.getDate();
      });

      let bestSlot = null;

      // Try preferred windows first
      for (const ps of preferredStarts) {
        const start = new Date(day);
        start.setHours(ps.h, ps.m, 0, 0);
        const end = new Date(start);
        end.setMinutes(end.getMinutes() + sessionMins);
        if (!overlapsWithBusy(start, end, dayBusy)) { bestSlot = { start, end }; break; }
      }

      // Fallback: sweep 8 AM – 9 PM in 30-min steps
      if (!bestSlot) {
        for (let m = 8 * 60; m <= 21 * 60 - sessionMins; m += 30) {
          const start = new Date(day);
          start.setHours(Math.floor(m / 60), m % 60, 0, 0);
          const end = new Date(start);
          end.setMinutes(end.getMinutes() + sessionMins);
          if (!overlapsWithBusy(start, end, dayBusy)) { bestSlot = { start, end }; break; }
        }
      }

      if (bestSlot) {
        sessions.push({
          date: formatDayDate(bestSlot.start),
          startTime: formatTime(bestSlot.start),
          endTime:   formatTime(bestSlot.end),
          isoStart:  bestSlot.start.toISOString(),
          isoEnd:    bestSlot.end.toISOString(),
        });
      }
    }
    return sessions;
  }

  // ── Fallback suggestions using the user's preferred time (no API) ──
  // Returns exactly N sessions: one per selected day-of-week (first upcoming occurrence).
  function generateFallbackSuggestions(r) {
    const dayMap = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };
    const targetDays = r.days.map(d => dayMap[d]);
    const [hour, min] = (r.time || '09:00').split(':').map(Number);
    const sessionMins = r.sessionMins || 60;

    const sessions = [];
    const now = new Date();
    const seenDows = new Set();

    for (let i = 1; i <= 14 && seenDows.size < targetDays.length; i++) {
      const day = new Date(now);
      day.setDate(now.getDate() + i);
      const dow = day.getDay();

      if (!targetDays.includes(dow) || seenDows.has(dow)) continue;
      seenDows.add(dow);

      const start = new Date(day);
      start.setHours(hour, min, 0, 0);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + sessionMins);

      sessions.push({
        date: formatDayDate(start),
        startTime: formatTime(start),
        endTime:   formatTime(end),
        isoStart:  start.toISOString(),
        isoEnd:    end.toISOString(),
      });
    }
    return sessions;
  }

  function renderSkeletons(count) {
    const list = document.getElementById('gp-suggestions-list');
    list.innerHTML = Array.from({ length: count }, () => `
      <div class="gp-skeleton-card">
        <div class="gp-skeleton-line gp-skeleton-line--title"></div>
        <div class="gp-skeleton-line gp-skeleton-line--time"></div>
      </div>`).join('');
  }

  function renderSuggestions() {
    const list = document.getElementById('gp-suggestions-list');
    const title = state.goalTitle || '';
    const label = title.length > 22 ? title.slice(0, 21) + '…' : title;
    list.innerHTML = state.suggestions.map(s => `
      <div class="gp-session-card">
        <p class="gp-session-name">${label}</p>
        <p class="gp-session-time">${s.startTime} – ${s.endTime}</p>
      </div>`).join('');
  }

  // ── Standardize session time ──
  function applyStandardTime(h, min) {
    if (!state.suggestions.length) return;
    const sessionMins = (state.recurrence && state.recurrence.sessionMins) || 60;
    state.suggestions = state.suggestions.map(s => {
      const start = new Date(s.isoStart);
      start.setHours(h, min, 0, 0);
      const end = new Date(start.getTime() + sessionMins * 60000);
      return { ...s, startTime: formatTime(start), endTime: formatTime(end), isoStart: start.toISOString(), isoEnd: end.toISOString() };
    });
    renderSuggestions();
  }

  function resetStdTimeChips() {
    document.querySelectorAll('.gp-std-chip').forEach(c => c.classList.remove('active'));
    const lbl = document.getElementById('gp-std-custom-time');
    if (lbl) lbl.textContent = '—';
    const dd = document.getElementById('gp-std-time-dd');
    if (dd) dd.style.display = 'none';
  }

  function initStdTimeChips() {
    document.querySelectorAll('.gp-std-chip[data-hour]').forEach(chip => {
      chip.addEventListener('click', () => {
        const h = parseInt(chip.dataset.hour);
        const m = parseInt(chip.dataset.min || '0');
        applyStandardTime(h, m);
        document.querySelectorAll('.gp-std-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const dd = document.getElementById('gp-std-time-dd');
        if (dd) dd.style.display = 'none';
      });
    });
  }

  function initStdTimePicker() {
    const customChip = document.getElementById('gp-std-custom-chip');
    const dd = document.getElementById('gp-std-time-dd');
    if (!customChip || !dd) return;

    customChip.addEventListener('click', e => {
      e.stopPropagation();
      if (dd.style.display === 'block') { dd.style.display = 'none'; customChip.classList.remove('active'); return; }

      dd.innerHTML = '';
      for (let m = 0; m < 24 * 60; m += 15) {
        const item = document.createElement('div');
        item.className = 'gp-time-dd-item';
        item.textContent = minsToDisplay(m);
        item.addEventListener('mousedown', ev => {
          ev.preventDefault();
          const h = Math.floor(m / 60);
          const min = m % 60;
          applyStandardTime(h, min);
          document.getElementById('gp-std-custom-time').textContent = minsToDisplay(m);
          document.querySelectorAll('.gp-std-chip').forEach(c => c.classList.remove('active'));
          customChip.classList.add('active');
          dd.style.display = 'none';
        });
        dd.appendChild(item);
      }

      positionFloating(dd, customChip);
      dd.style.display = 'block';
      customChip.classList.add('active');
      setTimeout(() => {
        const ninth = dd.querySelector('.gp-time-dd-item:nth-child(37)');
        if (ninth) ninth.scrollIntoView({ block: 'center' });
      }, 0);
    });

    document.addEventListener('click', e => {
      if (!dd || dd.style.display !== 'block') return;
      if (!e.target.closest('#gp-std-time-dd') && e.target !== customChip && !e.target.closest('#gp-std-custom-chip')) {
        dd.style.display = 'none';
        customChip.classList.remove('active');
      }
    });
  }

  // ── Confirm + add to Calendar (handles both create and edit modes) ──
  async function confirmAddToCalendar() {
    // Pick up any edits the user made to the goal name on Screen 3
    const titleInput = document.getElementById('gp-confirm-title-input');
    if (titleInput && titleInput.value.trim()) state.goalTitle = titleInput.value.trim();

    const btn = document.getElementById('gp-confirm-add');
    const isEditing = !!state.editingGoalId;
    btn.textContent = 'Saving…'; btn.disabled = true;
    try {
      const token = await getAuthToken();
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Delete the old calendar events when editing
      if (isEditing) {
        const goals = await getGoals();
        const oldGoal = goals.find(g => g.id === state.editingGoalId);
        if (oldGoal?.calEventIds?.length) {
          await deleteCalendarEvents(oldGoal.calEventIds, token);
        }
      }

      // Create new events and collect their IDs
      const eventIds = [];
      for (const s of state.suggestions) {
        const resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: `🎯 ${state.goalTitle}`,
            description: `Goal Planner session for: "${state.goalTitle}"`,
            start: { dateTime: s.isoStart, timeZone: tz },
            end:   { dateTime: s.isoEnd,   timeZone: tz },
            colorId: '9',
          }),
        });
        const data = await resp.json();
        if (data.id) eventIds.push(data.id);
      }

      const r = state.recurrence;
      const dayNames = { SU:'Sun', MO:'Mon', TU:'Tue', WE:'Wed', TH:'Thu', FR:'Fri', SA:'Sat' };
      const dayStr = r.days.map(d => dayNames[d]).join(', ');
      const schedLabel = r.every === 1 ? `Weekly on ${dayStr}` : `Every ${r.every} ${r.period}s`;

      const goals = await getGoals();
      if (isEditing) {
        const idx = goals.findIndex(g => g.id === state.editingGoalId);
        if (idx !== -1) {
          goals[idx] = {
            ...goals[idx],
            title: state.goalTitle,
            scheduleLabel: schedLabel,
            recurrence: { ...r },
            endDate: r.endDate || '',
            calEventIds: eventIds,
          };
        }
      } else {
        goals.push({
          id: generateId(),
          title: state.goalTitle,
          scheduleLabel: schedLabel,
          recurrence: { ...r },
          endDate: r.endDate || '',
          created: new Date().toISOString(),
          calEventIds: eventIds,
        });
      }
      await saveGoals(goals);

      resetEditMode();
      document.getElementById('gp-toast').classList.add('visible');
      btn.textContent = 'Create goal';
      btn.disabled = false;
      setTimeout(() => { showScreen('home'); document.getElementById('gp-toast').classList.remove('visible'); }, 1800);
    } catch (e) {
      console.error(e);
      alert('Could not add to Calendar. Make sure the extension has Calendar access.');
      btn.textContent = isEditing ? 'Save changes' : 'Create goal';
      btn.disabled = false;
    }
  }

  // ── Auth ──
  function getAuthToken() {
    return new Promise((res, rej) => {
      chrome.runtime.sendMessage({ type: 'GET_AUTH_TOKEN' }, response => {
        if (chrome.runtime.lastError) return rej(chrome.runtime.lastError);
        if (response?.error) return rej(new Error(response.error));
        res(response.token);
      });
    });
  }

  // ── Storage ──
  function getGoals() { return new Promise(r => chrome.storage.local.get(['gp_goals'], d => r(d.gp_goals || []))); }
  function saveGoals(g) { return new Promise(r => chrome.storage.local.set({ gp_goals: g }, r)); }

  // ── Date helpers ──
  function defaultEndDate() {
    const d = new Date(); d.setMonth(d.getMonth() + 3);
    return d.toISOString().split('T')[0];
  }
  function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function formatDayDate(d) {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function formatTime(d) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  // ── Native GCal sidebar conflict handling ──
  function getGCalNativeSidebar() {
    const KNOWN = ['[data-panelid]', '.fZNHHb', '.P9GGKe'];
    for (const sel of KNOWN) {
      for (const el of document.querySelectorAll(sel)) {
        if (el.closest('#gp-panel') || el.closest('#gp-recurrence-overlay')) continue;
        const r = el.getBoundingClientRect();
        if (r.width >= 100 && r.width <= 600 && r.height >= 200) return el;
      }
    }
    for (const el of document.querySelectorAll('[role="complementary"]')) {
      if (el.id === 'gp-panel' || el.closest('#gp-panel')) continue;
      const r = el.getBoundingClientRect();
      if (r.right >= window.innerWidth - 100 && r.width >= 100 && r.height >= 200) return el;
    }
    return null;
  }

  function closeGCalNativeSidebar() {
    const sb = getGCalNativeSidebar();
    if (!sb) return;
    // Try a labelled close button inside the sidebar
    const closeBtn = sb.querySelector('[aria-label*="close" i],[aria-label*="Close" i],[title*="close" i]');
    if (closeBtn) { closeBtn.click(); return; }
    // Fall back: click the right-rail button that opened it (it will toggle the panel off)
    for (const btn of document.querySelectorAll('[aria-pressed="true"],[aria-expanded="true"]')) {
      if (btn.closest('#gp-panel') || btn.closest('#gp-recurrence-overlay') || btn.id === 'gp-sidebar-btn') continue;
      const r = btn.getBoundingClientRect();
      if (r.right >= window.innerWidth - 80) { btn.click(); return; }
    }
  }

  let _nativeSidebarObserver = null;
  function setupNativeSidebarObserver() {
    if (_nativeSidebarObserver) return;
    let wasOpen = false;
    const check = () => {
      const isOpen = !!getGCalNativeSidebar();
      if (isOpen && !wasOpen) {
        // A native GCal sidebar just appeared — close Goal Planner to avoid double margin
        const panel = document.getElementById('gp-panel');
        if (panel && panel.classList.contains('open')) closePanel();
      }
      wasOpen = isOpen;
    };
    _nativeSidebarObserver = new MutationObserver(() => setTimeout(check, 80));
    _nativeSidebarObserver.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['class', 'style', 'aria-hidden'],
    });
  }

  // ── Time/date picker utilities ──
  function minsToDisplay(totalMins) {
    const h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')}${ampm}`;
  }

  function minsTo24h(totalMins) {
    const h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function formatDuration(mins) {
    if (mins < 60) return `${mins} mins`;
    const h = mins / 60;
    if (h === Math.floor(h)) return `${h} ${h === 1 ? 'hr' : 'hrs'}`;
    const hInt = Math.floor(h);
    if (mins % 60 === 30) return `${hInt}.5 hrs`;
    return `${hInt} hr ${mins % 60} min`;
  }

  function positionFloating(el, ref) {
    const r = ref.getBoundingClientRect();
    el.style.top  = (r.bottom + 4) + 'px';
    el.style.left = r.left + 'px';
  }

  function closeDropdowns() {
    ['gp-std-time-dd', 'gp-date-popover'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    ['gp-std-custom-chip', 'gp-end-date-chip'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });
  }

  function initDatePicker() {
    const chip    = document.getElementById('gp-end-date-chip');
    const popover = document.getElementById('gp-date-popover');
    const MONTHS  = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
    let calY, calM;

    function renderCal() {
      document.getElementById('gp-cal-month-year').textContent = `${MONTHS[calM]} ${calY}`;
      const today   = new Date();
      const selVal  = document.getElementById('gp-end-date').value;
      const selDate = selVal ? new Date(selVal + 'T00:00:00') : null;
      const firstDow  = new Date(calY, calM, 1).getDay();
      const daysInMo  = new Date(calY, calM + 1, 0).getDate();
      const grid = document.getElementById('gp-cal-days');
      grid.innerHTML = '';
      for (let i = 0; i < firstDow; i++) {
        const e = document.createElement('div');
        e.className = 'gp-cal-day gp-cal-day-empty';
        grid.appendChild(e);
      }
      for (let d = 1; d <= daysInMo; d++) {
        const cell = document.createElement('button');
        cell.type = 'button'; cell.className = 'gp-cal-day'; cell.textContent = d;
        const isToday = today.getFullYear() === calY && today.getMonth() === calM && today.getDate() === d;
        const isSel   = selDate && selDate.getFullYear() === calY && selDate.getMonth() === calM && selDate.getDate() === d;
        if (isToday) cell.classList.add('today');
        if (isSel)   cell.classList.add('selected');
        cell.addEventListener('mousedown', e => {
          e.preventDefault();
          const iso = `${calY}-${String(calM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          document.getElementById('gp-end-date').value = iso;
          const chipEl = document.getElementById('gp-end-date-chip');
          if (chipEl) chipEl.textContent = formatDate(iso);
          document.getElementById('gp-ends-on').checked = true;
          closeDropdowns();
        });
        grid.appendChild(cell);
      }
    }

    chip.addEventListener('click', e => {
      e.stopPropagation();
      if (popover.style.display === 'block') { closeDropdowns(); return; }
      const val = document.getElementById('gp-end-date').value || defaultEndDate();
      const d = new Date(val + 'T00:00:00');
      calY = d.getFullYear(); calM = d.getMonth();
      renderCal();
      positionFloating(popover, chip);
      popover.style.display = 'block';
      const stdDd = document.getElementById('gp-std-time-dd');
      if (stdDd) stdDd.style.display = 'none';
      chip.classList.add('active');
    });

    document.getElementById('gp-cal-prev').addEventListener('click', e => {
      e.stopPropagation();
      calM--; if (calM < 0) { calM = 11; calY--; } renderCal();
    });
    document.getElementById('gp-cal-next').addEventListener('click', e => {
      e.stopPropagation();
      calM++; if (calM > 11) { calM = 0; calY++; } renderCal();
    });
  }

  // ── Boot ──
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; setTimeout(inject, 1000); }
  }).observe(document.body, { childList: true, subtree: true });

})();
