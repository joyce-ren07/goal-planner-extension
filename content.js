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

  // ── Ghost event state ──
  let _ghostScrollEl = null;
  let _ghostScrollHandler = null;

  // ── Original suggestions (before any preferred-time override) ──
  let _originalSuggestions = [];

  // ── Grid metrics cache — shared by ghost-event renderer and resize handler ──
  let _gridMetricsCache = null;
  let _gridMetricsCacheTime = 0;

  /**
   * Returns { pxPerHour } measured from the live hour-label positions.
   * Reuses findCalendarScrollContainer + findHourAbsolutePositions so the
   * same constants drive both ghost-event sizing and resize duration math.
   * Result is cached for 5 s to avoid repeated DOM traversal during a drag.
   */
  function getGridMetrics() {
    const now = Date.now();
    if (_gridMetricsCache && now - _gridMetricsCacheTime < 5000) return _gridMetricsCache;
    const scrollCont = findCalendarScrollContainer();
    if (!scrollCont) return null;
    const hourPositions = findHourAbsolutePositions(scrollCont);
    if (hourPositions.length < 2) return null;
    hourPositions.sort((a, b) => a.hour - b.hour);
    const first = hourPositions[0];
    const last  = hourPositions[hourPositions.length - 1];
    const pxPerHour = (last.absY - first.absY) / (last.hour - first.hour);
    if (pxPerHour <= 0) return null;
    _gridMetricsCache = { pxPerHour };
    _gridMetricsCacheTime = now;
    return _gridMetricsCache;
  }

  // ── Ghost events: remove all from DOM and tear down scroll listener ──
  function removeGhostEvents() {
    document.querySelectorAll('.goal-ghost-event').forEach((el) => el.remove());
    if (_ghostScrollEl && _ghostScrollHandler) {
      _ghostScrollEl.removeEventListener('scroll', _ghostScrollHandler);
      _ghostScrollEl = null;
      _ghostScrollHandler = null;
    }
  }

  /** In-memory preview only: never written to chrome.storage until confirmAddToCalendar succeeds. */
  function clearGoalCreationPreview() {
    state.suggestions = [];
    _originalSuggestions = [];
    removeGhostEvents();
    resetPrefTimeInput();
  }

  async function computePreviewSuggestions(r) {
    try {
      const token = await getAuthToken();
      const busySlots = await fetchBusySlots(token);
      return generateSmartSuggestions(r, busySlots);
    } catch (e) {
      console.warn('GoalPlanner: freebusy unavailable, using preferred time.', e);
      return generateFallbackSuggestions(r);
    }
  }

  // ── Ghost events: find the scrollable time-grid container ──
  function findCalendarScrollContainer() {
    for (const sel of ['.FtZfle', '.M7Vc1b', '.ZCaJde']) {
      const el = document.querySelector(sel);
      if (el && !el.closest('#gp-panel') && el.scrollHeight > el.clientHeight + 50) return el;
    }
    for (const el of document.querySelectorAll('div')) {
      if (el.closest('#gp-panel, #gp-recurrence-overlay, #gp-delete-overlay')) continue;
      const s = window.getComputedStyle(el);
      if (s.overflowY !== 'auto' && s.overflowY !== 'scroll' &&
          s.overflow !== 'auto' && s.overflow !== 'scroll') continue;
      const r = el.getBoundingClientRect();
      if (r.height < 300 || el.scrollHeight <= el.clientHeight + 50) continue;
      if (/\b\d{1,2}\s*(AM|PM)\b/.test(el.textContent)) return el;
    }
    return null;
  }

  // ── Ghost events: locate hour-label elements and compute their absolute Y
  //    position within the scroll container ──
  function findHourAbsolutePositions(scrollContainer) {
    const result = [];
    const seen = new Set();
    const pattern = /^(\d{1,2})\s*(AM|PM)$/;
    const contRect = scrollContainer.getBoundingClientRect();

    function processNode(node, requireVisible) {
      const text = node.textContent.trim();
      const m = text.match(pattern);
      if (!m) return;
      const parent = node.parentElement;
      if (!parent || parent.closest('#gp-panel, #gp-recurrence-overlay')) return;
      const rect = parent.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      if (requireVisible && (rect.top < 0 || rect.top > window.innerHeight)) return;
      const h = parseInt(m[1]);
      const ampm = m[2].toUpperCase();
      const hour24 = ampm === 'AM' ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12);
      if (seen.has(hour24)) return;
      seen.add(hour24);
      // Absolute Y within the scroll container (survives scrolling)
      const absY = rect.top - contRect.top + scrollContainer.scrollTop + rect.height / 2;
      result.push({ hour: hour24, absY });
    }

    let walker = document.createTreeWalker(scrollContainer, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) processNode(n, false);

    // Fallback: some GCal builds keep the time column outside the scroll container
    if (result.length < 2) {
      walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while ((n = walker.nextNode())) processNode(n, true);
    }
    return result;
  }

  // ── Ghost events: map day-of-week column headers to viewport x-positions ──
  function findDayColumnPositions() {
    const columns = [];
    const seen = new Set();
    const monthMap = {
      january:0, jan:0, february:1, feb:1, march:2, mar:2,
      april:3, apr:3, may:4, june:5, jun:5, july:6, jul:6,
      august:7, aug:7, september:8, sep:8, sept:8,
      october:9, oct:9, november:10, nov:10, december:11, dec:11,
    };

    document.querySelectorAll('[role="columnheader"]').forEach(el => {
      if (el.closest('#gp-panel, #gp-recurrence-overlay')) return;
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      // Match "Sunday, April 19, 2026" or "Apr 19"
      const m = label.match(/\w+day,?\s+(\w+)\s+(\d{1,2}),?\s*(\d{4})?/) ||
                label.match(/^(\w{3,})\s+(\d{1,2}),?\s*(\d{4})?/);
      if (!m) return;
      const month = monthMap[m[1].toLowerCase()];
      if (month === undefined) return;
      const day = parseInt(m[2]);
      const year = m[3] ? parseInt(m[3]) : new Date().getFullYear();
      const key = `${year}-${month}-${day}`;
      if (seen.has(key)) return;
      seen.add(key);
      const rect = el.getBoundingClientRect();
      if (rect.width < 10) return;
      columns.push({ date: new Date(year, month, day), left: rect.left, width: rect.width });
    });

    // Fallback: data-datekey="20260420" attribute used by some GCal builds
    if (!columns.length) {
      document.querySelectorAll('[data-datekey]').forEach(el => {
        if (el.closest('#gp-panel')) return;
        const key = el.getAttribute('data-datekey');
        if (!/^\d{8}$/.test(key)) return;
        const y = parseInt(key.slice(0, 4)), mo = parseInt(key.slice(4, 6)) - 1, d = parseInt(key.slice(6, 8));
        const dk = `${y}-${mo}-${d}`;
        if (seen.has(dk)) return;
        seen.add(dk);
  
        const rect = el.getBoundingClientRect();
        if (rect.width < 10) return;
        columns.push({ date: new Date(y, mo, d), left: rect.left, width: rect.width });
      });
    }
    return columns;
  }

  if (typeof globalThis.GoalCalendarSync !== 'undefined') {
    globalThis.GoalCalendarSync.init({
      findCalendarScrollContainer,
      findHourAbsolutePositions,
      findDayColumnPositions,
      getGridMetrics,
    });
  }

  // ── Ghost events: render one ghost per suggestion onto the calendar grid ──
  function renderGhostEvents() {
    removeGhostEvents();
    if (!state.suggestions || !state.suggestions.length) return;

    const scrollCont = findCalendarScrollContainer();
    if (!scrollCont) return;

    const hourPositions = findHourAbsolutePositions(scrollCont);
    if (hourPositions.length < 2) return;

    hourPositions.sort((a, b) => a.hour - b.hour);
    const first = hourPositions[0];
    const last  = hourPositions[hourPositions.length - 1];
    const pxPerHour = (last.absY - first.absY) / (last.hour - first.hour);
    if (pxPerHour <= 0) return;
    const absYAtHour0 = first.absY - first.hour * pxPerHour;

    const dayColumns = findDayColumnPositions();
    const goalLabel = (state.goalTitle || '').length > 18
      ? state.goalTitle.slice(0, 17) + '…'
      : (state.goalTitle || '');

    const contRect = scrollCont.getBoundingClientRect();
    const ghostData = [];

    for (const session of state.suggestions) {
      const start = new Date(session.isoStart);
      const end   = new Date(session.isoEnd);

      const col = dayColumns.find(c =>
        c.date.getFullYear() === start.getFullYear() &&
        c.date.getMonth()    === start.getMonth()    &&
        c.date.getDate()     === start.getDate()
      );
      if (!col) continue; // date not visible in current view

      const startMins   = start.getHours() * 60 + start.getMinutes();
      const durationMin = (end - start) / 60000;
      const absTop  = absYAtHour0 + (startMins / 60) * pxPerHour;
      const height  = Math.max(20, (durationMin / 60) * pxPerHour);
      const left    = col.left + 2;
      const width   = Math.max(10, col.width - 4);
      const fixedTop = contRect.top + absTop - scrollCont.scrollTop;

      const ghost = document.createElement('div');
      ghost.className = 'goal-ghost-event';
      ghost.setAttribute('data-gp-ghost-preview', 'true');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.cssText =
        `left:${left}px;top:${fixedTop}px;width:${width}px;height:${height}px;`;

      const nameEl = document.createElement('span');
      nameEl.className = 'goal-ghost-event-name';
      nameEl.textContent = goalLabel;
      ghost.appendChild(nameEl);
      document.body.appendChild(ghost);
      ghostData.push({ el: ghost, absTop, left, width, height });
    }

    if (!ghostData.length) return;

    // Reposition ghosts on every scroll tick using rAF to avoid jank
    let _raf = null;
    _ghostScrollEl = scrollCont;
    _ghostScrollHandler = () => {
      if (_raf) return;
      _raf = requestAnimationFrame(() => {
        _raf = null;
        const ct = scrollCont.getBoundingClientRect().top;
        const st = scrollCont.scrollTop;
        for (const g of ghostData) g.el.style.top = (ct + g.absTop - st) + 'px';
      });
    };
    scrollCont.addEventListener('scroll', _ghostScrollHandler, { passive: true });
  }

  // ── Inject once ──
  function inject() {
    if (document.getElementById('gp-panel')) return;

    // Load Material Symbols Outlined font (once per page)
    if (!document.getElementById('gp-material-symbols')) {
      const link = document.createElement('link');
      link.id = 'gp-material-symbols';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200';
      document.head.appendChild(link);
    }

    const btn = createRailBtn();
    const panel = createPanel();
    const modal = createRecurrenceModal();
    const deleteModal = createDeleteModal();
    const ctxMenu = createCtxMenu();
    document.body.appendChild(panel);
    document.body.appendChild(modal);
    document.body.appendChild(deleteModal);
    document.body.appendChild(ctxMenu);
    migrateGoals();

    // Always mount the button as a fixed-position element at the body level so it
    // lives OUTSIDE GCal's stacking context. This guarantees pointer-events are never
    // intercepted by GCal's own overlays/backdrops. positionRailFallback() then
    // aligns it visually with the native icon rail.
    const wrap = document.createElement('div');
    wrap.id = 'gp-rail-fallback';
    wrap.style.cssText = 'position:fixed;right:0;top:65px;z-index:10000;display:flex;flex-direction:column;align-items:center;padding:4px 0;pointer-events:none;';
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
    positionRailFallback();
    setupRailFallbackPositioner();

    wireEvents();
    setupMyGoalsUnifiedBinding();
    setupLeftSidebarGoalsMountObserver();
    renderHomeScreen();
    scheduleLeftSidebarGoalsMountAttempts();
    setupCalendarPushObserver();
    setupNativeSidebarObserver();
    setupGoalEventObserver();
    // Initial decoration pass — catches any goal events already in the DOM
    scheduleGoalEventDecoration();

    // Re-render ghost events on window resize (column widths change)
    window.addEventListener('resize', () => {
      const screen = document.getElementById('gp-screen-suggestions');
      if (screen && screen.classList.contains('active')) renderGhostEvents();
    });
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
    // Primary: find a known GCal sidebar icon and walk up to its narrow container.
    // GCal renders Tasks, Keep, Contacts etc. with these aria-labels.
    const knownLabels = ['Tasks', 'Keep', 'Contacts', 'Reminders', 'Google Keep'];
    for (const label of knownLabels) {
      const btn = document.querySelector(`[aria-label="${label}"]`);
      if (!btn) continue;
      let el = btn.parentElement;
      while (el && el !== document.body) {
        const r = el.getBoundingClientRect();
        // Rail container is narrow (20–80 px wide) and reasonably tall
        if (r.width > 20 && r.width < 80 && r.height > 80) return el;
        el = el.parentElement;
      }
    }

    // Fallback: narrow fixed/sticky strip on the far right with ≥1 child.
    return [...document.querySelectorAll('*')].find(el => {
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (s.position === 'fixed' || s.position === 'sticky')
        && r.right > window.innerWidth - 80 && r.width < 80 && el.children.length >= 1;
    }) || null;
  }

  // ── Rail button positioning ──
  // The button is always mounted as a fixed-position child of document.body so it is
  // outside GCal's stacking context (preventing click interception by GCal backdrops).
  // positionRailFallback() measures the live rail bounding rect and aligns the wrapper.
  let _railPositionTimer = null;

  function positionRailFallback() {
    const wrap = document.getElementById('gp-rail-fallback');
    if (!wrap) return;
    const rail = findRailByStructure();
    if (rail) {
      const r = rail.getBoundingClientRect();
      const rightPx = window.innerWidth - r.right;
      wrap.style.cssText = `position:fixed;right:${rightPx}px;top:${r.top + 4}px;width:${r.width}px;z-index:10000;display:flex;flex-direction:column;align-items:center;padding:4px 0;pointer-events:none;`;
    } else {
      const hdrH = getGCalHeaderBottom();
      wrap.style.cssText = `position:fixed;right:0;top:${hdrH}px;z-index:10000;display:flex;flex-direction:column;align-items:center;padding:4px 0;pointer-events:none;`;
    }
  }

  function setupRailFallbackPositioner() {
    const schedule = () => {
      clearTimeout(_railPositionTimer);
      _railPositionTimer = setTimeout(positionRailFallback, 200);
    };
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', positionRailFallback);
  }

  // ── Rail button ──
  function createRailBtn() {
    const btn = document.createElement('button');
    btn.id = 'gp-sidebar-btn';
    btn.title = 'Goal Planner';
    btn.setAttribute('aria-label', 'Goal Planner');
    btn.innerHTML = `<span class="material-symbols-outlined gp-ms-icon">flag</span>`;
    // Attach the listener directly on the element so it survives being moved in the DOM.
    btn.addEventListener('click', () => togglePanel());
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
            <span class="material-symbols-outlined gp-ms-icon">close</span>
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
              <span class="material-symbols-outlined gp-ms-icon">arrow_back</span>
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
            </button>
            <button class="gp-confirm-chip" id="gp-confirm-ends">
              <span class="gp-confirm-chip-label"></span>
            </button>
          </div>
          <div class="gp-field" style="margin-top:20px;">
            <div class="gp-section-header">
              <span class="gp-section-label">Suggested Sessions</span>
            </div>
            <div id="gp-suggestions-list"></div>
          </div>
          <div class="gp-pref-time-section" id="gp-pref-time-section">
            <div class="gp-pref-time-header">
              <span class="gp-section-label">Set custom time</span>
              <span class="gp-std-time-hint">optional</span>
            </div>
            <input type="time" id="gp-pref-time-input" class="gp-pref-time-input" />
          </div>
          <div class="gp-action-group" style="margin-top:12px;">
            <button class="gp-btn-primary gp-btn-full gp-btn-calendar" id="gp-confirm-add">Create goal</button>
            <div class="gp-toast" id="gp-toast"><span class="material-symbols-outlined gp-ms-icon" style="font-size:15px;color:#137333;vertical-align:text-bottom;font-variation-settings:'opsz' 20,'wght' 400,'FILL' 1,'GRAD' 0">check_circle</span> Sessions added to your calendar!</div>
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
          <button class="gp-cal-nav" id="gp-cal-prev" type="button"><span class="material-symbols-outlined gp-ms-icon" style="font-size:20px">chevron_left</span></button>
          <span class="gp-cal-month-year" id="gp-cal-month-year"></span>
          <button class="gp-cal-nav" id="gp-cal-next" type="button"><span class="material-symbols-outlined gp-ms-icon" style="font-size:20px">chevron_right</span></button>
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
        <span class="material-symbols-outlined gp-ms-icon" style="font-size:18px">edit</span>
        Edit goal
      </button>
      <div class="gp-ctx-divider"></div>
      <button class="gp-ctx-item" data-ctx-action="delete" role="menuitem">
        <span class="material-symbols-outlined gp-ms-icon" style="font-size:18px">delete</span>
        Delete goal
      </button>`;
    return menu;
  }

  // ── Wire all events ──
  function wireEvents() {
    // Rail btn click is wired in createRailBtn() to survive DOM moves.
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
    document.getElementById('gp-rec-done').addEventListener('click', () => {
      void saveRecurrence();
    });
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
    initPrefTimePicker();
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
    // Prime the starting position with the live rail width, then clear the inline
    // style so the CSS .open rule (transform: translateX(0)) can take effect.
    if (!panel.classList.contains('open')) {
      panel.style.transform = `translateX(calc(100% + ${railW}px))`;
      void panel.offsetWidth; // force reflow — commits start position before transition
      panel.style.transform = '';
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
    clearGoalCreationPreview();
  }

  // ── Screen routing ──
  function showScreen(name) {
    ['home','form','suggestions'].forEach(s => {
      document.getElementById(`gp-screen-${s}`).classList.toggle('active', s === name);
    });
    if (name === 'home') {
      clearGoalCreationPreview();
      renderHomeScreen();
    } else if (name === 'form') {
      clearGoalCreationPreview();
    }
  }

  // ── Google Calendar left sidebar — collapsible "My goals" (read-only progress; unified state only) ──
  const GP_LEFT_GOALS_COLLAPSED_KEY = 'gp_left_goals_collapsed';

  function gpSkipForSidebarScan(el) {
    return el && el.closest && el.closest('#gp-panel, #gp-recurrence-overlay, #gp-delete-overlay, #gp-rail-fallback');
  }

  /** Scrollable left drawer that lists calendars (contains "My calendars" etc.). */
  function findGCalLeftSidebarScrollEl() {
    const main = document.querySelector('[role="main"]');
    const mainLeft = main ? main.getBoundingClientRect().left : window.innerWidth;

    for (const el of document.querySelectorAll('div')) {
      if (gpSkipForSidebarScan(el)) continue;
      const st = window.getComputedStyle(el);
      if (st.overflowY !== 'auto' && st.overflowY !== 'scroll' && st.overflow !== 'auto' && st.overflow !== 'scroll')
        continue;
      if (el.scrollHeight <= el.clientHeight + 32) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 80 || r.width > 560) continue;
      if (r.height < 120) continue;
      if (r.left > Math.min(mainLeft + 40, 400)) continue;
      const tx = (el.textContent || '');
      if (!/My calendars|Other calendars|Booking pages|Booking insights?|Time insights?/i.test(tx)) continue;
      return el;
    }
    return null;
  }

  function findSidebarSectionTopBlock(scrollEl, regex) {
    for (const child of scrollEl.children) {
      if (gpSkipForSidebarScan(child)) continue;
      if (child.id === 'gp-gcal-sidebar-goals-root') continue;
      if (regex.test(child.textContent || '')) return child;
    }
    return null;
  }

  function insertGoalsSectionIntoSidebarScroll(scrollEl, root) {
    const booking = findSidebarSectionTopBlock(scrollEl, /Booking pages|Booking insights?/i);
    const other = findSidebarSectionTopBlock(scrollEl, /Other calendars/i);
    const after = booking || other;
    if (after && after.parentElement === scrollEl) {
      if (after.nextElementSibling) scrollEl.insertBefore(root, after.nextElementSibling);
      else scrollEl.appendChild(root);
    } else scrollEl.appendChild(root);
  }

  /** Labels for native accordion section headers (Calendar locale / naming). */
  const NATIVE_SIDEBAR_SECTION_LABEL_RES = [
    /^My calendars$/i,
    /^Other calendars$/i,
    /booking\s*pages/i,
    /booking\s*insights?/i,
    /time\s*insights?/i,
  ];

  function normalizeSidebarRowText(s) {
    return String(s || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Find a native left-drawer accordion header row to mirror (same computed layout as Booking / Calendars).
   * Preference order: role="button" rows whose visible text matches known section titles.
   */
  function findNativeCalendarSidebarAccordionRow(scrollEl) {
    if (!scrollEl) return null;
    const roleEls = scrollEl.querySelectorAll('[role="button"], button');
    for (const row of roleEls) {
      if (row.closest('#gp-gcal-sidebar-goals-root')) continue;
      const t = normalizeSidebarRowText(row.textContent);
      if (!t || t.length > 96) continue;
      if (!NATIVE_SIDEBAR_SECTION_LABEL_RES.some((re) => re.test(t))) continue;
      return row;
    }
    for (const el of scrollEl.querySelectorAll('span, div')) {
      if (el.closest('#gp-gcal-sidebar-goals-root')) continue;
      if (el.children.length) continue;
      const t = normalizeSidebarRowText(el.textContent || '');
      if (!t || t.length > 40) continue;
      if (!NATIVE_SIDEBAR_SECTION_LABEL_RES.some((re) => re.test(t))) continue;
      const row = el.closest('[role="button"]') || el.closest('button');
      if (row && scrollEl.contains(row) && row !== scrollEl) return row;
    }
    return null;
  }

  /** Left inset (px) from native row edge to section title — used to align “My goals” with Booking / Calendars. */
  function nativeSidebarTitleLeftInsetPx(rowEl) {
    if (!rowEl) return 0;
    const rr = rowEl.getBoundingClientRect();
    if (rr.width <= 0) return 0;
    for (const el of rowEl.querySelectorAll('span, div')) {
      if (!rowEl.contains(el) || el === rowEl) continue;
      const t = normalizeSidebarRowText(el.textContent || '');
      if (!t || t.length > 48 || el.querySelector('span, div, svg, button')) continue;
      if (!NATIVE_SIDEBAR_SECTION_LABEL_RES.some((re) => re.test(t))) continue;
      const tr = el.getBoundingClientRect();
      return Math.max(0, Math.round(tr.left - rr.left));
    }
    let padEl = rowEl;
    const rcs = getComputedStyle(rowEl);
    if (rcs.paddingLeft === '0px' && rcs.paddingRight === '0px' && rowEl.firstElementChild) {
      const sub = getComputedStyle(rowEl.firstElementChild);
      if (sub.paddingLeft !== '0px' || sub.paddingRight !== '0px') padEl = rowEl.firstElementChild;
    }
    const pl = parseFloat(getComputedStyle(padEl).paddingLeft);
    return Number.isFinite(pl) ? Math.round(pl) : 0;
  }

  /** Max title left inset across all native section headers in the drawer (parity when probe row is atypical). */
  function maxNativeSidebarTitleLeftInsetPx(scrollEl) {
    if (!scrollEl) return 0;
    let m = 0;
    for (const row of scrollEl.querySelectorAll('[role="button"], button')) {
      if (row.closest('#gp-gcal-sidebar-goals-root')) continue;
      const t = normalizeSidebarRowText(row.textContent || '');
      if (!t || t.length > 96) continue;
      if (!NATIVE_SIDEBAR_SECTION_LABEL_RES.some((re) => re.test(t))) continue;
      m = Math.max(m, nativeSidebarTitleLeftInsetPx(row));
    }
    return m;
  }

  function nativeSidebarNestedTriggers(rowEl) {
    if (!rowEl) return [];
    return [...rowEl.querySelectorAll('[role="button"], button')].filter((n) => {
      if (n === rowEl || !rowEl.contains(n)) return false;
      let d = 0;
      let p = n;
      while (p && p !== rowEl) {
        d++;
        p = p.parentElement;
      }
      return d > 0 && d <= 4;
    });
  }

  /** Pixels from rightmost nested trigger to row’s right edge (matches native trailing padding). */
  function nativeSidebarTrailingPaddingPx(rowEl) {
    const nested = nativeSidebarNestedTriggers(rowEl);
    const rowRect = rowEl.getBoundingClientRect();
    if (rowRect.width <= 0 || !nested.length) return 0;
    let maxIconRight = rowRect.left;
    for (const b of nested) {
      const br = b.getBoundingClientRect();
      if (br.right > maxIconRight) maxIconRight = br.right;
    }
    return Math.max(0, Math.round(rowRect.right - maxIconRight));
  }

  function maxNativeSidebarTrailingPaddingPx(scrollEl) {
    if (!scrollEl) return 0;
    let m = 0;
    for (const row of scrollEl.querySelectorAll('[role="button"], button')) {
      if (row.closest('#gp-gcal-sidebar-goals-root')) continue;
      const t = normalizeSidebarRowText(row.textContent || '');
      if (!t || t.length > 96) continue;
      if (!NATIVE_SIDEBAR_SECTION_LABEL_RES.some((re) => re.test(t))) continue;
      m = Math.max(m, nativeSidebarTrailingPaddingPx(row));
    }
    return m;
  }

  function findNativeSectionContentSibling(headerRef, scrollEl) {
    if (!headerRef || !scrollEl) return null;
    let sib = headerRef.nextElementSibling;
    if (sib && scrollEl.contains(sib) && !gpSkipForSidebarScan(sib) && sib.id !== 'gp-gcal-sidebar-goals-root') {
      return sib;
    }
    const p = headerRef.parentElement;
    if (p && scrollEl.contains(p) && p !== scrollEl) {
      const kids = [...p.children];
      const idx = kids.indexOf(headerRef);
      if (idx >= 0 && kids[idx + 1] && scrollEl.contains(kids[idx + 1])) return kids[idx + 1];
    }
    return null;
  }

  /** Largest duration (ms) from a computed transition-duration (may be comma-separated). */
  function gpMaxTransitionDurationMs(transitionDuration) {
    if (!transitionDuration || transitionDuration === '0s') return 0;
    return Math.max(
      ...transitionDuration.split(',').map((x) => {
        const s = x.trim();
        if (s.endsWith('ms')) return parseFloat(s) || 0;
        if (s.endsWith('s')) return (parseFloat(s) || 0) * 1000;
        return 0;
      }),
      0
    );
  }

  /**
   * Copy computed layout + typography from a native sidebar accordion row onto our root as CSS variables.
   * Does not alter native DOM or change goal/calendar behavior — visual alignment only.
   */
  function syncMyGoalsSidebarChromeFromNative() {
    const root = document.getElementById('gp-gcal-sidebar-goals-root');
    const scroll = findGCalLeftSidebarScrollEl();
    if (!root || !root.isConnected || !scroll) return;

    const ref = findNativeCalendarSidebarAccordionRow(scroll);
    if (!ref) return;

    root.style.removeProperty('--gp-native-root-ml');
    root.style.removeProperty('--gp-native-root-mr');

    const setVar = (name, val) => {
      if (val == null || val === '' || val === 'auto' || val === 'normal') return;
      root.style.setProperty(name, String(val));
    };

    const cs = getComputedStyle(ref);
    const rr = ref.getBoundingClientRect();

    const nestedClickables = [...ref.querySelectorAll('[role="button"], button')].filter((n) => {
      if (n === ref || !ref.contains(n)) return false;
      let d = 0;
      let p = n;
      while (p && p !== ref) {
        d++;
        p = p.parentElement;
      }
      return d > 0 && d <= 4;
    });

    const pane = findNativeSectionContentSibling(ref, scroll);

    function pickNativeAddTrigger(nodes) {
      for (const b of nodes) {
        const al = (b.getAttribute('aria-label') || '').toLowerCase();
        if (/\badd\b/i.test(al) || /create|new\s/i.test(al)) return b;
        const mat = b.querySelector('.material-symbols-outlined, .google-symbols, .google-material-icons, span');
        const mt = mat ? String(mat.textContent || '').trim().toLowerCase() : '';
        if (mt === 'add' || mt === '+') return b;
      }
      return null;
    }
    const addBtnHost = pickNativeAddTrigger(nestedClickables);
    const chevronBtnHost =
      nestedClickables.length === 0
        ? null
        : nestedClickables.length === 1
          ? nestedClickables[0]
          : nestedClickables.filter((b) => b !== addBtnHost).pop() || nestedClickables[nestedClickables.length - 1];

    let padEl = ref;
    if (cs.paddingLeft === '0px' && cs.paddingRight === '0px' && ref.firstElementChild) {
      const sub = getComputedStyle(ref.firstElementChild);
      if (sub.paddingLeft !== '0px' || sub.paddingRight !== '0px') padEl = ref.firstElementChild;
    }
    const pcs = getComputedStyle(padEl);

    setVar('--gp-native-font-family', cs.fontFamily);

    let titleEl = null;
    for (const el of ref.querySelectorAll('span, div')) {
      if (!ref.contains(el) || el === ref) continue;
      const t = normalizeSidebarRowText(el.textContent || '');
      if (!t || t.length > 48 || el.querySelector('span, div, svg, button')) continue;
      if (!NATIVE_SIDEBAR_SECTION_LABEL_RES.some((re) => re.test(t))) continue;
      titleEl = el;
      break;
    }

    let plVal = pcs.paddingLeft;
    let prVal = pcs.paddingRight;
    const maxPlAcross = maxNativeSidebarTitleLeftInsetPx(scroll);
    let plNum = Math.max(maxPlAcross, parseFloat(pcs.paddingLeft) || 0);
    if (titleEl && rr.width > 0) {
      const plMeas = Math.round(titleEl.getBoundingClientRect().left - rr.left);
      plNum = Math.max(plNum, plMeas);
    }
    if (plNum >= 8) plVal = `${Math.round(plNum)}px`;
    const maxPrAcross = maxNativeSidebarTrailingPaddingPx(scroll);
    let prNum = Math.max(maxPrAcross, parseFloat(pcs.paddingRight) || 0);
    if (nestedClickables.length && rr.width > 0) {
      let maxIconRight = rr.left;
      for (const b of nestedClickables) {
        const br = b.getBoundingClientRect();
        if (br.right > maxIconRight) maxIconRight = br.right;
      }
      prNum = Math.max(prNum, Math.round(rr.right - maxIconRight));
    }
    if (prNum >= 4) prVal = `${Math.round(prNum)}px`;
    setVar('--gp-native-header-pl', plVal);
    setVar('--gp-native-header-pr', prVal);
    if (cs.marginLeft && cs.marginLeft !== '0px') setVar('--gp-native-root-ml', cs.marginLeft);
    if (cs.marginRight && cs.marginRight !== '0px') setVar('--gp-native-root-mr', cs.marginRight);

    const ptUse =
      (cs.paddingTop && cs.paddingTop !== '0px') || (cs.paddingBottom && cs.paddingBottom !== '0px')
        ? cs.paddingTop
        : pcs.paddingTop;
    const pbUse =
      (cs.paddingTop && cs.paddingTop !== '0px') || (cs.paddingBottom && cs.paddingBottom !== '0px')
        ? cs.paddingBottom
        : pcs.paddingBottom;
    setVar('--gp-native-header-pt', ptUse);
    setVar('--gp-native-header-pb', pbUse);

    root.style.removeProperty('--gp-native-header-min-height');
    let minH = '';
    if (cs.minHeight && cs.minHeight !== '0px' && cs.minHeight !== 'auto') minH = cs.minHeight;
    else if (pcs.minHeight && pcs.minHeight !== '0px' && pcs.minHeight !== 'auto')
      minH = pcs.minHeight.replace(/\s*min-content\s*/i, '').trim();
    if (minH && minH !== 'auto') setVar('--gp-native-header-min-height', minH);

    root.style.removeProperty('--gp-native-body-pad-top');
    root.style.removeProperty('--gp-native-body-pad-bottom');
    if (pane && scroll.contains(pane)) {
      const panCs = getComputedStyle(pane);
      setVar('--gp-native-body-pad-top', panCs.paddingTop);
      setVar('--gp-native-body-pad-bottom', panCs.paddingBottom);
    }
    if (cs.gap && cs.gap !== 'normal') setVar('--gp-native-header-gap', cs.gap);
    setVar('--gp-native-header-align', cs.alignItems);

    const mhPx = /([\d.]+)\s*px/i.exec(String(minH || `${Math.max(24, Math.round(rr.height))}px`));
    const mhNum = (mhPx ? parseFloat(mhPx[1]) : Math.max(24, Math.round(rr.height))) || 48;
    const brToken = String(cs.borderRadius || '0').trim().split(/[\s/]/)[0];
    const brParsed = parseFloat(brToken.replace(/px$/i, '')) || 0;
    if (cs.borderRadius && cs.borderRadius !== '0px') {
      if (brParsed >= mhNum / 2 - 1) setVar('--gp-native-header-br', cs.borderRadius);
      else setVar('--gp-native-header-br', `${Math.max(20, Math.round(mhNum / 2))}px`);
    } else {
      setVar('--gp-native-header-br', `${Math.max(20, Math.round(mhNum / 2))}px`);
    }

    if (titleEl) {
      const ts = getComputedStyle(titleEl);
      setVar('--gp-native-title-font-size', ts.fontSize);
      setVar('--gp-native-title-font-weight', ts.fontWeight);
      setVar('--gp-native-title-line-height', ts.lineHeight);
      setVar('--gp-native-title-letter-spacing', ts.letterSpacing);
      setVar('--gp-native-title-font-family', ts.fontFamily);
    } else {
      setVar('--gp-native-title-font-size', cs.fontSize);
      setVar('--gp-native-title-font-weight', cs.fontWeight);
      setVar('--gp-native-title-line-height', cs.lineHeight);
      setVar('--gp-native-title-letter-spacing', cs.letterSpacing);
    }

    root.style.removeProperty('--gp-native-add-btn-w');
    root.style.removeProperty('--gp-native-add-btn-h');
    root.style.removeProperty('--gp-native-add-btn-br');
    root.style.removeProperty('--gp-native-add-btn-margin');
    root.style.removeProperty('--gp-native-add-bg-transition');
    root.style.removeProperty('--gp-native-add-icon-font-size');
    root.style.removeProperty('--gp-native-add-icon-lh');
    root.style.removeProperty('--gp-native-add-icon-weight');
    root.style.removeProperty('--gp-native-add-icon-fvs');

    const iconProbe = chevronBtnHost || addBtnHost || nestedClickables[0];
    if (iconProbe) {
      const r = iconProbe.getBoundingClientRect();
      const bcs = getComputedStyle(iconProbe);
      setVar('--gp-native-icon-btn-w', `${Math.round(r.width)}px`);
      setVar('--gp-native-icon-btn-h', `${Math.round(r.height)}px`);
      setVar('--gp-native-icon-btn-br', bcs.borderRadius);
      setVar('--gp-native-icon-btn-margin', bcs.margin);
      if (bcs.transition && gpMaxTransitionDurationMs(bcs.transitionDuration) > 0) {
        setVar('--gp-native-icon-bg-transition', bcs.transition);
      }
      const glyph = iconProbe.querySelector('svg, .google-symbols, [class*="google-material"], span, i');
      if (glyph) {
        const gcs = getComputedStyle(glyph);
        if (gcs.fontSize && gcs.fontSize !== '0px') setVar('--gp-native-icon-font-size', gcs.fontSize);
        if (gcs.lineHeight && gcs.lineHeight !== '0px') setVar('--gp-native-icon-lh', gcs.lineHeight);
        if (gcs.fontWeight) setVar('--gp-native-icon-font-weight', gcs.fontWeight);
        if (gcs.fontVariationSettings && gcs.fontVariationSettings !== 'normal')
          setVar('--gp-native-icon-fvs', gcs.fontVariationSettings);
      }
    }

    if (addBtnHost) {
      if (addBtnHost !== iconProbe) {
        const ar = addBtnHost.getBoundingClientRect();
        const abcs = getComputedStyle(addBtnHost);
        setVar('--gp-native-add-btn-w', `${Math.round(ar.width)}px`);
        setVar('--gp-native-add-btn-h', `${Math.round(ar.height)}px`);
        setVar('--gp-native-add-btn-br', abcs.borderRadius);
        setVar('--gp-native-add-btn-margin', abcs.margin);
        if (abcs.transition && gpMaxTransitionDurationMs(abcs.transitionDuration) > 0) {
          setVar('--gp-native-add-bg-transition', abcs.transition);
        }
      }
      const ag = addBtnHost.querySelector('svg, .google-symbols, [class*="google-material"], span, i');
      if (ag) {
        const ags = getComputedStyle(ag);
        if (ags.fontSize && ags.fontSize !== '0px') setVar('--gp-native-add-icon-font-size', ags.fontSize);
        if (ags.lineHeight && ags.lineHeight !== '0px') setVar('--gp-native-add-icon-lh', ags.lineHeight);
        if (ags.fontWeight) setVar('--gp-native-add-icon-weight', ags.fontWeight);
        if (ags.fontVariationSettings && ags.fontVariationSettings !== 'normal')
          setVar('--gp-native-add-icon-fvs', ags.fontVariationSettings);
      }
    }

    const cluster =
      nestedClickables.length && nestedClickables[0].parentElement !== ref
        ? nestedClickables[0].parentElement
        : null;
    if (cluster && ref.contains(cluster)) {
      const cls = getComputedStyle(cluster);
      if (cls.display === 'flex' || cls.display === 'inline-flex') {
        if (cls.gap && cls.gap !== 'normal') setVar('--gp-native-actions-gap', cls.gap);
        setVar('--gp-native-actions-align', cls.alignItems);
      }
    }

    if (cs.cursor) setVar('--gp-native-cursor', cs.cursor);

    let headerBgTrans = '';
    const headerDur = gpMaxTransitionDurationMs(cs.transitionDuration);
    const headerTp = (cs.transitionProperty || '').toLowerCase();
    const refTransIncludesBg = headerDur > 0 && /\b(all|background|background-color)\b/.test(headerTp);
    if (headerDur > 0 && refTransIncludesBg) {
      if (cs.transition && !/^all\s+0s\b/i.test(cs.transition.trim())) {
        headerBgTrans = cs.transition;
      } else {
        headerBgTrans = [cs.transitionProperty, cs.transitionDuration, cs.transitionTimingFunction, cs.transitionDelay]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }

    let chevTrans = '';
    for (const el of ref.querySelectorAll('*')) {
      const st = getComputedStyle(el);
      if (gpMaxTransitionDurationMs(st.transitionDuration) === 0) continue;
      const tp = (st.transitionProperty || '').toLowerCase();
      if (!chevTrans && /\btransform\b/.test(tp)) chevTrans = st.transition;
      if (!headerBgTrans && /\bbackground(-color)?\b/.test(tp)) headerBgTrans = st.transition;
      if (chevTrans && headerBgTrans) break;
    }
    if (headerBgTrans) setVar('--gp-native-header-bg-transition', headerBgTrans);
    if (chevTrans) setVar('--gp-native-chevron-transition', chevTrans);

    let collapseMode = 'instant';
    if (pane && scroll.contains(pane)) {
      const ps = getComputedStyle(pane);
      const pDur = gpMaxTransitionDurationMs(ps.transitionDuration);
      const props = (ps.transitionProperty || '')
        .split(',')
        .map((x) => x.trim().toLowerCase());
      const canMirror =
        pDur > 0 &&
        ps.transition &&
        !/^all\s+0s\b/i.test(ps.transition.trim()) &&
        props.some((p) =>
          [
            'max-height',
            'height',
            'opacity',
            'grid-template-rows',
            'flex',
            'flex-basis',
            'transform',
            'padding',
            'padding-top',
            'padding-bottom',
            'margin',
            'margin-top',
            'margin-bottom',
          ].some((k) => p === k || p.startsWith(`${k}`))
        );
      if (canMirror) {
        setVar('--gp-native-pane-transition', ps.transition);
        if (ps.overflow && ps.overflow !== 'visible') setVar('--gp-native-pane-overflow', ps.overflow);
        collapseMode = 'css';
      }
    }
    root.dataset.gpCollapseMode = collapseMode;

    root.dataset.gpNativeSidebarSyncTs = String(Date.now());
  }

  function buildLeftSidebarGoalsSection() {
    const root = document.createElement('div');
    root.id = 'gp-gcal-sidebar-goals-root';
    root.className = 'gp-gcal-sidebar-goals-root';
    root.dataset.gpCollapseMode = 'instant';

    const header = document.createElement('div');
    header.className = 'gp-gcal-sidebar-section-header';

    const labelBtn = document.createElement('button');
    labelBtn.type = 'button';
    labelBtn.className = 'gp-gcal-sidebar-label-btn';
    labelBtn.textContent = 'My goals';
    labelBtn.setAttribute('aria-expanded', 'true');
    labelBtn.setAttribute('aria-controls', 'gp-gcal-sidebar-goals-cards');

    const actions = document.createElement('div');
    actions.className = 'gp-gcal-sidebar-actions';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'gp-gcal-sidebar-icon-btn gp-gcal-sidebar-add-btn';
    addBtn.setAttribute('aria-label', 'Add goal');
    addBtn.setAttribute('title', 'Add goal');
    addBtn.innerHTML =
      '<span class="material-symbols-outlined gp-gcal-sidebar-header-icon" aria-hidden="true">add</span>';

    const chevronBtn = document.createElement('button');
    chevronBtn.type = 'button';
    chevronBtn.className = 'gp-gcal-sidebar-icon-btn gp-gcal-sidebar-chevron-btn';
    chevronBtn.setAttribute('aria-label', 'Expand or collapse My goals');
    chevronBtn.setAttribute('aria-expanded', 'true');
    chevronBtn.setAttribute('aria-controls', 'gp-gcal-sidebar-goals-cards');
    chevronBtn.innerHTML =
      '<span class="material-symbols-outlined gp-gcal-sidebar-header-icon gp-gcal-sidebar-chevron-icon"' +
      ' aria-hidden="true">expand_less</span>';

    actions.append(addBtn, chevronBtn);
    header.append(labelBtn, actions);

    const body = document.createElement('div');
    body.className = 'gp-gcal-sidebar-section-body';
    body.id = 'gp-gcal-sidebar-goals-cards';
    body.setAttribute('aria-live', 'polite');

    const chevronGlyph = chevronBtn.querySelector('.gp-gcal-sidebar-chevron-icon');

    function applyCollapsed(collapsed) {
      root.classList.toggle('gp-gcal-sidebar-collapsed', collapsed);
      const exp = String(!collapsed);
      labelBtn.setAttribute('aria-expanded', exp);
      chevronBtn.setAttribute('aria-expanded', exp);
      if (chevronGlyph) chevronGlyph.textContent = collapsed ? 'expand_more' : 'expand_less';
      try {
        chrome.storage.local.set({ [GP_LEFT_GOALS_COLLAPSED_KEY]: collapsed });
      } catch (_) {
        /* ignore */
      }
    }

    function toggle() {
      applyCollapsed(!root.classList.contains('gp-gcal-sidebar-collapsed'));
    }

    header.addEventListener('click', (e) => {
      if (e.target.closest('.gp-gcal-sidebar-add-btn')) return;
      toggle();
    });

    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetEditMode();
      openPanel();
      showScreen('form');
    });

    labelBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
    chevronBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });

    chrome.storage.local.get([GP_LEFT_GOALS_COLLAPSED_KEY], (d) => {
      if (!root.isConnected) return;
      if (d[GP_LEFT_GOALS_COLLAPSED_KEY]) applyCollapsed(true);
    });

    root.append(header, body);
    return root;
  }

  /** Mount (or re-mount) the extension sidebar block into Google Calendar’s left stack. */
  function mountLeftSidebarGoalsSection() {
    let root = document.getElementById('gp-gcal-sidebar-goals-root');
    if (root && root.isConnected) {
      syncMyGoalsSidebarChromeFromNative();
      requestAnimationFrame(() => syncMyGoalsSidebarChromeFromNative());
      return root;
    }

    const scroll = findGCalLeftSidebarScrollEl();
    if (!scroll) return null;

    if (root) root.remove();
    root = buildLeftSidebarGoalsSection();
    insertGoalsSectionIntoSidebarScroll(scroll, root);
    syncMyGoalsSidebarChromeFromNative();
    requestAnimationFrame(() => syncMyGoalsSidebarChromeFromNative());
    return root;
  }

  let _leftSidebarGoalsMountTimer = null;
  let _leftSidebarGoalsMo = null;

  function scheduleLeftSidebarGoalsMountAttempts() {
    const run = () => {
      mountLeftSidebarGoalsSection();
      renderMyGoalsProgressPanel();
    };
    run();
    requestAnimationFrame(run);
    setTimeout(run, 500);
    setTimeout(run, 1500);
    setTimeout(run, 3500);
  }

  function scheduleLeftSidebarGoalsMount() {
    if (_leftSidebarGoalsMountTimer) clearTimeout(_leftSidebarGoalsMountTimer);
    _leftSidebarGoalsMountTimer = setTimeout(() => {
      _leftSidebarGoalsMountTimer = null;
      mountLeftSidebarGoalsSection();
      renderMyGoalsProgressPanel();
    }, 400);
  }

  function setupLeftSidebarGoalsMountObserver() {
    if (_leftSidebarGoalsMo) return;
    _leftSidebarGoalsMo = new MutationObserver(() => scheduleLeftSidebarGoalsMount());
    _leftSidebarGoalsMo.observe(document.body, { childList: true, subtree: true });
  }

  function escapeHtmlGp(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderMyGoalsProgressPanelFromState(unifiedState) {
    mountLeftSidebarGoalsSection();
    const el = document.getElementById('gp-gcal-sidebar-goals-cards');
    const root = document.getElementById('gp-gcal-sidebar-goals-root');
    if (!el || !root) return;

    const goals = unifiedState && Array.isArray(unifiedState.goals) ? unifiedState.goals : [];
    root.hidden = false;

    if (!goals.length) {
      el.innerHTML =
        '<p class="gp-gcal-mgg-empty">No goals yet. Use <strong>+</strong> above to create one in Goal Planner.</p>';
      return;
    }

    el.innerHTML = goals
      .map((g) => {
        const sessions = g.sessions || [];
        const total = sessions.length;
        const done = sessions.filter((s) => s.completed).length;
        const pct = Math.max(
          0,
          Math.min(
            100,
            typeof g.progressPct === 'number'
              ? g.progressPct
              : total
                ? Math.round((done / total) * 100)
                : 0
          )
        );
        const title = escapeHtmlGp(g.title || 'Untitled goal');
        return (
          `<article class="gp-gcal-mgg-card" role="group" aria-label="${title}, ${done} of ${total} sessions complete">` +
          `<div class="gp-gcal-mgg-eyebrow">Goal progress</div>` +
          `<div class="gp-mgg-row-head">` +
          `<span class="gp-mgg-title">${title}</span>` +
          `<span class="gp-mgg-count">${done}/${total} sessions</span>` +
          `</div>` +
          `<div class="gp-progress-bar" aria-hidden="true"><div class="gp-progress-fill" style="width:${pct}%"></div></div>` +
          `</article>`
        );
      })
      .join('');
  }

  async function renderMyGoalsProgressPanel() {
    const Model = globalThis.GoalPlannerModel;
    if (!Model) {
      renderMyGoalsProgressPanelFromState({ goals: [] });
      return;
    }
    const state = await Model.loadUnifiedState();
    renderMyGoalsProgressPanelFromState(state);
  }

  function setupMyGoalsUnifiedBinding() {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.goalPlannerUnifiedState) return;
        renderMyGoalsProgressPanel();
      });
    } catch (_) {
      /* ignore */
    }
  }

  // ── Home screen ──
  async function renderHomeScreen() {
    const Model = globalThis.GoalPlannerModel;
    const unifiedSnapshot = Model ? await Model.loadUnifiedState() : { goals: [] };
    renderMyGoalsProgressPanelFromState(unifiedSnapshot);

    const goals     = await getGoals();
    const completed = await new Promise(r => chrome.storage.local.get(['gp_chip_done'], d => r(d.gp_chip_done || {})));
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
      const daysLeft = Math.max(0, Math.ceil((deadline - now) / 86400000));
      // Use completion-based progress when the user has started checking off sessions;
      // fall back to time-elapsed progress for goals with no completions yet.
      const totalSessions    = (g.calEventIds || []).length;
      const completedCount   = totalSessions > 0
        ? (g.calEventIds || []).filter(id => !!completed[id]).length
        : 0;
      const pct = totalSessions > 0 && completedCount > 0
        ? Math.min(100, Math.round((completedCount / totalSessions) * 100))
        : Math.min(100, Math.round((elapsed / totalDays) * 100));
      return `<div class="gp-goal-row" data-goal-id="${g.id}">
        <div class="gp-goal-row-main">
          <div class="gp-goal-row-info">
            <p class="gp-goal-chip-name"><span class="material-symbols-outlined gp-ms-icon" style="font-size:13px;vertical-align:middle;margin-right:3px">flag</span>${g.title}</p>
            <p class="gp-goal-chip-sub">${g.scheduleLabel} · ${daysLeft}d left</p>
          </div>
          <button class="gp-goal-kebab" data-goal-id="${g.id}" aria-label="More options" title="More options">
            <span class="material-symbols-outlined gp-ms-icon" style="font-size:18px">more_vert</span>
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
    addBtn.innerHTML = `<span class="material-symbols-outlined gp-ms-icon" style="font-size:16px">add</span> Add another goal`;
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
  async function saveRecurrence() {
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

    const suggScr = document.getElementById('gp-screen-suggestions');
    if (suggScr?.classList.contains('active')) {
      await refreshSuggestionsPreview();
    }
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
    resetPrefTimeInput();
    const sessionCount = Math.max(1, r.days.length);
    renderSkeletons(sessionCount);

    // Fetch freebusy data and generate calendar-aware suggestions (in-memory preview only)
    try {
      state.suggestions = await computePreviewSuggestions(r);
    } catch (e) {
      console.warn('GoalPlanner: suggestion preview failed', e);
      state.suggestions = generateFallbackSuggestions(r);
    }
    _originalSuggestions = state.suggestions.map(s => ({ ...s }));
    renderSuggestions();
  }

  /** Regenerate suggestion list + ghost overlays after recurrence changes on Screen 3. */
  async function refreshSuggestionsPreview() {
    if (!state.recurrence) return;
    const r = state.recurrence;
    const sessionCount = Math.max(1, (r.days && r.days.length) || 1);
    renderSkeletons(sessionCount);
    removeGhostEvents();

    try {
      state.suggestions = await computePreviewSuggestions(r);
    } catch (e) {
      console.warn('GoalPlanner: suggestion preview failed', e);
      state.suggestions = generateFallbackSuggestions(r);
    }
    _originalSuggestions = state.suggestions.map(s => ({ ...s }));
    resetPrefTimeInput();

    const dayNames = { SU:'Sun', MO:'Mon', TU:'Tue', WE:'Wed', TH:'Thu', FR:'Fri', SA:'Sat' };
    const dayStr = (r.days || []).map(d => dayNames[d]).join(', ');
    const schedLabel = r.every === 1 ? `Weekly on ${dayStr}` : `Every ${r.every} ${r.period}s on ${dayStr}`;
    let endsLabel = 'Never ends';
    if (r.ends === 'on' && r.endDate) {
      endsLabel = `Ends ${formatDate(r.endDate)}`;
    } else if (r.ends === 'after') {
      endsLabel = `Ends after ${r.occurrences} sessions`;
    }
    updateConfirmChips(schedLabel, endsLabel);
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
    if (!state.suggestions.length) {
      list.innerHTML = `<div class="gp-sessions-empty">No sessions remaining — <button class="gp-sessions-empty-link" id="gp-sessions-empty-back">edit settings</button></div>`;
      document.getElementById('gp-sessions-empty-back').addEventListener('click', openRecurrence);
      renderGhostEvents();
      return;
    }
    list.innerHTML = state.suggestions.map((s, i) => `
      <div class="gp-session-card">
        <button class="gp-session-remove" data-idx="${i}" aria-label="Remove session">
          <span class="material-symbols-outlined">close</span>
        </button>
        <p class="gp-session-name">${s.date}</p>
        <p class="gp-session-time">${s.startTime} – ${s.endTime}</p>
      </div>`).join('');
    list.querySelectorAll('.gp-session-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        state.suggestions.splice(idx, 1);
        if (_originalSuggestions.length > idx) _originalSuggestions.splice(idx, 1);
        renderSuggestions();
      });
    });
    renderGhostEvents();
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

  function resetPrefTimeInput() {
    const input = document.getElementById('gp-pref-time-input');
    if (input) input.value = '';
  }

  function initPrefTimePicker() {
    const input = document.getElementById('gp-pref-time-input');
    if (!input) return;
    input.addEventListener('change', () => {
      if (!input.value) {
        // Restore algorithmically-chosen times
        state.suggestions = _originalSuggestions.map(s => ({ ...s }));
        renderSuggestions();
        return;
      }
      const [h, min] = input.value.split(':').map(Number);
      applyStandardTime(h, min);
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

      clearGoalCreationPreview();
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
    const datePop = document.getElementById('gp-date-popover');
    if (datePop) datePop.style.display = 'none';
    const endDateChip = document.getElementById('gp-end-date-chip');
    if (endDateChip) endDateChip.classList.remove('active');
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

  // ── Goal Session Chip Injection ──
  // Queries [data-eventchip] on each mutation, matches goal events by 🎯 in title,
  // injects .ext-goal-root decoration; checkbox clicks use GoalInteractionController (document capture delegation).

  /* Active session — coral accent; completed — Google muted grays (#5f6368 / #80868b) */
  const SVG_CHECK_ACTIVE  = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8" stroke="#D3564B" stroke-width="1.75" fill="#fff"/><polyline points="6,10 8.5,12.5 14,7.5" stroke="#D3564B" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const SVG_CIRCLE_ACTIVE = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8" stroke="#D3564B" stroke-width="1.75" fill="none"/></svg>';
  const SVG_CHECK_DONE = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8" stroke="#e79992" stroke-width="1.75" fill="#fff"/><polyline points="6,10 8.5,12.5 14,7.5" stroke="#e79992" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /** Optional: set true in DevTools to trace checkbox hits vs propagation. */
  const GP_GOAL_CLICK_DEBUG = false;
  /** Log if content script loads twice and tries to double-bind document capture. */
  const GP_GOAL_LISTENER_GUARD_DEBUG = false;

  /**
   * GoalInteractionController — single document-level delegation for goal checkboxes.
   * One listener, one stable bound reference, guarded against duplicate content-script inits.
   * Capture phase runs before GCal handlers that stopPropagation on [data-eventchip].
   */
  const GoalInteractionController = {
    _installed: false,
    _boundDocClick: null,

    install() {
      if (window.__gpGoalChipClickDelegationInstalled) {
        if (GP_GOAL_LISTENER_GUARD_DEBUG) {
          console.warn('[GoalPlanner] Goal checkbox delegation already present; duplicate bind skipped.');
        }
        this._installed = true;
        return;
      }
      if (this._installed) return;
      this._installed = true;
      window.__gpGoalChipClickDelegationInstalled = true;
      this._boundDocClick = this._onDocumentClickCapture.bind(this);
      document.addEventListener('click', this._boundDocClick, true);
    },

    _onDocumentClickCapture(e) {
      if (e.button !== 0 && e.button !== undefined) return;

      const checkbox = e.target.closest('.goal-checkbox, [data-gp-checkbox].ext-check-circle');
      if (!checkbox) return;

      const chip = checkbox.closest('[data-eventchip]');
      if (!chip || !chip.querySelector('.ext-goal-root')) return;

      const root = checkbox.closest('.ext-goal-root');
      if (!root || root.closest('[data-eventchip]') !== chip) return;

      const chipKey = chip.dataset.gpChipKey;
      if (!chipKey) return;

      if (GP_GOAL_CLICK_DEBUG) {
        console.log('[GoalPlanner] checkbox click', {
          target: e.target,
          checkbox,
          chipKey,
          bubbles: e.bubbles,
        });
      }

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      this.toggleCompletion(chipKey, chip);
    },

    /**
     * Pure UI sync: chip.extension completed state ↔ class + checkbox glyph only.
     * Native GCal nodes are never touched.
     */
    applyGoalSessionCompletionUI(chip, isDone) {
      const done = !!isDone;
      chip.classList.remove('ext-goal-done');
      chip.classList.toggle('ext-goal-completed', done);
      if (done) chip.dataset.goalCompleted = 'true';
      else delete chip.dataset.goalCompleted;
      const circle = chip.querySelector('.goal-checkbox') || chip.querySelector('.ext-check-circle');
      if (circle) circle.innerHTML = done ? SVG_CHECK_DONE : SVG_CIRCLE_ACTIVE;
    },

    toggleCompletion(chipKey, chip) {
      const nextDone = !chip.classList.contains('ext-goal-completed');
      this.applyGoalSessionCompletionUI(chip, nextDone);

      chrome.storage.local.get(['gp_chip_done'], d => {
        const map = { ...(d.gp_chip_done || {}) };
        if (nextDone) map[chipKey] = true;
        else delete map[chipKey];
        const eventId =
          chip.closest('[data-eventid]')?.getAttribute('data-eventid') || chipKey;
        chrome.storage.local.set({ gp_chip_done: map }, () => {
          globalThis.GoalCalendarSync?.persistSessionCompleted?.(eventId, nextDone)?.catch?.(
            () => {}
          );
        });
        chrome.runtime.sendMessage({ type: 'GOAL_TOGGLE', id: chipKey, complete: nextDone });
      });

      renderHomeScreen();
    },
  };

  GoalInteractionController.install();

  /**
   * After move/resize release, GCal applies the final slot in its own handlers.
   * We must patch .ext-goal-time only AFTER that commit (bubble phase + next frames).
   */
  function commitGoalTimeLabelAfterDrop(chip) {
    if (!chip?.querySelector?.('.ext-goal-time')) return;
    const patch = () => syncExtGoalTimeFromContainer(chip);
    patch();
    queueMicrotask(patch);
    requestAnimationFrame(() => {
      patch();
      requestAnimationFrame(() => {
        patch();
        globalThis.GoalCalendarSync?.flushPersistSessionGeometry?.(chip)?.catch?.(() => {});
      });
    });
  }

  /** Move-drag end hook: bubble-phase pointer/mouse up = after GCal commits position. */
  let _gpGoalTimeLabelDragSyncInstalled = false;
  function installGoalTimeLabelLiveDragSync() {
    if (_gpGoalTimeLabelDragSyncInstalled) return;
    _gpGoalTimeLabelDragSyncInstalled = true;

    document.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        if (e.target.closest?.('.goal-checkbox, .ext-check-circle')) return;
        const ec = e.target.closest?.('[data-eventid]');
        if (!ec?.querySelector?.('[data-eventchip].ext-goal-chip .ext-goal-root')) return;
        const chip = ec.querySelector('[data-eventchip].ext-goal-chip');
        if (!chip?.querySelector?.('.ext-goal-root')) return;

        if (chip._gpGoalDragEndHandler) chip._gpGoalDragEndHandler();

        chip._gpGoalDragActive = true;

        const teardownMove = () => {
          if (chip._gpGoalDragMoveRaf != null) {
            cancelAnimationFrame(chip._gpGoalDragMoveRaf);
            chip._gpGoalDragMoveRaf = null;
          }
          const mv = chip._gpGoalDragMoveHandler;
          if (mv) document.removeEventListener('pointermove', mv, true);
          chip._gpGoalDragMoveHandler = null;
        };

        const endDrag = () => {
          if (!chip._gpGoalDragActive) return;
          chip._gpGoalDragActive = false;

          const en = chip._gpGoalDragEndHandler;
          if (en) {
            document.removeEventListener('pointerup', en, false);
            document.removeEventListener('pointercancel', en, false);
            document.removeEventListener('mouseup', en, false);
            document.removeEventListener('lostpointercapture', en, false);
          }
          chip._gpGoalDragEndHandler = null;

          teardownMove();
          commitGoalTimeLabelAfterDrop(chip);
        };

        const onMove = () => {
          if (chip._gpGoalDragMoveRaf != null) return;
          chip._gpGoalDragMoveRaf = requestAnimationFrame(() => {
            chip._gpGoalDragMoveRaf = null;
            syncExtGoalTimeFromContainer(chip);
            globalThis.GoalCalendarSync?.schedulePersistSessionGeometry?.(chip);
          });
        };

        chip._gpGoalDragMoveHandler = onMove;
        chip._gpGoalDragEndHandler = endDrag;

        document.addEventListener('pointermove', onMove, { passive: true, capture: true });
        // Bubble phase so GCal drop runs first; then we read finalized DOM.
        document.addEventListener('pointerup', endDrag, false);
        document.addEventListener('pointercancel', endDrag, false);
        document.addEventListener('mouseup', endDrag, false);
        document.addEventListener('lostpointercapture', endDrag, false);
      },
      true
    );
  }

  installGoalTimeLabelLiveDragSync();

  function toggleGoalComplete(chipKey, chip) {
    GoalInteractionController.toggleCompletion(chipKey, chip);
  }

  // ── Bound the chip's rendered height to match its GCal event container ──
  //
  // The chip element ([data-eventchip]) lives inside [data-eventid], which GCal
  // sizes to the event's duration via inline styles (the same container the
  // ResizeObserver in attachChipResizeObserver already watches).  We read that
  // container's rendered height and stamp it directly onto the chip as an inline
  // height so no CSS percentage-height resolution is needed.
  //
  // requestAnimationFrame guarantees the measurement runs after the browser has
  // resolved GCal's layout for that frame, so getBoundingClientRect().height is
  // always the final computed value, not a transitional or zero value.
  //
  function boundChipHeight(chip) {
    const container = chip.closest('[data-eventid]');
    if (!container) return;
    requestAnimationFrame(() => {
      const h = container.getBoundingClientRect().height;
      if (h > 0) chip.style.height = h + 'px';
    });
  }

  /** Regex for clock-style ranges in GCal aria labels and chip text. */
  const GP_TIME_RANGE_RE =
    /(\d{1,2}(?::\d{2})?\s*(?:AM|PM)\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i;

  function extractTimeRangeLabelForGoalChip(chip) {
    if (!chip) return null;
    const ec = chip.closest('[data-eventid]');
    const tryStr = (s) => {
      if (s == null || s === '') return null;
      const m = String(s).match(GP_TIME_RANGE_RE);
      return m ? m[1] : null;
    };
    for (const el of [ec, chip].filter(Boolean)) {
      const hit =
        tryStr(el.getAttribute?.('aria-label')) ||
        tryStr(el.getAttribute?.('data-tooltip')) ||
        tryStr(el.getAttribute?.('title'));
      if (hit) return hit;
    }
    const walkRoot = ec && chip && ec.contains(chip) ? ec : chip;
    const walker = document.createTreeWalker(walkRoot, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.parentElement) return NodeFilter.FILTER_REJECT;
        if (node.parentElement.closest('.ext-goal-root')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let node;
    while ((node = walker.nextNode())) {
      const hit = tryStr(node.textContent.trim());
      if (hit) return hit;
    }
    if (ec) {
      const jsNameEl =
        ec.querySelector('[jsname="tKELmd"]') ||
        ec.querySelector('[jsname="r4nke"]') ||
        ec.querySelector('.gVNoLb') ||
        ec.querySelector('.Jmftzc');
      if (jsNameEl && !jsNameEl.closest('.ext-goal-root')) {
        const hit = tryStr(jsNameEl.textContent.trim());
        if (hit) return hit;
      }
    }
    return null;
  }

  function goalChipTimeLabelMutationRelevant(m) {
    const t = m.target;
    if (t.nodeType === Node.TEXT_NODE) {
      return !t.parentElement?.closest('.ext-goal-root');
    }
    if (t.nodeType === Node.ELEMENT_NODE) {
      return !t.closest('.ext-goal-root');
    }
    return true;
  }

  /**
   * Patch only .ext-goal-time text. Always resolves [data-eventid] from chip so
   * updates still work after GCal reparents the chip during drag.
   */
  function syncExtGoalTimeFromContainer(chip) {
    const timeEl = chip?.querySelector?.('.ext-goal-time');
    if (!timeEl) return '';
    const extracted = extractTimeRangeLabelForGoalChip(chip);
    if (extracted && timeEl.textContent !== extracted) timeEl.textContent = extracted;
    const h = chip.getBoundingClientRect().height;
    timeEl.style.display = h > 0 && h < 42 ? 'none' : 'block';
    return extracted || '';
  }

  // ── Write inner DOM structure into a chip element ──
  //
  // ADDITIVE INJECTION — we never call innerHTML = '' or remove any GCal child.
  //
  // Root cause of prior resize failure:
  //   The old approach tried to save GCal resize handles via
  //   querySelectorAll('[class*="resize"]') before clearing innerHTML.
  //   GCal uses minified class names (e.g. "pMmPse", "YXgurf") — none contain
  //   the literal string "resize".  The selector returned zero matches every
  //   time, so chip.innerHTML = '' destroyed every handle and its native
  //   mousedown listener.  The sibling-hiding code had the identical selector
  //   bug, so any handles at the [data-eventid] level were also visibility:hidden.
  //
  // Fix: inject our content as an absolutely-positioned overlay (pointer-events:none).
  //   GCal's entire child list — resize handles, drag layers, all of it — is
  //   left completely untouched.  Mouse events that don't land on our checkbox
  //   fall through the overlay to GCal's native elements below.
  //
  function injectGoalChipContent(chip, goalData, isDone) {
    // Idempotent: remove only our decoration root; never clear native chip children.
    // Suppress the per-chip MutationObserver during intentional reinjection so
    // removing/re-adding .ext-goal-root does not schedule restoreChip (which
    // would race storage and clear completion — see GoalInteractionController).
    chip._gpDecorLock = true;
    try {
      chip.querySelector('.ext-goal-root')?.remove();

      chip.classList.add('ext-goal-chip');
      chip.classList.remove('ext-goal-done');
      chip.classList.toggle('ext-goal-completed', isDone);
      chip.dataset.gpChipKey = goalData.chipKey;
      if (isDone) chip.dataset.goalCompleted = 'true';
      else delete chip.dataset.goalCompleted;

      const root = document.createElement('div');
      root.className = 'ext-goal-root';
      const initialTime = goalData.time ? escHtml(goalData.time) : '';
      root.innerHTML =
        '<div class="goal-checkbox ext-check-circle" data-gp-checkbox="true" role="button" tabindex="-1" aria-label="Toggle goal session complete">' +
        (isDone ? SVG_CHECK_DONE : SVG_CIRCLE_ACTIVE) + '</div>' +
        '<div class="ext-goal-text-col">' +
          '<span class="ext-goal-badge">Goal</span>' +
          '<span class="ext-goal-title">' + escHtml(goalData.title) + '</span>' +
          '<span class="ext-goal-time">' + initialTime + '</span>' +
        '</div>';

      // Append last — GCal's original children (resize handles etc.) remain in
      // the child list before ours and keep their native event listeners.
      chip.appendChild(root);

      boundChipHeight(chip);

      const ec = chip.closest('[data-eventid]');
      requestAnimationFrame(() => {
        syncExtGoalTimeFromContainer(chip);
      });
    } finally {
      // Clear after mutation observer microtasks run (macrotask > microtask).
      setTimeout(() => { chip._gpDecorLock = false; }, 0);
    }
  }

  // ── Attach resize watchers to detect GCal drag-resize and update displayed duration ──
  //
  // Three-track approach that mirrors native GCal timed-event resize UX:
  //
  //  Track 1 — MutationObserver on the persistent [data-eventchip] subtree
  //    (attributes, native text, childList).  A captured [data-eventid] can be
  //    detached or stale during move-drag; the chip node identity stays stable.
  //
  //  Track 2 — ResizeObserver (pixel-based live duration)
  //    GCal changes the inline height of [data-eventid] during a drag.  We
  //    read the new height, convert to minutes via getGridMetrics() (same
  //    pxPerHour constant used by the ghost-event renderer), and show a live
  //    "X hr Y min" label.  This is the fallback when GCal hasn't yet updated
  //    the aria-label mid-drag.  Storage is written only after the resize
  //    settles (400 ms debounce) to avoid thrashing chrome.storage.
  //
  //  Track 3 — mousedown on the GCal resize handle
  //    Adds .ext-goal-resizing (translucent + outline) while the drag is live,
  //    removed on mouseup.  Passes through to GCal's own handler without
  //    preventDefault so native snapping / min-duration / bounds all work.
  //
  function attachChipResizeObserver(chip, goalData) {
    const eventContainer = chip.closest('[data-eventid]');
    if (!eventContainer) return;

    // Disconnect any previous observers attached to this chip
    chip._resizeObserver?.disconnect();
    chip._resizeMutAttrObs?.disconnect();
    if (chip._gpLabelSyncRaf != null) {
      cancelAnimationFrame(chip._gpLabelSyncRaf);
      chip._gpLabelSyncRaf = null;
    }

    // ── Track 1: subtree mutations → rAF-coalesced label sync (move + resize) ──
    const scheduleLabelSync = () => {
      if (chip._gpLabelSyncRaf != null) return;
      chip._gpLabelSyncRaf = requestAnimationFrame(() => {
        chip._gpLabelSyncRaf = null;
        syncExtGoalTimeFromContainer(chip);
      });
    };
    const labelObs = new MutationObserver((mutations) => {
      if (!mutations.some(goalChipTimeLabelMutationRelevant)) return;
      scheduleLabelSync();
    });
    labelObs.observe(chip, {
      attributes: true,
      attributeFilter: ['aria-label', 'data-tooltip', 'title'],
      characterData: true,
      childList: true,
      subtree: true,
    });
    chip._resizeMutAttrObs = labelObs;

    // ── Track 2: ResizeObserver — pixel-based live duration + debounced persistence ──
    const resizeObserver = new ResizeObserver(() => {
      const ecLive = chip.closest('[data-eventid]');
      if (!ecLive) return;
      const containerH = ecLive.getBoundingClientRect().height;

      if (containerH > 0) chip.style.height = containerH + 'px';

      const metrics = getGridMetrics();
      if (metrics && metrics.pxPerHour > 0) {
        const rawMins = (containerH / metrics.pxPerHour) * 60;
        const durationMins = Math.max(15, Math.round(rawMins / 15) * 15);
        const timeEl = chip.querySelector('.ext-goal-time');
        if (timeEl) {
          timeEl.textContent = formatDuration(durationMins);
          timeEl.style.display = containerH < 42 ? 'none' : 'block';
        }
      }
      syncExtGoalTimeFromContainer(chip);
      globalThis.GoalCalendarSync?.schedulePersistSessionGeometry?.(chip);

      clearTimeout(chip._resizeDebounce);
      chip._resizeDebounce = setTimeout(() => {
        chip.classList.remove('ext-goal-resizing');

        const ecDone = chip.closest('[data-eventid]');
        const containerHFinal = ecDone ? ecDone.getBoundingClientRect().height : 0;
        const newTime = syncExtGoalTimeFromContainer(chip);

        chrome.storage.local.get(['goalStates'], (result) => {
          const states = result.goalStates || {};
          if (states[goalData.id]) {
            states[goalData.id].time = newTime;
            chrome.storage.local.set({ goalStates: states });
          }
        });

        chrome.runtime.sendMessage({
          type: 'GOAL_RESIZE',
          id: goalData.id,
          newTime,
          newHeight: containerHFinal,
        });

        globalThis.GoalCalendarSync?.flushPersistSessionGeometry?.(chip)?.catch?.(() => {});

        console.log('GOAL RESIZE SETTLED — new time:', newTime, 'height:', containerHFinal);
      }, 400);
    });

    resizeObserver.observe(chip);
    if (document.documentElement.contains(eventContainer)) resizeObserver.observe(eventContainer);
    chip._resizeObserver = resizeObserver;

    // ── Track 3: resize-handle mousedown — enter visual "resizing" state ──
    // passive:true so we never delay GCal's own pointer handling
    eventContainer.addEventListener('mousedown', (e) => {
      if (!e.target.closest('[class*="resize"], [data-resizehandle]')) return;
      chip.classList.add('ext-goal-resizing');
      // Clean up on mouseup regardless of where pointer is released
      document.addEventListener('mouseup', () => {
        chip.classList.remove('ext-goal-resizing');
      }, { once: true, passive: true });
    }, { passive: true });
  }

  // ── Re-inject only when GCal removes our overlay root (no storage-driven UI flapping here) ──
  function restoreChip(chip, goalData) {
    if (chip.querySelector('.ext-goal-root')) return;
    chrome.storage.local.get(['gp_chip_done'], d => {
      if (chip.querySelector('.ext-goal-root')) return;
      const doneMap = d.gp_chip_done || {};
      const isDone = !!doneMap[goalData.chipKey];
      injectGoalChipContent(chip, goalData, isDone);
    });
  }

  // ── Forensic diagnostic: log chip DOM structure and pointer-event state ──
  // Flip GP_DEBUG to true in DevTools (or here) to get a full readout.
  const GP_DEBUG = false;

  function debugChipStructure(chip, phase) {
    if (!GP_DEBUG) return;
    const container = chip.closest('[data-eventid]') || chip.parentElement;
    console.group(`[GoalPlanner] ${phase} — chipKey=${chip.dataset.gpChipKey || '(unkeyed)'}`);

    console.log('chip node:', chip);
    console.log('chip.children:', chip.children.length, 'items');
    Array.from(chip.children).forEach((c, i) => {
      const cs = window.getComputedStyle(c);
      const r  = c.getBoundingClientRect();
      console.log(
        `  child[${i}]`,
        `tag=${c.tagName} class="${c.className}"`,
        `rect={t:${r.top.toFixed(0)},h:${r.height.toFixed(0)}}`,
        `pe=${cs.pointerEvents} vis=${cs.visibility} z=${cs.zIndex}`,
        c
      );
    });

    if (container && container !== chip) {
      console.log('container siblings:');
      Array.from(container.children).forEach((c, i) => {
        if (c === chip) return;
        const cs = window.getComputedStyle(c);
        const r  = c.getBoundingClientRect();
        console.log(
          `  sibling[${i}]`,
          `tag=${c.tagName} class="${c.className}"`,
          `rect={t:${r.top.toFixed(0)},h:${r.height.toFixed(0)}}`,
          `pe=${cs.pointerEvents} vis=${cs.visibility} z=${cs.zIndex}`,
          c
        );
      });

      // elementFromPoint probe at the resize zone (bottom 6 px of event container)
      const cr = container.getBoundingClientRect();
      if (cr.height > 0) {
        const probeX = cr.left + cr.width / 2;
        const probeY = cr.bottom - 4;
        const topEl  = document.elementFromPoint(probeX, probeY);
        console.log(
          `elementFromPoint at resize zone (${probeX.toFixed(0)}, ${probeY.toFixed(0)}):`,
          topEl
        );
        if (topEl) {
          const cs = window.getComputedStyle(topEl);
          console.log(`  → class="${topEl.className}" pe=${cs.pointerEvents} cursor=${cs.cursor}`);
        }
      }
    }
    console.groupEnd();
  }

  // One-time global mousedown logger — logs every mousedown target so you can
  // confirm resize handles are reachable.  Runs only when GP_DEBUG is true and
  // only once per page load (cleaned up after first goal-chip resize attempt).
  let _debugMousedownActive = false;
  function setupDebugMousedownLogger() {
    if (!GP_DEBUG || _debugMousedownActive) return;
    _debugMousedownActive = true;
    document.addEventListener('mousedown', (e) => {
      const ec = e.target.closest('[data-eventid]');
      if (!ec) return;
      const cs = window.getComputedStyle(e.target);
      console.log(
        '[GoalPlanner] mousedown target:',
        e.target,
        `class="${e.target.className}"`,
        `pe=${cs.pointerEvents} cursor=${cs.cursor}`,
        `pos=(${e.clientX.toFixed(0)},${e.clientY.toFixed(0)})`
      );
    }, { capture: true });
  }

  function processGoalChips() {
    chrome.storage.local.get(['gp_chip_done'], async (data) => {
      const doneMap = data.gp_chip_done || {};
      const goals   = await getGoals();

      document.querySelectorAll('[data-eventchip]').forEach(chip => {
        if (!chip.textContent.includes('🎯')) return;

        // Dedup guard — inner structure already injected; sync done state and
        // re-bound the chip height in case GCal reflowed (e.g. window resize,
        // navigation, panel open/close changes column widths).
        if (chip.querySelector('.ext-goal-root')) {
          boundChipHeight(chip);
          const isDone = !!doneMap[chip.dataset.gpChipKey];
          GoalInteractionController.applyGoalSessionCompletionUI(chip, isDone);
          const ec = chip.closest('[data-eventid]');
          requestAnimationFrame(() => syncExtGoalTimeFromContainer(chip));
          return;
        }

        // Extract title and time from GCal's original DOM
        const spans = chip.querySelectorAll('span');
        const title = (spans[0] ? spans[0].textContent : chip.textContent).replace(/🎯\s*/g, '').trim();

        // Time extraction — walk every known GCal DOM pattern
        const eventContainer = chip.closest('[data-eventid]') || chip.closest('[data-eventchip]') || chip.parentElement;
        let time = '';

        // Pattern 1: aria-label on the event container (most reliable across GCal versions)
        const ariaLabel = eventContainer?.getAttribute('aria-label') || '';
        const ariaMatch = ariaLabel.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM)\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
        if (ariaMatch) time = ariaMatch[1];

        // Pattern 2: data-tooltip on the container
        if (!time) {
          const tooltip = eventContainer?.getAttribute('data-tooltip') || '';
          const tooltipMatch = tooltip.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM)\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
          if (tooltipMatch) time = tooltipMatch[1];
        }

        // Pattern 3: title attribute on the container
        if (!time) {
          const titleAttr = eventContainer?.getAttribute('title') || '';
          const titleMatch = titleAttr.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM)\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
          if (titleMatch) time = titleMatch[1];
        }

        // Pattern 4: walk all text nodes inside the event container
        if (!time) {
          const walker = document.createTreeWalker(eventContainer, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            const t = node.textContent.trim();
            const m = t.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM)\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
            if (m) { time = m[1]; break; }
          }
        }

        // Pattern 5: known GCal jsname/class selectors for time elements
        if (!time) {
          const jsNameEl = eventContainer?.querySelector('[jsname="tKELmd"]')
            || eventContainer?.querySelector('[jsname="r4nke"]')
            || eventContainer?.querySelector('.gVNoLb')
            || eventContainer?.querySelector('.Jmftzc');
          if (jsNameEl) time = jsNameEl.textContent.trim();
        }

        console.log('GOAL CHIP — aria-label:', ariaLabel);
        console.log('GOAL CHIP — extracted time:', time);
        console.log('GOAL CHIP — extracted title:', title);

        // Derive a stable key: prefer GCal's event ID, then goal id + text
        const eid  = chip.closest('[data-eventid]') && chip.closest('[data-eventid]').getAttribute('data-eventid');
        const goal = goals.find(g => chip.textContent.includes(g.title));
        const chipKey = eid || (goal ? goal.id + ':' + chip.textContent.trim().slice(0, 40) : 'tx:' + chip.textContent.trim().slice(0, 50));

        const goalData = { title, time, chipKey, id: goal ? goal.id : null };
        const isDone = !!doneMap[chipKey];

        debugChipStructure(chip, 'BEFORE injection');
        setupDebugMousedownLogger();
        injectGoalChipContent(chip, goalData, isDone);
        // rAF ensures layout is settled before the post-injection probe runs
        requestAnimationFrame(() => debugChipStructure(chip, 'AFTER injection'));
        attachChipResizeObserver(chip, goalData);

        // Per-chip observer: restore only when GCal removes our overlay root — not
        // on every subtree change (checkbox SVG swap used to call restoreChip and
        // race gp_chip_done writes, reverting .ext-goal-completed immediately).
        let restoreTimeout = null;
        new MutationObserver((mutations) => {
          if (chip._gpDecorLock) return;
          let needsRestore = false;
          for (const m of mutations) {
            if (m.type !== 'childList') continue;
            m.removedNodes.forEach((node) => {
              if (node.nodeType !== 1) return;
              if (
                node.classList?.contains('ext-goal-root') ||
                node.querySelector?.('.ext-goal-root')
              ) {
                console.warn(
                  '[GoalPlanner] Extension decoration (.ext-goal-root) removed by external DOM mutation; will restore.'
                );
                needsRestore = true;
              }
            });
          }
          if (!chip.querySelector('.ext-goal-root')) needsRestore = true;
          if (!needsRestore) return;
          clearTimeout(restoreTimeout);
          restoreTimeout = setTimeout(() => restoreChip(chip, goalData), 16);
        }).observe(chip, { childList: true, subtree: true });

        // Sibling elements within [data-eventid] are NOT touched.
        // The prior code applied visibility:hidden to siblings that didn't match
        // [class*="resize"] — but GCal's class names are minified so that guard
        // never fired, causing resize handles to be hidden along with everything
        // else.  With the additive overlay approach our visual content covers
        // GCal's original chip content, so no sibling manipulation is needed.
      });
    });
  }

  // Debounced scheduler — prevents thrashing on rapid DOM mutations
  let _gpDecorateTimer = null;
  function scheduleGoalEventDecoration() {
    if (_gpDecorateTimer) clearTimeout(_gpDecorateTimer);
    _gpDecorateTimer = setTimeout(processGoalChips, 200);
  }

  // Watch for new chips added by GCal and re-process; disconnect all observers for removed chips
  function setupGoalEventObserver() {
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.removedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          const chips = node.classList?.contains('ext-goal-chip')
            ? [node]
            : Array.from(node.querySelectorAll?.('.ext-goal-chip') || []);
          chips.forEach(c => {
            c._resizeObserver?.disconnect();
            c._resizeMutAttrObs?.disconnect();
            if (c._gpLabelSyncRaf != null) {
              cancelAnimationFrame(c._gpLabelSyncRaf);
              c._gpLabelSyncRaf = null;
            }
            if (c._gpGoalDragEndHandler) c._gpGoalDragEndHandler();
          });
        });
      }
      scheduleGoalEventDecoration();
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ── Boot ──
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(inject, 1000);
      setTimeout(scheduleLeftSidebarGoalsMount, 800);
      // Re-render ghost events after GCal week/month navigation
      setTimeout(() => {
        const screen = document.getElementById('gp-screen-suggestions');
        if (screen && screen.classList.contains('active')) renderGhostEvents();
      }, 1200);
      // Re-apply goal session decorations after navigation (GCal re-renders all chips)
      setTimeout(scheduleGoalEventDecoration, 1400);
    }
  }).observe(document.body, { childList: true, subtree: true });

})();
