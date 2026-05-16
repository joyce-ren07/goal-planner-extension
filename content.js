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
  let _gpGhostCueRaf = 0;
  /** Ghost under pointer for “Planned” tooltip cue (interaction only; no Goal state). */
  let _gpGhostTipEl = null;

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
    if (_gpGhostTipEl?.classList) {
      try {
        _gpGhostTipEl.classList.remove('gp-ghost-tip-active');
      } catch (_) {
        /* ignore */
      }
      _gpGhostTipEl = null;
    }
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

  /** ── Goal creation ghost preview (in-memory only; never persisted) ── */

  function readRecurrenceDraftFromOverlay() {
    const ov = document.getElementById('gp-recurrence-overlay');
    if (!ov?.classList.contains('open')) return null;
    const every = parseInt(document.getElementById('gp-freq-num')?.value, 10) || 1;
    const period = document.getElementById('gp-freq-period')?.value || 'week';
    const days = [...document.querySelectorAll('#gp-recurrence-overlay .gp-day-btn.selected')]
      .map((b) => b.dataset.day)
      .filter(Boolean);
    const sessionMins = parseInt(document.getElementById('gp-session-mins')?.value, 10) || 60;
    const endsVal =
      ov.querySelector('input[name="gp-ends"]:checked')?.value || 'on';
    const endDate = document.getElementById('gp-end-date')?.value || '';
    const occurrences = parseInt(document.getElementById('gp-occurrences')?.value, 10) || 13;
    return {
      every,
      period,
      days,
      sessionMins,
      ends: endsVal,
      endDate,
      occurrences,
    };
  }

  /** Parsed preferred time from Screen 3 (ghost preview only — not persisted). */
  function prefTimeFromInputHMOrNull() {
    const raw = document.getElementById('gp-pref-time-input')?.value?.trim();
    if (!raw) return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (!Number.isFinite(h) || !Number.isFinite(min) || min < 0 || min > 59 || h < 0 || h > 23)
      return null;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  /** Recurrence shaping current ghost preview — overlay wins when open, else state.recurrence (+ defaults). */
  function resolveRecurrenceDraftForGhostPreview() {
    const sugActive =
      document.getElementById('gp-screen-suggestions')?.classList.contains('active');
    const prefT = sugActive ? prefTimeFromInputHMOrNull() : null;
    const fallbackTime = prefT || '09:00';

    const fromOv = readRecurrenceDraftFromOverlay();
    if (fromOv) return { ...fromOv, time: fallbackTime };
    if (state.recurrence) return { ...state.recurrence, time: fallbackTime };
    /** Form screen before “Done”: match goToSuggestions() default shape. */
    return {
      every: 1,
      period: 'week',
      days: ['MO', 'WE', 'FR'],
      sessionMins: 60,
      ends: 'on',
      endDate: defaultEndDate(),
      occurrences: 13,
      time: fallbackTime,
    };
  }

  function dateAtLocalMidnight(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function mondayAlignedTs(d) {
    const x = dateAtLocalMidnight(d);
    const dow = x.getDay();
    const monOff = dow === 0 ? -6 : 1 - dow;
    x.setDate(x.getDate() + monOff);
    return x.getTime();
  }

  /**
   * Build { isoStart, isoEnd } for each ghost block on calendar columns visible now.
   * Pure function — reads only recurrence draft + DOM column geometry (already used for ghosts).
   */
  function computeEphemeralGhostSessionsForVisibleDays(rIn) {
    const r = rIn;
    const days = Array.isArray(r.days) ? r.days : [];
    const dayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

    const cols = findDayColumnPositions();
    if (!cols.length) return [];

    const [hour, minRaw] = (r.time || '09:00').split(':').map(Number);
    const min = Number.isFinite(minRaw) ? minRaw : 0;
    const hourAdj = Number.isFinite(hour) ? hour : 9;
    const sessionMins = Math.max(15, Number(r.sessionMins) || 60);
    const every = Math.max(1, Number(r.every) || 1);
    const period = r.period || 'week';

    /** Daily uses column stepping; week/month need at least one weekday. */
    if (period !== 'day' && !days.length) return [];

    let endCap = null;
    if (r.ends === 'on' && r.endDate) endCap = new Date(r.endDate + 'T23:59:59');

    const out = [];

    /** Weekly + monthly preview: weekday filter on visible columns. */
    const matchWeekdays = () => {
      const anchorMonday = cols.length ? mondayAlignedTs(cols[0].date) : 0;
      cols.forEach((col) => {
        const dt = dateAtLocalMidnight(col.date);
        if (endCap && dt.getTime() > endCap.getTime()) return;
        const code = dayCodes[col.date.getDay()];
        if (!days.includes(code)) return;
        if (period === 'week') {
          const wm = Math.round((mondayAlignedTs(col.date) - anchorMonday) / (7 * 86400000));
          if (every > 1 && wm % every !== 0) return;
        } else if (period === 'month') {
          const mkA = cols[0].date.getFullYear() * 12 + cols[0].date.getMonth();
          const mk = col.date.getFullYear() * 12 + col.date.getMonth();
          if (every > 1 && ((mk - mkA) % every) !== 0) return;
        }
        const start = new Date(col.date);
        start.setHours(hourAdj, min, 0, 0);
        const end = new Date(start.getTime() + sessionMins * 60000);
        out.push({
          isoStart: start.toISOString(),
          isoEnd: end.toISOString(),
        });
      });
    };

    /** Daily preview: spaced by `every` days from first visible column. */
    const matchDaily = () => {
      const anchor = dateAtLocalMidnight(cols[0].date).getTime();
      cols.forEach((col) => {
        const dt = dateAtLocalMidnight(col.date);
        if (endCap && dt.getTime() > endCap.getTime()) return;
        const dd = Math.round((dt.getTime() - anchor) / 86400000);
        if (every > 1 && dd % every !== 0) return;
        const start = new Date(col.date);
        start.setHours(hourAdj, min, 0, 0);
        const end = new Date(start.getTime() + sessionMins * 60000);
        out.push({
          isoStart: start.toISOString(),
          isoEnd: end.toISOString(),
        });
      });
    };

    try {
      if (period === 'day') matchDaily();
      else matchWeekdays();
    } catch (_) {
      return [];
    }
    return out;
  }

  function ghostCreationPreviewTitlePlain() {
    const c =
      document.getElementById('gp-confirm-title-input')?.value?.trim() ||
      document.getElementById('gp-goal-title')?.value?.trim() ||
      String(state.goalTitle || '').trim();
    return c || 'Goal';
  }

  /**
   * When Goal Planner creation UI is showing, derive sessions drawn on the calendar.
   * Returns `false` when preview layer should be omitted entirely.
   */
  function deriveGhostSessionsForCreationPreviewLayer() {
    const panel = document.getElementById('gp-panel');
    if (!panel?.classList.contains('open')) return false;

    if (document.getElementById('gp-screen-home')?.classList.contains('active')) return false;

    const suggScr = document.getElementById('gp-screen-suggestions');
    const formScr = document.getElementById('gp-screen-form');
    const ovOpen = document.getElementById('gp-recurrence-overlay')?.classList.contains('open');

    if (
      !suggScr?.classList.contains('active') &&
      !formScr?.classList.contains('active') &&
      !ovOpen
    ) {
      return false;
    }

    /** Screen 3 — prefer smart suggestions when loaded; else ephemeral grid from recurrence draft. */
    if (suggScr?.classList.contains('active')) {
      if (state.suggestions?.length)
        return { sessions: state.suggestions.slice(), markNonPersisted: true };
      const rDraft = resolveRecurrenceDraftForGhostPreview();
      if (rDraft.period !== 'day' && (!rDraft.days || !rDraft.days.length))
        return { sessions: [], markNonPersisted: true };
      return {
        sessions: computeEphemeralGhostSessionsForVisibleDays(rDraft),
        markNonPersisted: true,
      };
    }

    const r = resolveRecurrenceDraftForGhostPreview();
    if (!r) return { sessions: [], markNonPersisted: true };
    if (r.period !== 'day' && (!r.days || !r.days.length))
      return { sessions: [], markNonPersisted: true };

    const sessions = computeEphemeralGhostSessionsForVisibleDays(r);
    return { sessions, markNonPersisted: true };
  }

  let _ghostPrevDebounceT = 0;
  function scheduleGhostPreviewRefreshDebounced() {
    if (_ghostPrevDebounceT) clearTimeout(_ghostPrevDebounceT);
    _ghostPrevDebounceT = setTimeout(() => {
      _ghostPrevDebounceT = 0;
      renderGhostEvents();
    }, 48);
  }

  /**
   * Stop any pending ghost repaint (previously scheduled during create flow) and clear
   * preview nodes. Does not touch `state.suggestions`/`state.recurrence` — callers that
   * still need those for Calendar POST must retain them separately from `clearGoalCreationPreview`.
   */
  function cancelDebouncedGhostPreviewAndRemoveLayers() {
    if (_ghostPrevDebounceT) {
      clearTimeout(_ghostPrevDebounceT);
      _ghostPrevDebounceT = 0;
    }
    removeGhostEvents();
  }

  /**
   * Native GCal hover tooltips attach to stacked event nodes; ghosts use pointer-events:none
   * so delegated pointermove picks the topmost element only when our preview is unobstructed —
   * then toggles `.gp-ghost-tip-active` for a CSS tooltip (“Planned”).
   */
  function initGhostPlannedHoverCue() {
    if (initGhostPlannedHoverCue._wired) return;
    initGhostPlannedHoverCue._wired = true;
    document.addEventListener(
      'pointermove',
      (e) => {
        const open = document.getElementById('gp-panel')?.classList.contains('open');
        if (!open || !document.querySelector('.goal-ghost-event')) {
          document.querySelectorAll('.goal-ghost-event.gp-ghost-tip-active').forEach((n) =>
            n.classList.remove('gp-ghost-tip-active')
          );
          _gpGhostTipEl = null;
          return;
        }

        if (_gpGhostCueRaf) cancelAnimationFrame(_gpGhostCueRaf);
        _gpGhostCueRaf = requestAnimationFrame(() => {
          _gpGhostCueRaf = 0;
          let next = null;
          try {
            const hit = document.elementsFromPoint(e.clientX, e.clientY)[0];
            if (hit?.classList?.contains('goal-ghost-event')) next = hit;
          } catch (_) {
            /* ignore */
          }
          const prev = _gpGhostTipEl;
          if (next !== prev) {
            prev?.classList?.remove?.('gp-ghost-tip-active');
            next?.classList?.add?.('gp-ghost-tip-active');
            _gpGhostTipEl = next;
          }
        });
      },
      { passive: true }
    );
  }

  function paintGhostSessionsOnGrid(sessions, finalLabel, ghostFlags) {
    removeGhostEvents();
    if (!sessions || !sessions.length) return false;

    const scrollCont = findCalendarScrollContainer();
    if (!scrollCont) return false;

    const hourPositions = findHourAbsolutePositions(scrollCont);
    if (hourPositions.length < 2) return false;

    hourPositions.sort((a, b) => a.hour - b.hour);
    const first = hourPositions[0];
    const last = hourPositions[hourPositions.length - 1];
    const pxPerHour = (last.absY - first.absY) / (last.hour - first.hour);
    if (pxPerHour <= 0) return false;
    const absYAtHour0 = first.absY - first.hour * pxPerHour;

    const dayColumns = findDayColumnPositions();
    const goalLabel = finalLabel.length > 34 ? `${finalLabel.slice(0, 33)}…` : finalLabel;

    const contRect = scrollCont.getBoundingClientRect();
    const ghostData = [];

    for (const session of sessions) {
      const start = new Date(session.isoStart);
      const end = new Date(session.isoEnd);

      const col = dayColumns.find(
        (c) =>
          c.date.getFullYear() === start.getFullYear() &&
          c.date.getMonth() === start.getMonth() &&
          c.date.getDate() === start.getDate()
      );
      if (!col) continue;

      const startMins = start.getHours() * 60 + start.getMinutes();
      const durationMin = (end - start) / 60000;
      const absTop = absYAtHour0 + (startMins / 60) * pxPerHour;
      const height = Math.max(20, (durationMin / 60) * pxPerHour);
      const left = col.left + 2;
      const width = Math.max(10, col.width - 4);
      const fixedTop = contRect.top + absTop - scrollCont.scrollTop;

      const ghost = document.createElement('div');
      ghost.className = 'goal-ghost-event';
      ghost.setAttribute('data-gp-ghost-preview', 'true');
      if (ghostFlags?.markNonPersisted) ghost.setAttribute('data-gp-ghost-ephemeral', 'true');
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

    if (!ghostData.length) return false;

    let _raf = null;
    _ghostScrollEl = scrollCont;
    _ghostScrollHandler = () => {
      if (_raf) return;
      _raf = requestAnimationFrame(() => {
        _raf = null;
        const ct = scrollCont.getBoundingClientRect().top;
        const st = scrollCont.scrollTop;
        for (const g of ghostData) g.el.style.top = `${ct + g.absTop - st}px`;
      });
    };
    scrollCont.addEventListener('scroll', _ghostScrollHandler, { passive: true });
    return true;
  }

  // ── Ghost events: render one ghost per suggestion onto the calendar grid ──
  function renderGhostEvents() {
    const layered = deriveGhostSessionsForCreationPreviewLayer();
    if (layered === false) {
      removeGhostEvents();
      return;
    }
    const sessions = layered?.sessions || [];
    if (!sessions.length) {
      removeGhostEvents();
      return;
    }
    const base = ghostCreationPreviewTitlePlain();
    const shortTitle = base.length > 22 ? `${base.slice(0, 21)}…` : base;
    const finalLabel = layered.markNonPersisted ? `Preview · ${shortTitle}` : shortTitle;
    paintGhostSessionsOnGrid(sessions, finalLabel, {
      markNonPersisted: !!layered.markNonPersisted,
    });
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
    setupCalendarCreateMenuGoalItem();
    setupMyGoalsSidebarStorageSync();
    setupGoalsSidebarReactiveBinding();
    setupLeftSidebarGoalsMountObserver();
    renderHomeScreen();
    scheduleLeftSidebarGoalsMountAttempts();
    setupCalendarPushObserver();
    setupNativeSidebarObserver();
    setupGoalEventObserver();
    // Initial decoration pass — catches any goal events already in the DOM
    scheduleGoalEventDecoration();

    setTimeout(() => {
      maybeBackfillSessionAnchorsIntoStorage();
    }, 3500);

    // Re-render ghost events on window resize (column widths change)
    window.addEventListener('resize', () => {
      const p = document.getElementById('gp-panel');
      if (p?.classList.contains('open')) renderGhostEvents();
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
    titleInput.addEventListener('input', scheduleGhostPreviewRefreshDebounced);

    // Open recurrence modal
    document.getElementById('gp-open-recurrence').addEventListener('click', openRecurrence);

    // Day buttons (in body-level modal)
    document.querySelectorAll('#gp-recurrence-overlay .gp-day-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('selected');
        scheduleGhostPreviewRefreshDebounced();
      });
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
    confirmNameInput.addEventListener('input', scheduleGhostPreviewRefreshDebounced);

    // Recurrence fields — ghost preview rerenders (presentation only).
    const recOv = document.getElementById('gp-recurrence-overlay');
    recOv.addEventListener('input', scheduleGhostPreviewRefreshDebounced);
    recOv.addEventListener('change', scheduleGhostPreviewRefreshDebounced);

    // Screen 3 — schedule chips open recurrence modal directly
    document.getElementById('gp-confirm-schedule').addEventListener('click', openRecurrence);
    document.getElementById('gp-confirm-ends').addEventListener('click', openRecurrence);

    // Screen 3 — confirm add
    document.getElementById('gp-confirm-add').addEventListener('click', confirmAddToCalendar);

    initDatePicker();
    initPrefTimePicker();
    initGhostPlannedHoverCue();
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
    scheduleGhostPreviewRefreshDebounced();
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
      scheduleGhostPreviewRefreshDebounced();
    } else if (name === 'suggestions') {
      scheduleGhostPreviewRefreshDebounced();
    }
  }

  /** Injected Create → Goal menu row — attribute marker (not a behavioral GCal hook). */
  const GP_CREATE_MENU_GOAL_ATTR = 'data-gp-create-menu-goal';

  /**
   * Google Calendar wires menu clicks via jsaction on nodes. Stripping behavioral attrs
   * from a cloned row prevents "Goal" from triggering native Event/Task actions.
   */
  function stripGCalMenuItemBehaviorAttrs(el) {
    if (!el) return;
    const purge = ['jsaction', 'jscontroller', 'jsname', 'jsshadow', 'jsmodel', '__is_owner'];
    const stack = [el];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || cur.nodeType !== Node.ELEMENT_NODE) continue;
      for (const a of purge) {
        try {
          cur.removeAttribute(a);
        } catch (_) {
          /* ignore */
        }
      }
      const sr = cur.shadowRoot && cur.shadowRoot.firstElementChild;
      if (sr) stack.push(sr);
      let c = cur.firstElementChild;
      while (c) {
        stack.push(c);
        c = c.nextElementSibling;
      }
    }
  }

  function replaceClonedMenuItemPrimaryLabel(root, label) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let n = walker.nextNode();
    while (n) {
      const t = (n.textContent || '').trim();
      if (t && /^(event|task)\b/i.test(t)) {
        n.textContent = label;
        return;
      }
      n = walker.nextNode();
    }
    const w2 = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let m = w2.nextNode();
    while (m) {
      const t = (m.textContent || '').trim();
      if (t.length >= 2 && t.length <= 64) {
        m.textContent = label;
        return;
      }
      m = w2.nextNode();
    }
  }

  function looksLikeCalendarCreateDropdownMenu(menu) {
    if (!menu || menu.getAttribute('role') !== 'menu') return false;
    if (menu.querySelector(`[${GP_CREATE_MENU_GOAL_ATTR}]`)) return false;
    const r = menu.getBoundingClientRect();
    if (!r.height || !r.width) return false;
    /** Create popover anchored under top toolbar — ignore wide context menus elsewhere. */
    if (r.top > 220 || r.left > 520 || r.width > 560) return false;
    const items = [...menu.querySelectorAll('[role="menuitem"]:not([' + GP_CREATE_MENU_GOAL_ATTR + '])')];
    if (items.length < 2 || items.length > 12) return false;
    const blob = items.map((i) => (i.textContent || '').toLowerCase()).join('|');
    return /event/.test(blob) && /task/.test(blob);
  }

  /** Same entry as left-drawer "+" / My goals → Goal Planner create (no goal logic changes). */
  function openGoalCreateFromCalendarToolbarMenu(e) {
    if (e) {
      try {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      } catch (_) {
        /* ignore */
      }
    }
    try {
      document.activeElement instanceof HTMLElement &&
        typeof document.activeElement.blur === 'function' &&
        document.activeElement.blur();
    } catch (_) {
      /* ignore */
    }
    /** Close open GCal overlays before opening our panel — standard Escape propagation. */
    try {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })
      );
    } catch (_) {
      /* ignore */
    }
    queueMicrotask(() => {
      resetEditMode();
      openPanel();
      showScreen('form');
    });
  }

  function injectGoalIntoCreateMenu(menu) {
    if (!looksLikeCalendarCreateDropdownMenu(menu)) return;
    let proto =
      [...menu.querySelectorAll('[role="menuitem"]:not([' + GP_CREATE_MENU_GOAL_ATTR + '])')].find((i) =>
        /task/i.test(i.textContent || '')
      ) ||
      [...menu.querySelectorAll('[role="menuitem"]:not([' + GP_CREATE_MENU_GOAL_ATTR + '])')].find((i) =>
        /event/i.test(i.textContent || '')
      ) ||
      menu.querySelector('[role="menuitem"]:not([' + GP_CREATE_MENU_GOAL_ATTR + '])');
    if (!proto) return;

    let row = proto.cloneNode(true);
    stripGCalMenuItemBehaviorAttrs(row);
    row.setAttribute(GP_CREATE_MENU_GOAL_ATTR, '1');
    row.setAttribute('aria-label', 'Goal');
    replaceClonedMenuItemPrimaryLabel(row, 'Goal');

    const activate = (e) => openGoalCreateFromCalendarToolbarMenu(e);
    row.addEventListener('click', activate, true);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate(e);
      }
    });

    /** Insert directly after Task (same cluster as native quick-create). */
    const taskItem =
      [...menu.querySelectorAll('[role="menuitem"]:not([' + GP_CREATE_MENU_GOAL_ATTR + '])')].find((i) =>
        /^\s*task\b/i.test((i.textContent || '').trim())
      ) || null;
    if (taskItem && taskItem.parentNode === menu)
      menu.insertBefore(row, taskItem.nextSibling);
    else menu.appendChild(row);
  }

  function scanAndInjectGoalCreateMenus() {
    document.querySelectorAll('[role="menu"]').forEach((m) => {
      try {
        injectGoalIntoCreateMenu(m);
      } catch (_) {
        /* ignore — GCal DOM variants */
      }
    });
  }

  let _gpCreateMenuObserveTimer = 0;
  function scheduleGoalCreateMenuScan() {
    if (_gpCreateMenuObserveTimer) return;
    _gpCreateMenuObserveTimer = window.setTimeout(() => {
      _gpCreateMenuObserveTimer = 0;
      scanAndInjectGoalCreateMenus();
    }, 80);
  }

  function setupCalendarCreateMenuGoalItem() {
    if (typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver(() => scheduleGoalCreateMenuScan());
    mo.observe(document.body, { childList: true, subtree: true });
    scheduleGoalCreateMenuScan();
  }

  // ── Google Calendar left sidebar — collapsible "My goals" (read-only progress; unified state only) ──
  /** @deprecated Legacy collapsed flag — superseded by GP_GOALS_ACCORDION_OPEN_KEY */
  const GP_LEFT_GOALS_COLLAPSED_KEY = 'gp_left_goals_collapsed';
  /** Persisted boolean: true = accordion expanded */
  const GP_GOALS_ACCORDION_OPEN_KEY = 'goalsAccordionOpen';

  /** Google Calendar API `colorId` → hex (event palette) */
  const GP_CALENDAR_COLOR_ID_HEX = {
    '1': '#a4bdfc',
    '2': '#7ae7bf',
    '3': '#dbadff',
    '4': '#ff887c',
    '5': '#fbd75b',
    '6': '#ffb878',
    '7': '#46d6db',
    '8': '#e1e1e1',
    '9': '#5484ed',
    '10': '#51b749',
    '11': '#dc2127',
  };

  /** Planner card / progress color (not GCal event `colorId`). */
  const GP_GOAL_DEFAULT_UI_COLOR = '#E8705A';

  /** Normalize #RGB / #RRGGBB → lowercase `#rrggbb` or `''`. */
  function normalizePlannerGoalHex(c) {
    if (c == null || c === '') return '';
    let h = String(c).trim().replace(/\s/g, '');
    if (!h.startsWith('#')) h = `#${h}`;
    h = h.toLowerCase();
    let body = h.slice(1);
    if (body.length === 3 && /^[0-9a-f]{3}$/i.test(body)) {
      body = body
        .split('')
        .map((ch) => ch + ch)
        .join('');
    }
    if (body.length === 6 && /^[0-9a-f]{6}$/i.test(body)) return `#${body}`;
    return '';
  }

  /** GCal UI / Calendar API palette hexes — treat as “wrong” for goal cards when stored as legacy `color`. */
  let _gcalPaletteHexCache = null;
  function isLikelyGcalDefaultGoalColor(hexNorm) {
    if (!hexNorm) return true;
    if (!_gcalPaletteHexCache) {
      const set = new Set(
        ['#039be5', '#4285f4', '#3f51b5', '#7986cb', '#a79b8e', '#616161'].map((x) => x.toLowerCase())
      );
      Object.values(GP_CALENDAR_COLOR_ID_HEX).forEach((hex) => {
        const n = normalizePlannerGoalHex(hex);
        if (n) set.add(n);
      });
      _gcalPaletteHexCache = set;
    }
    return _gcalPaletteHexCache.has(hexNorm);
  }

  /** Card chrome: use planner `goal.color`; never infer from `colorId` / GCal lavender-blue. */
  function getGoalDisplayColor(legacyGoal) {
    const n = normalizePlannerGoalHex(legacyGoal?.color);
    if (n && !isLikelyGcalDefaultGoalColor(n)) return n;
    return GP_GOAL_DEFAULT_UI_COLOR;
  }

  /** Blend a hex goal color toward white (avoids color-mix / CSP issues in injected styles). */
  function hexToTint(hex, amount) {
    let h = String(hex || '').trim();
    if (h.startsWith('#')) h = h.slice(1);
    if (h.length === 3) {
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    }
    if (!/^[0-9a-f]{6}$/i.test(h)) return '#fde8e4';
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const t = typeof amount === 'number' && !isNaN(amount) ? Math.max(0, Math.min(1, amount)) : 0.12;
    const blend = (c) => Math.round(c + (255 - c) * (1 - t));
    return `rgb(${blend(r)}, ${blend(g)}, ${blend(b)})`;
  }

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

  /** Native accordion header whose visible title matches `labelRe` (e.g. Booking pages). */
  function findNativeSidebarAccordionRowByLabel(scrollEl, labelRe) {
    if (!scrollEl || !labelRe) return null;
    const roleEls = scrollEl.querySelectorAll('[role="button"], button');
    for (const row of roleEls) {
      if (row.closest('#gp-gcal-sidebar-goals-root')) continue;
      const t = normalizeSidebarRowText(row.textContent || '');
      if (!t || t.length > 96) continue;
      if (!labelRe.test(t)) continue;
      return row;
    }
    for (const el of scrollEl.querySelectorAll('span, div')) {
      if (el.closest('#gp-gcal-sidebar-goals-root')) continue;
      if (el.children.length) continue;
      const t = normalizeSidebarRowText(el.textContent || '');
      if (!t || t.length > 40) continue;
      if (!labelRe.test(t)) continue;
      const row = el.closest('[role="button"]') || el.closest('button');
      if (row && scrollEl.contains(row) && row !== scrollEl) return row;
    }
    return null;
  }

  /** Add (+) control inside a native sidebar accordion header row. */
  function gpPickSidebarRowAddTrigger(nodes) {
    for (const b of nodes) {
      const al = (b.getAttribute('aria-label') || '').toLowerCase();
      if (/\badd\b/i.test(al) || /create|new\s/i.test(al)) return b;
      const mat = b.querySelector('.material-symbols-outlined, .google-symbols, .google-material-icons, span');
      const mt = mat ? String(mat.textContent || '').trim().toLowerCase() : '';
      if (mt === 'add' || mt === '+') return b;
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

  /** Native header vertical padding (px) — uses row box, then inner padEl when row has no Y padding. */
  function nativeHeaderVerticalPaddingPx(rowEl) {
    const rcs = getComputedStyle(rowEl);
    let padEl = rowEl;
    if (rcs.paddingLeft === '0px' && rcs.paddingRight === '0px' && rowEl.firstElementChild) {
      const sub = getComputedStyle(rowEl.firstElementChild);
      if (sub.paddingLeft !== '0px' || sub.paddingRight !== '0px') padEl = rowEl.firstElementChild;
    }
    const st = getComputedStyle(padEl);
    const pt =
      rcs.paddingTop && rcs.paddingTop !== '0px'
        ? parseFloat(rcs.paddingTop) || 0
        : parseFloat(st.paddingTop) || 0;
    const pb =
      rcs.paddingBottom && rcs.paddingBottom !== '0px'
        ? parseFloat(rcs.paddingBottom) || 0
        : parseFloat(st.paddingBottom) || 0;
    return { pt, pb };
  }

  /** Tightest native header density (min padding-top/bottom across drawer accordions). */
  function minNativeSidebarHeaderVerticalPaddingPx(scrollEl) {
    if (!scrollEl) return { pt: 0, pb: 0 };
    let minPt = Infinity;
    let minPb = Infinity;
    for (const row of scrollEl.querySelectorAll('[role="button"], button')) {
      if (row.closest('#gp-gcal-sidebar-goals-root')) continue;
      const t = normalizeSidebarRowText(row.textContent || '');
      if (!t || t.length > 96) continue;
      if (!NATIVE_SIDEBAR_SECTION_LABEL_RES.some((re) => re.test(t))) continue;
      const { pt, pb } = nativeHeaderVerticalPaddingPx(row);
      minPt = Math.min(minPt, pt);
      minPb = Math.min(minPb, pb);
    }
    return {
      pt: minPt === Infinity ? 0 : minPt,
      pb: minPb === Infinity ? 0 : minPb,
    };
  }

  /** Max computed padding-right on native headers (row + inner pad container) — catches outer flex padding. */
  function maxNativeSidebarHeaderPaddingRightPx(scrollEl) {
    if (!scrollEl) return 0;
    let m = 0;
    for (const row of scrollEl.querySelectorAll('[role="button"], button')) {
      if (row.closest('#gp-gcal-sidebar-goals-root')) continue;
      const t = normalizeSidebarRowText(row.textContent || '');
      if (!t || t.length > 96) continue;
      if (!NATIVE_SIDEBAR_SECTION_LABEL_RES.some((re) => re.test(t))) continue;
      const rcs = getComputedStyle(row);
      let padEl = row;
      if (rcs.paddingLeft === '0px' && rcs.paddingRight === '0px' && row.firstElementChild) {
        const sub = getComputedStyle(row.firstElementChild);
        if (sub.paddingLeft !== '0px' || sub.paddingRight !== '0px') padEl = row.firstElementChild;
      }
      const pes = getComputedStyle(padEl);
      m = Math.max(m, parseFloat(rcs.paddingRight) || 0, parseFloat(pes.paddingRight) || 0);
    }
    return m;
  }

  /** Max (scroll inner right − rightmost header icon) across native section rows — matches gutter at drawer edge. */
  function maxNativeSidebarIconToScrollInnerRightGapPx(scrollEl) {
    if (!scrollEl) return 0;
    const sr = scrollEl.getBoundingClientRect();
    const innerRight = sr.left + scrollEl.clientWidth;
    let m = 0;
    for (const row of scrollEl.querySelectorAll('[role="button"], button')) {
      if (row.closest('#gp-gcal-sidebar-goals-root')) continue;
      const t = normalizeSidebarRowText(row.textContent || '');
      if (!t || t.length > 96) continue;
      if (!NATIVE_SIDEBAR_SECTION_LABEL_RES.some((re) => re.test(t))) continue;
      const nested = nativeSidebarNestedTriggers(row);
      if (!nested.length) continue;
      let maxIconRight = sr.left;
      for (const b of nested) {
        const br = b.getBoundingClientRect();
        if (br.right > maxIconRight) maxIconRight = br.right;
      }
      m = Math.max(m, Math.round(innerRight - maxIconRight));
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

    const bookingRow = findNativeSidebarAccordionRowByLabel(scroll, /booking\s*pages/i);
    const ref = bookingRow || findNativeCalendarSidebarAccordionRow(scroll);
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

    const addBtnHost = gpPickSidebarRowAddTrigger(nestedClickables);
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
    const scrSt = getComputedStyle(scroll);
    const scrPadL = Math.round(parseFloat(scrSt.paddingLeft) || 0);
    const scrPadR = Math.round(parseFloat(scrSt.paddingRight) || 0);
    plNum = Math.max(plNum, scrPadL);

    if (plNum >= 8) plVal = `${Math.round(plNum)}px`;
    const maxPrAcross = maxNativeSidebarTrailingPaddingPx(scroll);
    const maxPrComputed = maxNativeSidebarHeaderPaddingRightPx(scroll);
    const maxPrScrollGap = maxNativeSidebarIconToScrollInnerRightGapPx(scroll);
    let prNum = Math.max(
      maxPrAcross,
      maxPrComputed,
      maxPrScrollGap,
      parseFloat(pcs.paddingRight) || 0,
      parseFloat(cs.paddingRight) || 0
    );
    if (nestedClickables.length && rr.width > 0) {
      let maxIconRight = rr.left;
      for (const b of nestedClickables) {
        const br = b.getBoundingClientRect();
        if (br.right > maxIconRight) maxIconRight = br.right;
      }
      prNum = Math.max(prNum, Math.round(rr.right - maxIconRight));
    }
    prNum = Math.max(prNum, scrPadR);
    if (prNum >= 4) prVal = `${Math.round(prNum)}px`;
    setVar('--gp-native-header-pl', plVal);
    setVar('--gp-native-header-pr', prVal);
    if (cs.marginLeft && cs.marginLeft !== '0px') setVar('--gp-native-root-ml', cs.marginLeft);
    if (cs.marginRight && cs.marginRight !== '0px') setVar('--gp-native-root-mr', cs.marginRight);

    const refVert = nativeHeaderVerticalPaddingPx(ref);
    let headerPt = refVert.pt;
    let headerPb = refVert.pb;
    if (titleEl && rr.height > 0) {
      const tr = titleEl.getBoundingClientRect();
      const slackTop = Math.max(0, Math.round(tr.top - rr.top));
      const slackBottom = Math.max(0, Math.round(rr.bottom - tr.bottom));
      headerPt = Math.min(headerPt, slackTop);
      headerPb = Math.min(headerPb, slackBottom);
    }
    setVar('--gp-native-header-pt', `${headerPt}px`);
    setVar('--gp-native-header-pb', `${headerPb}px`);

    root.style.removeProperty('--gp-native-header-min-height');
    let minH = '';
    if (cs.minHeight && cs.minHeight !== '0px' && cs.minHeight !== 'auto') minH = cs.minHeight;
    else if (pcs.minHeight && pcs.minHeight !== '0px' && pcs.minHeight !== 'auto')
      minH = pcs.minHeight.replace(/\s*min-content\s*/i, '').trim();
    if (minH && minH !== 'auto') {
      const minHp = parseFloat(String(minH).replace(/px$/i, ''));
      const rh = Math.round(rr.height);
      if (!Number.isFinite(minHp) || minHp <= rh + 2) setVar('--gp-native-header-min-height', minH);
    }

    root.style.removeProperty('--gp-native-body-pad-top');
    root.style.removeProperty('--gp-native-body-pad-bottom');
    root.style.removeProperty('--gp-native-goals-body-pl');
    root.style.removeProperty('--gp-native-goals-body-pr');
    if (pane && scroll.contains(pane)) {
      const panCs = getComputedStyle(pane);
      const panPt = parseFloat(panCs.paddingTop) || 0;
      const panPb = parseFloat(panCs.paddingBottom) || 0;
      const panPl = parseFloat(panCs.paddingLeft) || 0;
      const panPr = parseFloat(panCs.paddingRight) || 0;
      setVar('--gp-native-body-pad-top', `${Math.min(panPt, headerPt)}px`);
      setVar('--gp-native-body-pad-bottom', `${Math.min(panPb, headerPb)}px`);
      /* List bodies (calendar rows) often sit inside a pane with extra horizontal inset vs header rows alone — match that so cards don’t overrun native sections. */
      const goalsPl = Math.max(plNum, panPl);
      const goalsPr = Math.max(prNum, panPr);
      setVar('--gp-native-goals-body-pl', `${Math.round(goalsPl)}px`);
      setVar('--gp-native-goals-body-pr', `${Math.round(goalsPr)}px`);
    }
    if (cs.gap && cs.gap !== 'normal') setVar('--gp-native-header-gap', cs.gap);
    setVar('--gp-native-header-align', cs.alignItems);

    const rowH = Math.max(24, Math.round(rr.height));
    let mhNum = rowH;
    if (minH && minH !== 'auto') {
      const m = parseFloat(String(minH).replace(/px$/i, ''));
      if (Number.isFinite(m) && m <= rowH + 2) mhNum = m;
    }
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
      setVar('--gp-native-title-line-height', ts.lineHeight);
      setVar('--gp-native-title-letter-spacing', ts.letterSpacing);
      setVar('--gp-native-title-font-family', ts.fontFamily);
      if (ts.fontWeight) setVar('--gp-native-title-font-weight', ts.fontWeight);
    } else {
      setVar('--gp-native-title-font-size', cs.fontSize);
      setVar('--gp-native-title-line-height', cs.lineHeight);
      setVar('--gp-native-title-letter-spacing', cs.letterSpacing);
      if (cs.fontWeight) setVar('--gp-native-title-font-weight', cs.fontWeight);
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
        if (gcs.fontVariationSettings && gcs.fontVariationSettings !== 'normal') {
          setVar('--gp-native-icon-fvs', gcs.fontVariationSettings);
        }
        if (gcs.fontWeight) setVar('--gp-native-icon-glyph-weight', gcs.fontWeight);
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
        if (ags.fontVariationSettings && ags.fontVariationSettings !== 'normal') {
          setVar('--gp-native-add-icon-fvs', ags.fontVariationSettings);
        }
        if (ags.fontWeight) setVar('--gp-native-add-icon-weight', ags.fontWeight);
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

    root.style.removeProperty('--gp-my-goals-booking-edge-nudge');
    root.style.removeProperty('--gp-booking-add-btn-w');
    root.style.removeProperty('--gp-booking-add-btn-h');
    root.style.removeProperty('--gp-booking-add-icon-font-size');

    const goalsSectionHeader = root.querySelector('.gp-gcal-sidebar-section-header');
    if (bookingRow && goalsSectionHeader && scroll.contains(bookingRow)) {
      const delta = Math.round(
        bookingRow.getBoundingClientRect().left - goalsSectionHeader.getBoundingClientRect().left
      );
      if (Number.isFinite(delta)) setVar('--gp-my-goals-booking-edge-nudge', `${delta}px`);

      for (const el of bookingRow.querySelectorAll('span, div')) {
        if (!bookingRow.contains(el) || el === bookingRow) continue;
        const t = normalizeSidebarRowText(el.textContent || '');
        if (!t || t.length > 48 || el.querySelector('span, div, svg, button')) continue;
        if (!/booking\s*pages/i.test(t)) continue;
        const tw = getComputedStyle(el).fontWeight;
        if (tw) setVar('--gp-native-title-font-weight', tw);
        break;
      }

      const bookingNested = nativeSidebarNestedTriggers(bookingRow);
      const bookingAddHost = gpPickSidebarRowAddTrigger(bookingNested);
      if (bookingAddHost) {
        const ar = bookingAddHost.getBoundingClientRect();
        setVar('--gp-booking-add-btn-w', `${Math.round(ar.width)}px`);
        setVar('--gp-booking-add-btn-h', `${Math.round(ar.height)}px`);
        const bg =
          bookingAddHost.querySelector('svg, .google-symbols, [class*="google-material"], span, i');
        if (bg) {
          const ags = getComputedStyle(bg);
          if (ags.fontSize && ags.fontSize !== '0px') setVar('--gp-booking-add-icon-font-size', ags.fontSize);
        }
      }
    }

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
    body.className = 'gp-gcal-sidebar-section-body gcal-ext-goals-list';
    body.id = 'gp-gcal-sidebar-goals-cards';
    body.dataset.extension = 'my-goals-list';
    body.setAttribute('aria-live', 'polite');

    const chevronGlyph = chevronBtn.querySelector('.gp-gcal-sidebar-chevron-icon');

    function applyCollapsed(collapsed) {
      root.classList.toggle('gp-gcal-sidebar-collapsed', collapsed);
      const exp = String(!collapsed);
      labelBtn.setAttribute('aria-expanded', exp);
      chevronBtn.setAttribute('aria-expanded', exp);
      if (chevronGlyph) chevronGlyph.textContent = collapsed ? 'expand_more' : 'expand_less';
      try {
        chrome.storage.local.set({
          [GP_GOALS_ACCORDION_OPEN_KEY]: !collapsed,
          [GP_LEFT_GOALS_COLLAPSED_KEY]: collapsed,
        });
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

    chrome.storage.local.get([GP_GOALS_ACCORDION_OPEN_KEY, GP_LEFT_GOALS_COLLAPSED_KEY], (d) => {
      if (!root.isConnected) return;
      const openExplicit = d[GP_GOALS_ACCORDION_OPEN_KEY];
      if (typeof openExplicit === 'boolean') {
        applyCollapsed(!openExplicit);
        return;
      }
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
      const cards = document.getElementById('gp-gcal-sidebar-goals-cards');
      const hasCards = !!cards?.querySelector?.('.gcal-ext-goal-card[data-goal-id]');
      if (!hasCards) {
        renderGoalsSidebar();
        return;
      }
      if (goalPlannerModelAvailable()) {
        loadAuthoritativeUnifiedForSidebar(null).then((st) =>
          patchMyGoalsSidebarProgressRows(st, { reason: 'mountPreserve' })
        );
      }
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
      const cards = document.getElementById('gp-gcal-sidebar-goals-cards');
      const hasCards = !!cards?.querySelector?.('.gcal-ext-goal-card[data-goal-id]');
      if (!hasCards) renderGoalsSidebar();
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

  async function handleGoalCardClick(goalId) {
    openPanel();
    showScreen('home');
    await renderHomeScreen();
    requestAnimationFrame(() => {
      try {
        const row = document.querySelector(`#gp-goals-list .gp-goal-row[data-goal-id="${CSS.escape(goalId)}"]`);
        row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch (_) {
        const row = document.querySelector(`#gp-goals-list .gp-goal-row[data-goal-id="${goalId}"]`);
        row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  /**
   * Structure vs progress signatures for granular sidebar patches.
   * When only progress changes (session checkbox), we patch fill + count text without touching title or colors.
   */
  function legacyByIdLookup(map, goalId) {
    if (!map || goalId == null || goalId === '') return undefined;
    return map.get(goalId) ?? map.get(String(goalId));
  }

  function goalSidebarCardSigs(g, legacyById) {
    const legacy = legacyByIdLookup(legacyById, g.id);
    const legacyRow = legacy || {};
    const colorSource = {
      ...legacyRow,
      color: legacyRow.color != null && legacyRow.color !== '' ? legacyRow.color : g.color,
    };
    const displayColor = getGoalDisplayColor(colorSource);
    const { total, completed, pctClamped } = computeGoalSidebarNumbers(g);
    const struct = `${g.id}|${total}|${String(g.title || '')}|${displayColor}`;
    const prog = `${completed}|${pctClamped}`;
    return { struct, prog };
  }

  function ensureSidebarGoalSessionsSpans(goalSessionsEl) {
    if (!goalSessionsEl) return;
    if (goalSessionsEl.querySelector('.gcal-ext-goal-session-count')) return;
    goalSessionsEl.innerHTML =
      '<span class="gcal-ext-goal-session-count"></span>' +
      '<span class="gcal-ext-goal-session-sep"> • </span>' +
      '<span class="gcal-ext-goal-session-pct"></span>';
  }

  function computeGoalSidebarNumbers(g) {
    const sessions = g.sessions || [];
    const slotCount = sessions.length;
    const total =
      typeof g.totalSessions === 'number' && g.totalSessions > 0
        ? g.totalSessions
        : slotCount;
    const completed = slotCount ? sessions.filter((s) => !!s.completed).length : 0;
    const pctClamped =
      total > 0
        ? Math.max(0, Math.min(100, Math.round((completed / total) * 100)))
        : typeof g.progressPct === 'number'
          ? Math.max(0, Math.min(100, Math.round(g.progressPct)))
          : 0;
    return { total, completed, pctClamped };
  }

  function buildSidebarGoalCardElement(g, legacyById) {
    const legacy = legacyByIdLookup(legacyById, g.id);
    const legacyRow = legacy || {};
    const colorSource = {
      ...legacyRow,
      color: legacyRow.color != null && legacyRow.color !== '' ? legacyRow.color : g.color,
    };
    const { total, completed, pctClamped } = computeGoalSidebarNumbers(g);
    const displayColor = getGoalDisplayColor(colorSource);
    const name = escapeHtmlGp(g.title || 'Untitled goal');
    const card = document.createElement('div');
    card.className = 'gcal-ext-goal-card';
    card.dataset.goalId = g.id;
    card.dataset.extension = 'goal-card';
    card.setAttribute('role', 'button');
    const plainTitle = String(g.title || 'Untitled goal').trim();
    card.setAttribute(
      'aria-label',
      `${plainTitle}, ${completed} of ${total} sessions complete, ${pctClamped} percent`
    );
    card.tabIndex = 0;
    card.innerHTML =
      `<div class="gcal-ext-goal-name">${name}</div>` +
      `<div class="gcal-ext-goal-progress-track">` +
      `<div class="gcal-ext-goal-progress-fill"></div>` +
      `</div>` +
      `<div class="gcal-ext-goal-sessions">` +
      `<span class="gcal-ext-goal-session-count"></span>` +
      `<span class="gcal-ext-goal-session-sep"> • </span>` +
      `<span class="gcal-ext-goal-session-pct"></span>` +
      `</div>`;
    card.style.setProperty('--gp-card-bg-hover', hexToTint(displayColor, 0.18));
    paintSidebarGoalProgressOnCard(card, g, legacyById);
    const { struct, prog } = goalSidebarCardSigs(g, legacyById);
    card.dataset.gpSidebarStructSig = struct;
    card.dataset.gpSidebarProgSig = prog;
    card.addEventListener('click', () => handleGoalCardClick(g.id));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleGoalCardClick(g.id);
      }
    });
    return card;
  }

  /** Temporary trace for Goal → My Goals sidebar progress pipeline; set false after verification. */
  const GP_MY_GOALS_SIDEBAR_DIAG = false;

  /**
   * Temporary: force obvious fill styles to isolate wrong-node vs width/CSS vs overwrite.
   * Set false after test. If red 80% bar does not appear → patched node is not on-screen.
   */
  const GP_MY_GOALS_SIDEBAR_FORCE_VISUAL_TEST = false;

  function gpMyGoalsSidebarDiag(...args) {
    if (!GP_MY_GOALS_SIDEBAR_DIAG) return;
    console.log('[gp-my-goals-sidebar]', ...args);
  }

  /** When true, sidebar progress DOM is owned exclusively by goalPlannerUnifiedState. */
  function goalPlannerModelAvailable() {
    return !!globalThis.GoalPlannerModel;
  }

  function isSidebarStructuralMeta(meta) {
    const r = meta?.reason;
    return r === 'goalsStructure' || r === 'goalsSync';
  }

  async function loadAuthoritativeUnifiedForSidebar(preloaded) {
    if (preloaded && Array.isArray(preloaded.goals)) return preloaded;
    const Model = globalThis.GoalPlannerModel;
    if (!Model?.loadUnifiedState) return { goals: [] };
    try {
      return await Model.loadUnifiedState();
    } catch (_) {
      return { goals: [] };
    }
  }

  function isEventIdMarkedDoneInChipMap(eventId, chipDone) {
    if (!chipDone || eventId == null || eventId === '') return false;
    if (chipDone[eventId] || chipDone[String(eventId)]) return true;
    const e = String(eventId);
    for (const k of Object.keys(chipDone)) {
      if (!chipDone[k]) continue;
      if (gpChipDoneKeyMatchesCalEventId(e, k) || gpChipDoneKeyMatchesCalEventId(k, e)) return true;
    }
    return false;
  }

  /** Re-apply chip + slot completion onto unified goals (handles id skew / slot-only toggles). */
  function reconcileUnifiedGoalsWithChipAndSlots(st, legacyArr, chipDone, slotPack) {
    const legacyById = new Map();
    (legacyArr || []).forEach((lg) => {
      legacyById.set(lg.id, lg);
      legacyById.set(String(lg.id), lg);
    });
    const pack = slotPack && typeof slotPack === 'object' ? slotPack : {};
    const goals = (st.goals || []).map((g) => {
      const lg = legacyById.get(g.id) || legacyById.get(String(g.id));
      const calIds = lg?.calEventIds || [];
      const domIds = lg?.calEventDomIds || [];
      const slotRaw = pack[String(g.id)] ?? pack[g.id];
      const slotArr = Array.isArray(slotRaw) ? slotRaw : [];
      const slotSet = new Set(
        slotArr.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 0)
      );
      const prevByEvent = new Map();
      (g.sessions || []).forEach((s) => {
        prevByEvent.set(s.eventId, s);
        prevByEvent.set(String(s.eventId), s);
      });

      let sessions;
      if (calIds.length) {
        sessions = calIds.map((eventId, idx) => {
          const ps = prevByEvent.get(eventId) || prevByEvent.get(String(eventId));
          const domKey = domIds[idx];
          const completed = !!(
            isEventIdMarkedDoneInChipMap(eventId, chipDone) ||
            (domKey && (chipDone[String(domKey)] || chipDone[domKey])) ||
            slotSet.has(idx) ||
            (ps && ps.completed)
          );
          return {
            eventId,
            goalId: g.id,
            startTime: ps?.startTime || '',
            endTime: ps?.endTime || '',
            completed,
          };
        });
      } else if ((g.sessions || []).length) {
        sessions = (g.sessions || []).map((s, idx) => ({
          ...s,
          completed: !!(
            s.completed ||
            isEventIdMarkedDoneInChipMap(s.eventId, chipDone) ||
            slotSet.has(idx)
          ),
        }));
      } else {
        return g;
      }
      const done = sessions.filter((s) => s.completed).length;
      const totalSessions =
        typeof g.totalSessions === 'number' && g.totalSessions > 0
          ? g.totalSessions
          : globalThis.GoalPlannerModel?.resolveGoalTotalSessions?.(lg) ||
            sessions.length;
      const progressPct = totalSessions
        ? Math.max(0, Math.min(100, Math.round((done / totalSessions) * 100)))
        : 0;
      return { ...g, sessions, totalSessions, progressPct };
    });
    return { ...st, goals };
  }

  /**
   * Unified state for sidebar: always merge gp_goals + gp_chip_done + gp_goal_slot_done
   * so session completions match what the calendar checkbox just wrote.
   */
  async function ensureAuthoritativeSidebarState(preloaded, meta) {
    const Model = globalThis.GoalPlannerModel;
    if (!Model) return preloaded?.goals ? preloaded : { goals: [] };
    let st = await loadAuthoritativeUnifiedForSidebar(preloaded);
    const legacyRows = await getGoals();
    const legacyArr = Array.isArray(legacyRows) ? legacyRows : [];
    if (!legacyArr.length || !Model.syncUnifiedWithLegacyGoals) return st;

    const slotPack =
      meta?.slotPackOverride && typeof meta.slotPackOverride === 'object'
        ? meta.slotPackOverride
        : await new Promise((r) =>
            chrome.storage.local.get(['gp_goal_slot_done'], (d) => r(d.gp_goal_slot_done || {}))
          );
    const chipDone =
      meta?.chipDoneOverride && typeof meta.chipDoneOverride === 'object'
        ? meta.chipDoneOverride
        : await loadMergedChipDoneForSidebar(legacyArr);
    st = Model.syncUnifiedWithLegacyGoals(st, legacyArr, chipDone);
    st = reconcileUnifiedGoalsWithChipAndSlots(st, legacyArr, chipDone, slotPack);

    if (meta?.reason === 'sessionCompletion') {
      try {
        await Model.saveUnifiedState(st, { silent: true });
      } catch (_) {
        /* non-fatal */
      }
    }
    return st;
  }

  let _gpSidebarPatchTraceSeq = 0;

  function inspectSidebarGoalCardDom(card) {
    if (!card) return null;
    const fillEl = card.querySelector('.gcal-ext-goal-progress-fill');
    const trackEl = card.querySelector('.gcal-ext-goal-progress-track');
    const countSpan = card.querySelector('.gcal-ext-goal-session-count');
    const pctSpan = card.querySelector('.gcal-ext-goal-session-pct');
    const fillCs = fillEl ? getComputedStyle(fillEl) : null;
    const trackCs = trackEl ? getComputedStyle(trackEl) : null;
    return {
      cardGoalId: card.dataset.goalId,
      fillExists: !!fillEl,
      trackExists: !!trackEl,
      widthStyle: fillEl?.style?.width ?? '',
      widthComputed: fillCs?.width ?? null,
      maxWidth: fillCs?.maxWidth ?? null,
      opacity: fillCs?.opacity ?? null,
      transform: fillCs?.transform ?? null,
      display: fillCs?.display ?? null,
      flexGrow: fillCs?.flexGrow ?? null,
      trackOverflow: trackCs?.overflow ?? null,
      trackWidth: trackCs?.width ?? null,
      countText: countSpan?.textContent ?? null,
      pctText: pctSpan?.textContent ?? null,
    };
  }

  /**
   * Paint progress on the visible track (gradient) + fill width + session text.
   * Track gradient survives GCal !important fill rules and zero-width fill edge cases.
   */
  function paintSidebarGoalProgressOnCard(card, g, legacyById) {
    if (!card || !g) return null;
    const numbers = computeGoalSidebarNumbers(g);
    const { total, completed, pctClamped } = numbers;
    const pct = Math.max(0, Math.min(100, pctClamped));
    const widthAssign = `${pct}%`;
    const legacy = legacyByIdLookup(legacyById, g.id) || {};
    const colorSource = {
      ...legacy,
      color: legacy.color != null && legacy.color !== '' ? legacy.color : g.color,
    };
    const color = getGoalDisplayColor(colorSource);
    const trackBg = hexToTint(color, 0.76);
    const plainTitle = String(g.title || 'Untitled goal').trim();

    card.setAttribute(
      'aria-label',
      `${plainTitle}, ${completed} of ${total} sessions complete, ${pct} percent`
    );
    card.style.setProperty('--goal-progress-color', color);
    card.style.setProperty('--goal-progress-pct', widthAssign);
    card.dataset.gpProgressPct = String(pct);

    const trackEl = card.querySelector('.gcal-ext-goal-progress-track');
    const fillEl = card.querySelector('.gcal-ext-goal-progress-fill');
    const grad = `linear-gradient(90deg, ${color} 0%, ${color} ${pct}%, ${trackBg} ${pct}%, ${trackBg} 100%)`;
    if (trackEl) {
      trackEl.style.setProperty('background', grad, 'important');
      trackEl.style.setProperty('background-color', trackBg, 'important');
    }
    if (fillEl) {
      fillEl.style.setProperty('display', 'block', 'important');
      fillEl.style.setProperty('width', widthAssign, 'important');
      fillEl.style.setProperty('opacity', pct > 0 ? '1' : '0', 'important');
    }

    const sessWrap = card.querySelector('.gcal-ext-goal-sessions');
    ensureSidebarGoalSessionsSpans(sessWrap);
    const countSpan = sessWrap?.querySelector('.gcal-ext-goal-session-count');
    const pctSpan = sessWrap?.querySelector('.gcal-ext-goal-session-pct');
    const countAssign = `${completed} of ${total} sessions`;
    const pctAssign = `${pct}%`;
    if (countSpan) countSpan.textContent = countAssign;
    if (pctSpan) pctSpan.textContent = pctAssign;
    else if (sessWrap) sessWrap.textContent = `${countAssign} • ${pctAssign}`;

    return { numbers, widthAssign, countAssign, pctAssign, fillEl, trackEl, color, pct };
  }

  /** Session completion / progress only: same card node, progress fill width + session count/pct spans. */
  function patchSidebarGoalCardProgressOnly(card, g, traceId, legacyById) {
    if (!card || !g) return null;
    const before = inspectSidebarGoalCardDom(card);
    const painted = paintSidebarGoalProgressOnCard(card, g, legacyById || new Map());

    if (GP_MY_GOALS_SIDEBAR_FORCE_VISUAL_TEST && painted?.trackEl) {
      painted.trackEl.style.setProperty(
        'background',
        'linear-gradient(90deg, red 0%, red 80%, #eee 80%, #eee 100%)',
        'important'
      );
    }

    const after = inspectSidebarGoalCardDom(card);
    if (GP_MY_GOALS_SIDEBAR_DIAG) {
      gpMyGoalsSidebarDiag('3–4 DOM patch apply', {
        traceId,
        goalId: card.dataset.goalId,
        numbers: painted?.numbers,
        widthAssign: painted?.widthAssign,
        countAssign: painted?.countAssign,
        pctAssign: painted?.pctAssign,
        before,
        after,
        textChanged:
          before?.countText !== after?.countText || before?.pctText !== after?.pctText,
        widthChanged: before?.widthStyle !== after?.widthStyle,
      });
    }
    return {
      ...painted,
      before,
      after,
      forceVisualTest: !!(GP_MY_GOALS_SIDEBAR_FORCE_VISUAL_TEST && painted?.trackEl),
    };
  }

  function goalUnifiedProgressSnapshot(g) {
    const sessions = g?.sessions || [];
    const slotCount = sessions.length;
    const total =
      typeof g?.totalSessions === 'number' && g.totalSessions > 0
        ? g.totalSessions
        : slotCount;
    const completedSessions = slotCount ? sessions.filter((s) => !!s.completed).length : 0;
    const progressPct =
      typeof g?.progressPct === 'number'
        ? Math.max(0, Math.min(100, Math.round(g.progressPct)))
        : computeGoalSidebarNumbers(g).pctClamped;
    return { total, completedSessions, progressPct };
  }

  function diffUnifiedGoalProgressChanges(oldState, newState) {
    const oldGoals = Array.isArray(oldState?.goals) ? oldState.goals : [];
    const newGoals = Array.isArray(newState?.goals) ? newState.goals : [];
    const oldById = new Map(oldGoals.map((g) => [String(g.id), g]));
    const out = [];
    for (const ng of newGoals) {
      const id = String(ng.id);
      const og = oldById.get(id);
      const prev = og
        ? goalUnifiedProgressSnapshot(og)
        : { total: 0, completedSessions: 0, progressPct: 0 };
      const next = goalUnifiedProgressSnapshot(ng);
      if (
        prev.completedSessions !== next.completedSessions ||
        prev.progressPct !== next.progressPct ||
        prev.total !== next.total
      ) {
        out.push({ goalId: id, prev, next });
      }
    }
    return out;
  }

  function findSidebarGoalCardById(container, goalId) {
    if (!container || goalId == null || goalId === '') return null;
    const gid = String(goalId);
    try {
      const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(gid) : gid;
      const bySel = container.querySelector(`.gcal-ext-goal-card[data-goal-id="${esc}"]`);
      if (bySel) return bySel;
    } catch (_) {
      /* fall through */
    }
    return (
      [...container.children].find(
        (el) =>
          el.matches?.('.gcal-ext-goal-card[data-goal-id]') && String(el.dataset.goalId) === gid
      ) || null
    );
  }

  function isElementVisibleForPatch(el) {
    if (!el?.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    let n = el;
    while (n && n !== document.documentElement) {
      if (n.hidden) return false;
      const st = getComputedStyle(n);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      n = n.parentElement;
    }
    return true;
  }

  /** Pick the on-screen My Goals card (avoids patching detached/hidden duplicate roots). */
  function resolveVisibleSidebarGoalCard(goalId) {
    const gid = String(goalId);
    let best = null;
    let bestArea = -1;
    const roots = document.querySelectorAll('#gp-gcal-sidebar-goals-root');
    for (const root of roots) {
      if (!root.isConnected) continue;
      const container =
        root.querySelector('#gp-gcal-sidebar-goals-cards') ||
        root.querySelector('.gcal-ext-goals-list');
      if (!container) continue;
      const card = findSidebarGoalCardById(container, gid);
      if (!card) continue;
      const r = card.getBoundingClientRect();
      const area = r.width * r.height;
      const visible = isElementVisibleForPatch(card);
      const score = visible ? area + 1e9 : area;
      if (score > bestArea) {
        bestArea = score;
        best = { card, container, root, visible, rect: { w: r.width, h: r.height } };
      }
    }
    if (best) return best;
    const root = document.getElementById('gp-gcal-sidebar-goals-root');
    const container =
      document.getElementById('gp-gcal-sidebar-goals-cards') ||
      root?.querySelector('.gcal-ext-goals-list');
    if (!container) return null;
    const card = findSidebarGoalCardById(container, gid);
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return {
      card,
      container,
      root,
      visible: isElementVisibleForPatch(card),
      rect: { w: r.width, h: r.height },
    };
  }

  function refreshSidebarGoalsSigDataset(goals, legacyById, root) {
    const sigJoined = goals
      .map((g) => {
        const p = goalSidebarCardSigs(g, legacyById);
        return `${p.struct}|${p.prog}`;
      })
      .join('||');
    if (root) root.dataset.gpSidebarGoalsSig = sigJoined;
    return sigJoined;
  }

  /**
   * Minimal My Goals sidebar row patch: progress fill + session count + percentage only.
   * @param {{ goals?: unknown[] }} mergedState Unified + legacy/chip projection
   * @param {{ reason?: string, goalId?: string, progressDiffs?: { goalId: string, prev: object, next: object }[], legacyById?: Map<string, unknown> }} [meta]
   */
  async function patchMyGoalsSidebarProgressRows(mergedState, meta) {
    meta = meta || {};
    mergedState = await ensureAuthoritativeSidebarState(mergedState, meta);
    mountLeftSidebarGoalsSection();
    const root = document.getElementById('gp-gcal-sidebar-goals-root');
    if (!root?.isConnected) {
      scheduleLeftSidebarGoalsMount();
      return;
    }

    const goals = Array.isArray(mergedState?.goals) ? mergedState.goals : [];
    if (!goals.length) return;

    let legacyById = meta?.legacyById || null;
    if (!legacyById) {
      const legacyRowsRaw = await getGoals();
      const legacyRows = Array.isArray(legacyRowsRaw) ? legacyRowsRaw : [];
      legacyById = new Map(legacyRows.map((gk) => [gk.id, gk]));
    }

    const idsFromDiffs = (meta?.progressDiffs || []).map((d) => d.goalId);
    let idsToPatch = [
      ...new Set(
        meta?.goalId != null && meta.goalId !== ''
          ? [String(meta.goalId)]
          : idsFromDiffs.length
            ? idsFromDiffs
            : meta?.reason === 'sessionCompletion' ||
                meta?.reason === 'storageSync' ||
                meta?.reason === 'mountPreserve'
              ? goals.map((g) => String(g.id))
              : []
      ),
    ];
    if (!idsToPatch.length && goals.length) {
      idsToPatch = goals.map((g) => String(g.id));
    }
    if (!idsToPatch.length) return;

    const traceId = `gp-patch-${++_gpSidebarPatchTraceSeq}-${Date.now()}`;
    gpMyGoalsSidebarDiag('patch flow start', { traceId, reason: meta?.reason, goalIds: idsToPatch });

    for (const gid of idsToPatch) {
      const g = goals.find((x) => String(x.id) === gid);
      if (!g) continue;

      const numbers = computeGoalSidebarNumbers(g);
      const snap = goalUnifiedProgressSnapshot(g);
      const diffEntry = (meta?.progressDiffs || []).find((d) => d.goalId === gid);
      gpMyGoalsSidebarDiag('1 state before DOM', {
        traceId,
        goalId: gid,
        completedSessions: numbers.completed,
        totalSessions: numbers.total,
        progressPct: numbers.pctClamped,
        progressPctStored: snap.progressPct,
        diff: diffEntry
          ? {
              completedSessions: {
                old: diffEntry.prev.completedSessions,
                new: diffEntry.next.completedSessions,
              },
              progressPct: { old: diffEntry.prev.progressPct, new: diffEntry.next.progressPct },
            }
          : null,
      });

      let resolved = resolveVisibleSidebarGoalCard(gid);
      gpMyGoalsSidebarDiag('2 row selection', {
        traceId,
        goalId: gid,
        rowFound: !!resolved?.card,
        visible: resolved?.visible,
        cardRect: resolved?.rect,
        containerId: resolved?.container?.id,
        rootConnected: resolved?.root?.isConnected,
        rootCollapsed: resolved?.root?.classList?.contains('gp-gcal-sidebar-collapsed'),
        cardGoalId: resolved?.card?.dataset?.goalId,
        isConnected: !!resolved?.card?.isConnected,
      });
      if (!resolved?.card) {
        await applyGoalsSidebarFromUnifiedState(mergedState, legacyById, { reason: 'goalsSync' });
        resolved = resolveVisibleSidebarGoalCard(gid);
        if (!resolved?.card) {
          console.warn('[gp-my-goals] no sidebar card for goal', gid);
          continue;
        }
      }
      const cardToPatch = resolved.card;
      if (!cardToPatch) continue;
      if (!resolved?.visible) {
        console.warn(
          '[gp-my-goals] patch target not visible — expand “My goals” in the Google Calendar left drawer',
          { goalId: gid, rect: resolved?.rect }
        );
      }

      const patchReport = patchSidebarGoalCardProgressOnly(cardToPatch, g, traceId, legacyById);
      const lgRow = legacyById.get(gid) || legacyById.get(String(gid));
      const slotArr =
        meta?.slotPackOverride?.[gid] ??
        meta?.slotPackOverride?.[String(gid)] ??
        null;
      const chipTruthy = meta?.chipDoneOverride
        ? Object.keys(meta.chipDoneOverride).filter((k) => meta.chipDoneOverride[k])
        : [];
      console.info(
        '[gp-my-goals] progress painted',
        gid,
        `${patchReport?.numbers?.completed ?? '?'}/${patchReport?.numbers?.total ?? '?'}`,
        patchReport?.pctAssign,
        {
          visible: resolved?.visible,
          pct: patchReport?.pct,
          calEventIds: (lgRow?.calEventIds || []).length,
          slotDone: Array.isArray(slotArr) ? slotArr : [],
          chipTruthyKeys: chipTruthy.length,
        }
      );
      const pair = goalSidebarCardSigs(g, legacyById);
      cardToPatch.dataset.gpSidebarStructSig = pair.struct;
      cardToPatch.dataset.gpSidebarProgSig = pair.prog;

      const expected = patchReport
        ? {
            pctDataset: String(patchReport.pct),
            countText: patchReport.countAssign,
            pctText: patchReport.pctAssign,
          }
        : null;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const post = inspectSidebarGoalCardDom(cardToPatch);
          const persisted =
            !!expected &&
            cardToPatch.dataset.gpProgressPct === expected.pctDataset &&
            post?.countText === expected.countText &&
            post?.pctText === expected.pctText;
          gpMyGoalsSidebarDiag('5 DOM persistence (2×rAF)', {
            traceId,
            goalId: gid,
            persisted,
            expected,
            actual: post,
            overwritten: !persisted,
          });
          if (!persisted) {
            gpMyGoalsSidebarDiag('OVERWRITE or patch failed', {
              traceId,
              goalId: gid,
              hint: 'Non-unified writer overwrote patch (reinforce is blocked when GoalPlannerModel exists)',
            });
          }
        });
      });
    }
    const sigRoot = document.getElementById('gp-gcal-sidebar-goals-root');
    refreshSidebarGoalsSigDataset(goals, legacyById, sigRoot);
  }

  function updateSidebarGoalCardElement(card, g, legacyById) {
    if (!card || !g) return;
    const { total, completed, pctClamped } = computeGoalSidebarNumbers(g);
    const plainTitle = String(g.title || 'Untitled goal').trim();
    card.setAttribute(
      'aria-label',
      `${plainTitle}, ${completed} of ${total} sessions complete, ${pctClamped} percent`
    );
    const nameEl = card.querySelector('.gcal-ext-goal-name');
    if (nameEl) nameEl.innerHTML = escapeHtmlGp(g.title || 'Untitled goal');
    const sessWrap = card.querySelector('.gcal-ext-goal-sessions');
    ensureSidebarGoalSessionsSpans(sessWrap);
    const countSpan = sessWrap?.querySelector('.gcal-ext-goal-session-count');
    const pctSpan = sessWrap?.querySelector('.gcal-ext-goal-session-pct');
    const legacy = legacyByIdLookup(legacyById, g.id);
    const legacyRow = legacy || {};
    const colorSource = {
      ...legacyRow,
      color: legacyRow.color != null && legacyRow.color !== '' ? legacyRow.color : g.color,
    };
    const displayColor = getGoalDisplayColor(colorSource);
    card.style.setProperty('--gp-card-bg-hover', hexToTint(displayColor, 0.18));
    paintSidebarGoalProgressOnCard(card, g, legacyById);
  }

  /**
   * Compare structure vs completion signatures; patch one card without touching siblings.
   * @param {boolean} [force] When true (e.g. calendar session checkbox → sidebar), repaint progress even if sigs already match (avoids stale DOM vs dataset).
   * @returns {boolean} true if this card’s DOM was updated
   */
  function syncSingleSidebarGoalCard(card, g, legacyById, force) {
    if (goalPlannerModelAvailable()) {
      patchSidebarGoalCardProgressOnly(card, g, null, legacyById);
      const pair = goalSidebarCardSigs(g, legacyById);
      card.dataset.gpSidebarStructSig = pair.struct;
      card.dataset.gpSidebarProgSig = pair.prog;
      return true;
    }
    const pair = goalSidebarCardSigs(g, legacyById);
    const prevS = card.dataset.gpSidebarStructSig;
    const prevP = card.dataset.gpSidebarProgSig;
    if (!force && prevS === pair.struct && prevP === pair.prog) return false;
    if (prevS === pair.struct && prevP !== pair.prog) {
      patchSidebarGoalCardProgressOnly(card, g);
    } else {
      updateSidebarGoalCardElement(card, g, legacyById);
    }
    card.dataset.gpSidebarStructSig = pair.struct;
    card.dataset.gpSidebarProgSig = pair.prog;
    return true;
  }

  /**
   * Pure projection of GoalPlannerUnifiedState onto the injected sidebar cards.
   * @param {{ goals?: unknown[] }} state Unified snapshot / model state
   * @param {Map<string, unknown> | null} [legacyByIdCache] Planner palette rows keyed by goal id (not used for counts)
   * @param {{ reason?: string, goalId?: string }} [meta] Session toggles narrow to one card when safe
   */
  async function applyGoalsSidebarFromUnifiedState(state, legacyByIdCache, meta) {
    mountLeftSidebarGoalsSection();
    const container =
      document.getElementById('gp-gcal-sidebar-goals-cards') ||
      document.querySelector('#gp-gcal-sidebar-goals-root .gcal-ext-goals-list');
    const root = document.getElementById('gp-gcal-sidebar-goals-root');
    if (!container || !root) {
      scheduleLeftSidebarGoalsMount();
      return;
    }

    const legacyRowsRaw = legacyByIdCache ? null : await getGoals();
    const legacyRows = Array.isArray(legacyRowsRaw) ? legacyRowsRaw : [];
    const legacyById =
      legacyByIdCache || new Map(legacyRows.map((gk) => [gk.id, gk]));
    const goals = Array.isArray(state?.goals) ? state.goals : [];

    root.hidden = false;

    if (!goals.length) {
      container.innerHTML =
        '<div class="gcal-ext-goals-empty">No goals yet. Click + to add one.</div>';
      root.dataset.gpSidebarGoalsSig = '';
      return;
    }

    const sigJoined = goals
      .map((g) => {
        const p = goalSidebarCardSigs(g, legacyById);
        return `${p.struct}|${p.prog}`;
      })
      .join('||');
    const orderedIds = goals.map((g) => g.id);
    const existingCards = [...container.children].filter((el) =>
      el.matches?.('.gcal-ext-goal-card[data-goal-id]')
    );

    const structuralReason = isSidebarStructuralMeta(meta);

    let needFullRebuild =
      structuralReason ||
      existingCards.length !== goals.length ||
      existingCards.some((el, idx) => el.dataset.goalId !== orderedIds[idx]);

    if (needFullRebuild) {
      container.innerHTML = '';
      for (const g of goals) {
        container.appendChild(buildSidebarGoalCardElement(g, legacyById));
      }
      root.dataset.gpSidebarGoalsSig = sigJoined;
      return;
    }

    /** Unified model owns progress DOM — structure-only apply; patchMyGoalsSidebarProgressRows is sole progress writer. */
    if (goalPlannerModelAvailable() && !structuralReason) {
      root.dataset.gpSidebarGoalsSig = sigJoined;
      return;
    }

    if (sigJoined !== root.dataset.gpSidebarGoalsSig) {
      for (let i = 0; i < goals.length; i++) {
        syncSingleSidebarGoalCard(existingCards[i], goals[i], legacyById);
      }
      root.dataset.gpSidebarGoalsSig = sigJoined;
    }

    if (meta?.reason === 'sessionCompletion') {
      const narrowId =
        meta.goalId != null && meta.goalId !== '' ? String(meta.goalId) : null;
      const targets = narrowId ? goals.filter((g) => String(g.id) === narrowId) : goals;
      for (const g of targets) {
        const card = findSidebarGoalCardById(container, g.id);
        if (card) syncSingleSidebarGoalCard(card, g, legacyById, true);
      }
      root.dataset.gpSidebarGoalsSig = sigJoined;
    }
  }

  /**
   * Load state (optional) and sync sidebar DOM with GoalPlannerModel.
   * @param {{ goals?: unknown[] } | null | undefined} [preloadedUnified]
   * @param {{ reason?: string, goalId?: string }} [meta] Hint for incremental projections
   */
  async function renderGoalsSidebar(preloadedUnified, meta) {
    meta = meta || {};
    if (!goalPlannerModelAvailable()) {
      const st = preloadedUnified?.goals ? preloadedUnified : { goals: [] };
      await applyGoalsSidebarFromUnifiedState(st, null, meta);
      await reinforceMyGoalsSidebarProgressFromStorage();
      return;
    }
    const st = await loadAuthoritativeUnifiedForSidebar(preloadedUnified);
    const applyMeta = isSidebarStructuralMeta(meta) ? meta : { reason: 'goalsSync' };
    await applyGoalsSidebarFromUnifiedState(st, null, applyMeta);
    await patchMyGoalsSidebarProgressRows(st, meta);
  }

  async function reinforceMyGoalsSidebarProgressFromStorage() {
    if (goalPlannerModelAvailable()) {
      if (GP_MY_GOALS_SIDEBAR_DIAG) {
        gpMyGoalsSidebarDiag('reinforce blocked — unified state is sole progress authority', {
          stack: new Error().stack?.split('\n').slice(1, 4),
        });
      }
      return;
    }
    try {
      const goals = await getGoals();
      if (!Array.isArray(goals) || !goals.length) return;
      const raw = await new Promise((r) =>
        chrome.storage.local.get(['gp_chip_done'], (d) => r(d.gp_chip_done || {}))
      );
      const slotPack = await new Promise((r) =>
        chrome.storage.local.get(['gp_goal_slot_done'], (d) => r(d.gp_goal_slot_done || {}))
      );
      const expanded = injectSlotDoneIntoExpandedChipDone(
        expandChipDoneOntoCalEventIds(raw, goals),
        goals,
        slotPack
      );
      const container = document.getElementById('gp-gcal-sidebar-goals-cards');
      const root = document.getElementById('gp-gcal-sidebar-goals-root');
      if (!container || !root) return;
      const legacyById = new Map(goals.map((gk) => [gk.id, gk]));
      for (const lg of goals) {
        const slotRaw = slotPack[String(lg.id)] ?? slotPack[lg.id];
        const slotArr = Array.isArray(slotRaw) ? slotRaw : [];
        const virtualG = buildSidebarVirtualGoalFromExpanded(lg, expanded, slotArr);
        const card = [...container.children].find(
          (el) =>
            el.matches?.('.gcal-ext-goal-card[data-goal-id]') &&
            String(el.dataset.goalId) === String(lg.id)
        );
        if (!card) continue;
        patchSidebarGoalCardProgressOnly(card, virtualG);
        const pair = goalSidebarCardSigs(virtualG, legacyById);
        card.dataset.gpSidebarStructSig = pair.struct;
        card.dataset.gpSidebarProgSig = pair.prog;
      }
      const sigJoined = goals
        .map((lg) => {
          const slotRaw = slotPack[String(lg.id)] ?? slotPack[lg.id];
          const slotArr = Array.isArray(slotRaw) ? slotRaw : [];
          const v = buildSidebarVirtualGoalFromExpanded(lg, expanded, slotArr);
          const p = goalSidebarCardSigs(v, legacyById);
          return `${p.struct}|${p.prog}`;
        })
        .join('||');
      root.dataset.gpSidebarGoalsSig = sigJoined;
    } catch (_) {
      /* ignore */
    }
  }

  function buildSidebarVirtualGoalFromExpanded(lg, expandedDone, slotDoneIndices) {
    const ids = lg.calEventIds || [];
    const done = expandedDone && typeof expandedDone === 'object' ? expandedDone : {};
    const slotSet = new Set(
      Array.isArray(slotDoneIndices)
        ? slotDoneIndices.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 0)
        : []
    );
    return {
      id: lg.id,
      title: lg.title,
      color: lg.color,
      sessions: ids.map((eventId, idx) => ({
        eventId,
        completed: !!(done[String(eventId)] || done[eventId] || slotSet.has(idx)),
      })),
      progressPct: 0,
    };
  }

  /**
   * Projection-only: map gp_chip_done keys (often GCal DOM event ids) onto gp_goals[].calEventIds[]
   * for merge/sidebar counts. Does not write to storage. Per-goal scoping limits false matches.
   */
  function expandChipDoneOntoCalEventIds(chipDone, legacyGoals) {
    const raw = chipDone && typeof chipDone === 'object' ? { ...chipDone } : {};
    const goals = Array.isArray(legacyGoals) ? legacyGoals : [];
    for (const g of goals) {
      const ids = g.calEventIds || [];
      if (!ids.length) continue;
      const domIds = g.calEventDomIds || [];
      for (let di = 0; di < ids.length; di++) {
        const dom = domIds[di];
        if (dom && raw[String(dom)]) raw[String(ids[di])] = true;
      }
      const idSet = new Set(ids.map((x) => String(x)));
      for (const calId of ids) {
        if (calId == null || calId === '') continue;
        const calStr = String(calId);
        if (raw[calStr]) continue;
        for (const k of Object.keys(raw)) {
          if (!raw[k]) continue;
          if (idSet.has(String(k))) continue;
          if (
            gpChipDoneKeyMatchesCalEventId(calStr, k) ||
            gpChipDoneKeyMatchesCalEventId(k, calStr)
          ) {
            raw[calStr] = true;
            break;
          }
        }
      }
    }
    const truthyKeys = Object.keys(raw).filter((k) => raw[k]);
    for (const g of goals) {
      const ids = g.calEventIds || [];
      if (!ids.length) continue;
      const idStrSet = new Set(ids.map((x) => String(x)));
      const syntheticGoal = [{ calEventIds: ids }];
      for (const calId of ids) {
        const calStr = String(calId);
        if (raw[calStr]) continue;
        for (const k of truthyKeys) {
          if (idStrSet.has(String(k))) continue;
          const hit = resolvePlannerEventIdForChip(k, syntheticGoal);
          if (hit && calEventIdsContain(ids, hit)) {
            raw[calStr] = true;
            break;
          }
        }
      }
    }
    return raw;
  }

  function injectSlotDoneIntoExpandedChipDone(expanded, legacyGoals, slotPack) {
    const out = expanded && typeof expanded === 'object' ? { ...expanded } : {};
    const pack = slotPack && typeof slotPack === 'object' ? slotPack : {};
    for (const g of legacyGoals || []) {
      const ids = g.calEventIds || [];
      const arrRaw = pack[String(g.id)] ?? pack[g.id];
      const arr = Array.isArray(arrRaw) ? arrRaw : [];
      for (const idx of arr) {
        const i = Number(idx);
        if (Number.isFinite(i) && i >= 0 && i < ids.length) out[String(ids[i])] = true;
      }
    }
    return out;
  }

  async function loadMergedChipDoneForSidebar(legacyGoals) {
    const goals = Array.isArray(legacyGoals) ? legacyGoals : [];
    const chipDoneRaw = await new Promise((r) =>
      chrome.storage.local.get(['gp_chip_done'], (d) => r(d.gp_chip_done || {}))
    );
    const slotPack = await new Promise((r) =>
      chrome.storage.local.get(['gp_goal_slot_done'], (d) => r(d.gp_goal_slot_done || {}))
    );
    let merged = expandChipDoneOntoCalEventIds(chipDoneRaw, goals);
    return injectSlotDoneIntoExpandedChipDone(merged, goals, slotPack);
  }

  function gpChipDoneKeyMatchesCalEventId(calId, chipKey) {
    if (!calId || chipKey == null || chipKey === '') return false;
    const a = String(calId);
    const b = String(chipKey);
    if (a === b) return true;
    let dec = b;
    try {
      dec = decodeURIComponent(b.replace(/\+/g, ' '));
    } catch (_) {
      dec = b;
    }
    if (a === dec) return true;
    if (b.startsWith(`${a}_`) || dec.startsWith(`${a}_`)) return true;
    if (a.startsWith(`${b}_`)) return true;
    const aSeg = a.split('_')[0];
    const bSeg = b.split('_')[0];
    const decSeg = dec.split('_')[0];
    if (aSeg.length >= 8 && (aSeg === bSeg || aSeg === decSeg)) return true;
    return false;
  }

  /**
   * Pair DOM/storage checkbox keys with API calendar ids when persisting gp_chip_done (no shared-prefix-only guess).
   */
  function gpChipDoneMirrorStrictPair(calId, chipKey) {
    if (!calId || chipKey == null || chipKey === '') return false;
    const a = String(calId);
    const b = String(chipKey);
    if (a === b) return true;
    let dec = b;
    try {
      dec = decodeURIComponent(b.replace(/\+/g, ' '));
    } catch (_) {
      dec = b;
    }
    if (a === dec) return true;
    if (b.startsWith(`${a}_`) || dec.startsWith(`${a}_`)) return true;
    if (a.startsWith(`${b}_`) || a.startsWith(`${dec}_`)) return true;
    return false;
  }

  /** Locate gp_goals row id when calendar DOM id differs from planner calEventIds entries. */
  function legacyGoalIdForPlannerEventCandidates(legacyGoals, ...idCandidates) {
    const cand = [...new Set((idCandidates || []).filter(Boolean).map((x) => String(x)))];
    if (!cand.length) return '';
    const goals = Array.isArray(legacyGoals) ? legacyGoals : [];
    for (const lg of goals) {
      const ids = lg.calEventIds || [];
      for (const ce of ids) {
        const ces = String(ce);
        for (const c of cand) {
          if (ces === c || gpChipDoneMirrorStrictPair(ces, c)) return String(lg.id);
        }
      }
    }
    return '';
  }

  /** Keys to set/remove together on toggle so My Goals (calEventIds) and chips (often DOM ids) share completion state. */
  function mirrorGpChipDoneKeysForSession(plannerEventId, allowedIds) {
    const keys = new Set();
    const p = plannerEventId != null && plannerEventId !== '' ? String(plannerEventId) : '';
    if (p) keys.add(p);
    const ids = Array.isArray(allowedIds) ? allowedIds.map(String).filter(Boolean) : [];
    if (!ids.length) return [...keys];

    if (ids.length === 1) {
      keys.add(ids[0]);
      return [...keys];
    }

    for (const cid of ids) {
      if (gpChipDoneMirrorStrictPair(cid, p)) keys.add(cid);
    }
    const narrowed = resolvePlannerEventIdForChip(p, [{ calEventIds: allowedIds }]);
    if (narrowed && calEventIdsContain(allowedIds, narrowed)) keys.add(String(narrowed));
    return [...keys];
  }

  function setupGoalsSidebarReactiveBinding() {
    const Model = globalThis.GoalPlannerModel;
    if (!Model?.subscribeGoalsState) return;
    if (globalThis.__gpGoalsSidebarReactiveBound) return;
    globalThis.__gpGoalsSidebarReactiveBound = true;
    Model.subscribeGoalsState((evt) => {
      if (!evt?.state) return;
      queueMicrotask(() => {
        (async () => {
          try {
            const st = evt.state;
            const meta = evt.meta || {};
            if (meta.goalId) {
              const g = st.goals?.find((x) => String(x.id) === String(meta.goalId));
              if (g && GP_MY_GOALS_SIDEBAR_DIAG) {
                const snap = goalUnifiedProgressSnapshot(g);
                gpMyGoalsSidebarDiag('reactive unified → sidebar patch', {
                  goalId: meta.goalId,
                  completedSessions: snap.completedSessions,
                  progressPct: snap.progressPct,
                });
              }
            }
            if (meta.reason === 'sessionCompletion') {
              const legacyForEvt = await getGoals();
              const slotPackEvt = await new Promise((r) =>
                chrome.storage.local.get(['gp_goal_slot_done'], (d) => r(d.gp_goal_slot_done || {}))
              );
              await patchMyGoalsSidebarProgressRows(st, {
                ...meta,
                slotPackOverride: slotPackEvt,
              });
              return;
            }
            const applyMeta = isSidebarStructuralMeta(meta) ? meta : { reason: 'goalsSync' };
            await applyGoalsSidebarFromUnifiedState(st, null, applyMeta);
            await patchMyGoalsSidebarProgressRows(st, meta);
          } catch (_) {
            /* sidebar optional */
          }
        })();
      });
    });
  }

  /**
   * Cross-context fallback + diagnostic verification for Goal → My Goals sidebar progress.
   * Primary path remains: calendar → unified state (subscribeGoalsState) → patchMyGoalsSidebarProgressRows.
   */
  function setupMyGoalsSidebarStorageSync() {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    if (globalThis.__gpMyGoalsSidebarStorageSync) return;
    globalThis.__gpMyGoalsSidebarStorageSync = true;
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;

        const unifiedCh = changes.goalPlannerUnifiedState;
        if (unifiedCh?.newValue && typeof unifiedCh.newValue === 'object') {
          queueMicrotask(() => {
            (async () => {
              try {
                const diffs = diffUnifiedGoalProgressChanges(
                  unifiedCh.oldValue,
                  unifiedCh.newValue
                );
                if (!diffs.length) return;
                gpMyGoalsSidebarDiag('storage goalPlannerUnifiedState', {
                  goalIds: diffs.map((d) => d.goalId),
                });
                const st = unifiedCh.newValue;
                for (const d of diffs) {
                  await patchMyGoalsSidebarProgressRows(st, {
                    reason: 'storageSync',
                    goalId: d.goalId,
                    progressDiffs: [d],
                  });
                }
              } catch (_) {
                /* sidebar optional */
              }
            })();
          });
          return;
        }

        if (changes.gp_goals) {
          renderGoalsSidebar(undefined, { reason: 'goalsStructure' });
          return;
        }

        if (changes.gp_chip_done || changes.gp_goal_slot_done) {
          queueMicrotask(() => {
            (async () => {
              try {
                if (!goalPlannerModelAvailable()) {
                  await reinforceMyGoalsSidebarProgressFromStorage();
                  return;
                }
                gpMyGoalsSidebarDiag('storage chip/slot — patch from unified only (no reinforce)', {
                  keys: Object.keys(changes).filter(
                    (k) => k === 'gp_chip_done' || k === 'gp_goal_slot_done'
                  ),
                });
                const st = await loadAuthoritativeUnifiedForSidebar(null);
                await patchMyGoalsSidebarProgressRows(st, { reason: 'storageSync' });
              } catch (_) {
                /* ignore */
              }
            })();
          });
        }
      });
    } catch (_) {
      /* ignore */
    }
  }

  // ── Home screen ──
  async function renderHomeScreen() {
    const Model = globalThis.GoalPlannerModel;
    const unifiedSnapshot = Model ? await Model.loadUnifiedState() : { goals: [] };
    await renderGoalsSidebar(unifiedSnapshot);

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

    listEl.innerHTML = goals.map(g => {
      const titleEsc = escapeHtmlGp(g.title || 'Untitled goal');
      const schedRaw = g.scheduleLabel || '';
      const subEsc = schedRaw ? escapeHtmlGp(schedRaw) : '';
      const subBlock = subEsc ? `<p class="gp-goal-chip-sub">${subEsc}</p>` : '';
      const accent = getGoalDisplayColor(g);
      return `<div class="gp-goal-row" data-goal-id="${g.id}" style="--gp-goal-accent:${accent};">
        <div class="gp-goal-row-main">
          <div class="gp-goal-row-info">
            <p class="gp-goal-chip-name">${titleEsc}</p>
            ${subBlock}
          </div>
          <button class="gp-goal-kebab" data-goal-id="${g.id}" aria-label="More options" title="More options">
            <span class="material-symbols-outlined gp-ms-icon" style="font-size:18px">more_vert</span>
          </button>
        </div>
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
    if (changed) await persistGpGoalsAndUnified(goals);
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

    await persistGpGoalsAndUnified(goals.filter(g => g.id !== goalId));
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
    scheduleGhostPreviewRefreshDebounced();
  }
  function closeRecurrence() {
    closeDropdowns();
    document.getElementById('gp-recurrence-overlay').classList.remove('open');
    scheduleGhostPreviewRefreshDebounced();
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
    } else {
      scheduleGhostPreviewRefreshDebounced();
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

  function ymdFromIsoStart(isoStart) {
    const d = new Date(isoStart);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function earliestSuggestionStartYmd(suggestions) {
    const list = Array.isArray(suggestions) ? suggestions : [];
    let best = null;
    for (const s of list) {
      if (!s?.isoStart) continue;
      const ymd = ymdFromIsoStart(s.isoStart);
      if (!best || ymd < best) best = ymd;
    }
    return best;
  }

  /** Recurrence-only total for creation preview (not from calendar DOM). */
  function getPreviewTotalSessions() {
    const r = state.recurrence;
    if (!r) return 0;
    const Model = globalThis.GoalPlannerModel;
    if (!Model?.computeTotalRecurringSessions) return 0;
    const start =
      earliestSuggestionStartYmd(state.suggestions) ||
      ymdFromIsoStart(new Date().toISOString());
    return Model.computeTotalRecurringSessions(r, start);
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
    const previewTotal = getPreviewTotalSessions();
    if (previewTotal > 0) {
      endsLabel = `${endsLabel} · ${previewTotal} sessions`;
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
    input.addEventListener('input', scheduleGhostPreviewRefreshDebounced);
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

  const GP_RRULE_WEEKDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

  function bydayFromIsoStart(isoStart) {
    return GP_RRULE_WEEKDAY[new Date(isoStart).getDay()];
  }

  /** RRULE UNTIL (UTC Z) at end of the local calendar day for `YYYY-MM-DD`. */
  function formatRruleUntilUtc(endDateStr) {
    const parts = String(endDateStr).split('-').map(Number);
    if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return '';
    const [y, m, day] = parts;
    const localEnd = new Date(y, m - 1, day, 23, 59, 59);
    const pad = (n) => String(n).padStart(2, '0');
    return (
      `${localEnd.getUTCFullYear()}${pad(localEnd.getUTCMonth() + 1)}${pad(localEnd.getUTCDate())}` +
      `T${pad(localEnd.getUTCHours())}${pad(localEnd.getUTCMinutes())}${pad(localEnd.getUTCSeconds())}Z`
    );
  }

  /** Split "ends after N sessions" across one recurring master per weekday. */
  function recurrenceCountPerSeries(rec) {
    const total = parseInt(rec.occurrences, 10);
    if (!Number.isFinite(total) || total < 1) return 1;
    const nDays = Math.max(1, (rec.days && rec.days.length) || 1);
    return Math.max(1, Math.ceil(total / nDays));
  }

  /**
   * One RRULE per session slot (preview suggestions = first week only; GCal expands future weeks).
   * MWF → three weekly masters (BYDAY=MO, BYDAY=WE, BYDAY=FR), not client-side ghost injection.
   */
  function buildRecurrenceRrulesForSession(rec, isoStart) {
    if (!rec || !isoStart) return [];
    const parts = [];
    const freq =
      rec.period === 'day' ? 'DAILY' : rec.period === 'month' ? 'MONTHLY' : 'WEEKLY';
    parts.push(`FREQ=${freq}`);
    const interval = parseInt(rec.every, 10);
    if (interval > 1) parts.push(`INTERVAL=${interval}`);
    if (freq === 'WEEKLY') parts.push(`BYDAY=${bydayFromIsoStart(isoStart)}`);
    if (freq === 'MONTHLY') {
      parts.push(`BYMONTHDAY=${new Date(isoStart).getDate()}`);
    }
    if (rec.ends === 'on' && rec.endDate) {
      const until = formatRruleUntilUtc(rec.endDate);
      if (until) parts.push(`UNTIL=${until}`);
    } else if (rec.ends === 'after') {
      parts.push(`COUNT=${recurrenceCountPerSeries(rec)}`);
    }
    return [`RRULE:${parts.join(';')}`];
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
      /**
       * Preview layer is cosmetic only — real Goal sessions come from existing
       * `state.recurrence` + `state.suggestions` POSTed below (`buildRecurrenceRrulesForSession`).
       * Strip ghost DOM immediately (and suppress pending debounced repaint) so GCal-rendered
       * instances are not stacked with preview chips during saves.
       */
      cancelDebouncedGhostPreviewAndRemoveLayers();

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

      const r = state.recurrence;

      // One recurring master per suggestion slot; GCal expands instances across future weeks.
      const eventIds = [];
      for (const s of state.suggestions) {
        const eventBody = {
          summary: `🎯 ${state.goalTitle}`,
          description: `Goal Planner session for: "${state.goalTitle}"`,
          start: { dateTime: s.isoStart, timeZone: tz },
          end: { dateTime: s.isoEnd, timeZone: tz },
          colorId: '9',
        };
        const rrules = buildRecurrenceRrulesForSession(r, s.isoStart);
        if (rrules.length) eventBody.recurrence = rrules;

        const resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(eventBody),
        });
        const data = await resp.json();
        if (!resp.ok) {
          console.error('GoalPlanner: Calendar event create failed', data);
          throw new Error(data?.error?.message || 'Calendar API error');
        }
        if (data.id) eventIds.push(data.id);
      }
      const dayNames = { SU:'Sun', MO:'Mon', TU:'Tue', WE:'Wed', TH:'Thu', FR:'Fri', SA:'Sat' };
      const dayStr = r.days.map(d => dayNames[d]).join(', ');
      const schedLabel = r.every === 1 ? `Weekly on ${dayStr}` : `Every ${r.every} ${r.period}s`;
      const startDate =
        earliestSuggestionStartYmd(state.suggestions) ||
        ymdFromIsoStart(new Date().toISOString());
      const Model = globalThis.GoalPlannerModel;
      const totalSessions = Model?.resolveGoalTotalSessions
        ? Model.resolveGoalTotalSessions({
            recurrence: r,
            endDate: r.endDate || '',
            startDate,
            sessionAnchors: state.suggestions.map((sug, i) => ({
              eventId: '',
              isoStart: sug?.isoStart || '',
            })),
            calEventIds: state.suggestions.map(() => 'pending'),
          })
        : getPreviewTotalSessions();

      const goals = await getGoals();
      if (isEditing) {
        const idx = goals.findIndex(g => g.id === state.editingGoalId);
        if (idx !== -1) {
          const sessionAnchors = [];
          for (let i = 0; i < eventIds.length; i++) {
            const sug = state.suggestions[i];
            if (sug?.isoStart && eventIds[i]) {
              sessionAnchors.push({ eventId: eventIds[i], isoStart: sug.isoStart });
            }
          }
          goals[idx] = {
            ...goals[idx],
            title: state.goalTitle,
            scheduleLabel: schedLabel,
            recurrence: { ...r },
            endDate: r.endDate || '',
            startDate,
            totalSessions,
            calEventIds: eventIds,
            sessionAnchors,
            colorId: goals[idx].colorId || '9',
            color: goals[idx].color || GP_GOAL_DEFAULT_UI_COLOR,
          };
        }
      } else {
        const sessionAnchors = [];
        for (let i = 0; i < eventIds.length; i++) {
          const sug = state.suggestions[i];
          if (sug?.isoStart && eventIds[i]) {
            sessionAnchors.push({ eventId: eventIds[i], isoStart: sug.isoStart });
          }
        }
        goals.push({
          id: generateId(),
          title: state.goalTitle,
          scheduleLabel: schedLabel,
          recurrence: { ...r },
          endDate: r.endDate || '',
          startDate,
          totalSessions,
          created: new Date().toISOString(),
          calEventIds: eventIds,
          sessionAnchors,
          colorId: '9',
          color: GP_GOAL_DEFAULT_UI_COLOR,
        });
      }
      await persistGpGoalsAndUnified(goals);

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
      scheduleGhostPreviewRefreshDebounced();
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
  function getGoals() {
    return new Promise((r) =>
      chrome.storage.local.get(['gp_goals'], (d) => {
        const g = d.gp_goals;
        r(Array.isArray(g) ? g : []);
      })
    );
  }
  function saveGoals(g) { return new Promise(r => chrome.storage.local.set({ gp_goals: g }, r)); }

  /** Persist gp_goals and mirror into goalPlannerUnifiedState so sidebar/calendar chips share one goal list. */
  async function persistGpGoalsAndUnified(goals) {
    if (!Array.isArray(goals)) return;
    const Model = globalThis.GoalPlannerModel;
    let chipDone = {};
    try {
      chipDone = await loadMergedChipDoneForSidebar(goals);
    } catch (_) {
      chipDone = {};
    }
    if (Model?.syncUnifiedWithLegacyGoals) {
      try {
        const prev = await Model.loadUnifiedState();
        const merged = Model.syncUnifiedWithLegacyGoals(prev, goals, chipDone || {});
        for (const lg of goals) {
          if (lg.sessionAnchors?.length || !(lg.calEventIds || []).length) continue;
          const ug = merged.goals.find((g) => String(g.id) === String(lg.id));
          const syn = [];
          for (const id of lg.calEventIds) {
            const s = ug?.sessions?.find((x) => x.eventId === id);
            if (s?.startTime) syn.push({ eventId: id, isoStart: s.startTime });
          }
          if (syn.length) lg.sessionAnchors = syn;
        }
      } catch (_) {
        /* non-fatal */
      }
    }
    await saveGoals(goals);
    if (!Model || typeof Model.syncUnifiedWithLegacyGoals !== 'function') return;
    const prev = await Model.loadUnifiedState();
    const next = Model.syncUnifiedWithLegacyGoals(prev, goals, chipDone || {});
    await Model.saveUnifiedState(next, { reason: 'goalsSync' });
  }

  /**
   * Copy session start times from unified state into gp_goals[].sessionAnchors when geometry sync has populated them.
   * Runs once after load so multi-session checkbox → sidebar works without re-creating the goal.
   */
  async function maybeBackfillSessionAnchorsIntoStorage() {
    try {
      const Model = globalThis.GoalPlannerModel;
      if (!Model?.syncUnifiedWithLegacyGoals) return;
      const goals = await getGoals();
      if (!Array.isArray(goals) || !goals.length) return;
      const chipDone = await loadMergedChipDoneForSidebar(goals);
      const prev = await Model.loadUnifiedState();
      const merged = Model.syncUnifiedWithLegacyGoals(prev, goals, chipDone || {});
      let changed = false;
      for (const lg of goals) {
        if (lg.sessionAnchors?.length || !(lg.calEventIds || []).length) continue;
        const ug = merged.goals.find((g) => String(g.id) === String(lg.id));
        const syn = [];
        for (const id of lg.calEventIds) {
          const s = ug?.sessions?.find((x) => x.eventId === id);
          if (s?.startTime) syn.push({ eventId: id, isoStart: s.startTime });
        }
        if (syn.length) {
          lg.sessionAnchors = syn;
          changed = true;
        }
      }
      if (changed) await saveGoals(goals);
    } catch (_) {
      /* ignore */
    }
  }

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

  /** Loose membership: calEventIds may be numbers while DOM/API ids are strings (JSON/storage coercion). */
  function calEventIdsContain(calIds, candidate) {
    if (candidate == null || candidate === '') return false;
    const c = String(candidate);
    return (Array.isArray(calIds) ? calIds : []).some((id) => String(id) === c);
  }

  /**
   * Align DOM `data-eventid` / transient chip keys with `gp_goals[].calEventIds[]` so `gp_chip_done` ↔ sidebar merge works.
   */
  function resolvePlannerEventIdForChip(domOrStoredId, legacyGoals) {
    const raw = domOrStoredId && String(domOrStoredId).trim();
    if (!raw) return '';
    const goals = Array.isArray(legacyGoals) ? legacyGoals : [];
    const allIds = [];
    for (const g of goals) {
      for (const id of g.calEventIds || []) {
        if (id) allIds.push(id);
      }
    }
    for (const id of allIds) {
      if (String(id) === String(raw)) return id;
    }
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw.replace(/\+/g, ' '));
    } catch (_) {
      decoded = raw;
    }
    if (decoded !== raw) {
      for (const id of allIds) {
        if (String(id) === String(decoded)) return id;
      }
    }

    for (const id of allIds) {
      if (!id && id !== 0) continue;
      const instPrefix = `${id}_`;
      if (raw === id || decoded === id || String(raw) === String(id)) return id;
      if (raw.startsWith(instPrefix) || decoded.startsWith(instPrefix)) return id;
    }

    return raw;
  }

  /**
   * Which Planner goal row this decorated chip belongs to (title on chip vs gp_goals.title).
   */
  function findLegacyGoalForGoalChip(chip, legacyGoals) {
    const goals = Array.isArray(legacyGoals) ? legacyGoals : [];
    const titleFromChip =
      chip.querySelector('.ext-goal-title')?.textContent?.replace(/🎯\s*/g, '').trim() || '';
    const blob = `${titleFromChip}\n${chip.textContent || ''}`;
    const hits = goals.filter((g) => {
      const t = String(g.title || '').trim();
      return t && (blob.includes(t) || titleFromChip.includes(t));
    });
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {
      const domId = chip.closest('[data-eventid]')?.getAttribute('data-eventid')?.trim() || '';
      if (domId) {
        const narrowed = hits.filter((g) =>
          (g.calEventIds || []).some(
            (id) =>
              id &&
              (domId === id ||
                domId.startsWith(`${id}_`) ||
                String(domId).includes(String(id)) ||
                String(id).includes(String(domId)))
          )
        );
        if (narrowed.length === 1) return narrowed[0];
      }
      return hits[0];
    }
    return goals.find((g) => {
      const t = String(g.title || '').trim();
      return t && blob.includes(t);
    }) || null;
  }

  /**
   * Map a calendar chip → stable id in gp_goals[].calEventIds[] + goal id for sidebar refresh.
   * DOM `data-eventid` often !== API id string; title match + single-session shortcut fixes gp_chip_done writes.
   */
  function resolveChipCompletionTarget(chip, legacyGoals) {
    const domId =
      chip.closest('[data-eventid]')?.getAttribute('data-eventid')?.trim() || '';
    const goal = findLegacyGoalForGoalChip(chip, legacyGoals);
    if (!goal) {
      const plannerEventId = resolvePlannerEventIdForChip(domId, legacyGoals);
      return { plannerEventId: plannerEventId || domId, goalId: null };
    }
    const ids = goal.calEventIds || [];
    const viaResolve = resolvePlannerEventIdForChip(domId, [goal]);
    if (viaResolve && calEventIdsContain(ids, viaResolve)) {
      return { plannerEventId: viaResolve, goalId: goal.id };
    }
    if (domId && calEventIdsContain(ids, domId)) {
      return { plannerEventId: domId, goalId: goal.id };
    }
    const related = ids.filter((id) => {
      if (!id || !domId) return false;
      return (
        domId === id ||
        domId.startsWith(`${id}_`) ||
        String(id).startsWith(`${domId}_`) ||
        String(domId).includes(String(id)) ||
        String(id).includes(String(domId))
      );
    });
    if (related.length === 1) {
      return { plannerEventId: related[0], goalId: goal.id };
    }
    if (ids.length === 1) {
      return { plannerEventId: ids[0], goalId: goal.id };
    }
    const fallback = resolvePlannerEventIdForChip(domId, legacyGoals);
    if (fallback && calEventIdsContain(ids, fallback)) {
      return { plannerEventId: fallback, goalId: goal.id };
    }
    return { plannerEventId: domId || fallback || '', goalId: goal.id };
  }

  /** Match chip grid position → calendar API event id using saved suggestion timestamps (multi-session goals). */
  function pickPlannerEventIdFromAnchors(chip, goal) {
    const anchors = goal?.sessionAnchors;
    if (!anchors?.length) return '';
    const geo = globalThis.GoalCalendarSync?.computeSessionRangeFromGeometry?.(chip);
    if (!geo?.startTime) return '';
    const target = Date.parse(geo.startTime);
    if (!Number.isFinite(target)) return '';
    let best = '';
    let bestDelta = Infinity;
    for (const a of anchors) {
      if (!a?.eventId || !a?.isoStart) continue;
      const ms = Date.parse(a.isoStart);
      if (!Number.isFinite(ms)) continue;
      const d = Math.abs(ms - target);
      if (d < bestDelta) {
        bestDelta = d;
        best = a.eventId;
      }
    }
    const allowed = goal.calEventIds || [];
    if (best && calEventIdsContain(allowed, best) && bestDelta <= 8 * 60 * 60 * 1000) return best;
    return '';
  }

  /**
   * Which index in goal.calEventIds[] this chip/session corresponds to for gp_goal_slot_done
   * when DOM/API ids diverge from stored calendar ids.
   */
  function computeSlotIndexForGoalSession(chip, goalRow, plannerEventId, storageKey) {
    const ids = goalRow?.calEventIds || [];
    if (!ids.length) return -1;
    const p = plannerEventId != null ? String(plannerEventId) : '';
    const sk = storageKey != null ? String(storageKey) : '';

    let j = ids.findIndex((id) => String(id) === p);
    if (j >= 0) return j;

    for (let i = 0; i < ids.length; i++) {
      if (p && gpChipDoneMirrorStrictPair(String(ids[i]), p)) return i;
      if (sk && gpChipDoneMirrorStrictPair(String(ids[i]), sk)) return i;
    }

    const narrowGoal = goalRow ? [{ calEventIds: ids }] : [];
    for (const probe of [p, sk].filter(Boolean)) {
      const hit = narrowGoal.length ? resolvePlannerEventIdForChip(probe, narrowGoal) : '';
      if (hit && calEventIdsContain(ids, hit)) {
        const jj = ids.findIndex((id) => String(id) === String(hit));
        if (jj >= 0) return jj;
      }
    }

    if (ids.length === 1) return 0;

    const anchored = pickPlannerEventIdFromAnchors(chip, goalRow);
    if (anchored) {
      j = ids.findIndex((id) => String(id) === String(anchored));
      if (j >= 0) return j;
    }

    return -1;
  }

  /** Previously saved DOM `data-eventid` for calEventIds[slot] on this goal row. */
  function resolveDomSlotIndexFromGoalRow(goalRow, domId) {
    const domIds = goalRow?.calEventDomIds || [];
    const d = domId != null && domId !== '' ? String(domId) : '';
    if (!d || !domIds.length) return -1;
    let i = domIds.findIndex((x) => x && String(x) === d);
    if (i >= 0) return i;
    for (i = 0; i < domIds.length; i++) {
      if (domIds[i] && gpChipDoneKeyMatchesCalEventId(String(domIds[i]), d)) return i;
    }
    return -1;
  }

  /** All decorated goal chips on the grid for one gp_goals row (DOM order ≠ API id). */
  function collectGoalChipsForGoalRow(goalRow, legacyGoals) {
    const gid = goalRow?.id != null ? String(goalRow.id) : '';
    if (!gid) return [];
    const pool = Array.isArray(legacyGoals) && legacyGoals.length ? legacyGoals : [goalRow];
    return [...document.querySelectorAll('[data-eventchip]')].filter((c) => {
      if (!c.querySelector('.ext-goal-root')) return false;
      if (c.dataset.gpGoalId && String(c.dataset.gpGoalId) === gid) return true;
      const row = findLegacyGoalForGoalChip(c, pool);
      return row && String(row.id) === gid;
    });
  }

  /**
   * Which session slot (0..n-1) this chip is among all goal chips visible on the calendar grid.
   * Works when DOM ids ≠ API calEventIds and anchors are missing.
   */
  function resolveSlotIndexByGoalChipsOnCalendar(chip, goalRow, legacyGoals) {
    const allowed = goalRow?.calEventIds || [];
    if (!allowed.length || !goalRow?.id) return -1;

    const chips = collectGoalChipsForGoalRow(goalRow, legacyGoals);
    if (!chips.length) return -1;
    chips.sort((a, b) => {
      const ra = (a.closest('[data-eventid]') || a).getBoundingClientRect();
      const rb = (b.closest('[data-eventid]') || b).getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });

    let idx = chips.indexOf(chip);
    if (idx < 0) {
      const ec = chip.closest('[data-eventid]');
      if (ec) {
        const chipRect = ec.getBoundingClientRect();
        let best = -1;
        let bestDist = Infinity;
        chips.forEach((c, i) => {
          const r = (c.closest('[data-eventid]') || c).getBoundingClientRect();
          const d =
            Math.abs(r.top - chipRect.top) + Math.abs(r.left - chipRect.left);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        });
        if (best >= 0 && bestDist < 80) idx = best;
      }
    }
    if (idx >= 0 && idx < allowed.length) return idx;
    return -1;
  }

  function readChipSlotIndexFromDataset(chip, allowedLen) {
    const raw = chip?.dataset?.gpSlotIdx;
    if (raw == null || raw === '') return -1;
    const n = parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < 0) return -1;
    if (allowedLen > 0 && n >= allowedLen) return -1;
    return n;
  }

  async function persistCalEventDomIdForGoalSlot(goalId, slotIdx, domId, legacyGoals) {
    if (goalId == null || goalId === '' || slotIdx < 0 || !domId) return;
    const goals = Array.isArray(legacyGoals) ? [...legacyGoals] : await getGoals();
    const gi = goals.findIndex((g) => String(g.id) === String(goalId));
    if (gi < 0) return;
    const row = { ...goals[gi] };
    const calIds = row.calEventIds || [];
    if (!calIds.length || slotIdx >= calIds.length) return;
    const domArr = Array.isArray(row.calEventDomIds) ? [...row.calEventDomIds] : [];
    while (domArr.length < calIds.length) domArr.push('');
    if (domArr[slotIdx] === domId) return;
    domArr[slotIdx] = String(domId);
    row.calEventDomIds = domArr;
    goals[gi] = row;
    try {
      await persistGpGoalsAndUnified(goals);
    } catch (_) {
      /* non-fatal */
    }
  }

  /**
   * GCal DOM `data-eventid` (often base64) ≠ Calendar API ids in gp_goals.calEventIds[].
   * Match this chip to a session slot via sessionAnchors.isoStart ↔ grid geometry / chip time.
   */
  function resolveSlotIndexByAnchorTime(chip, goalRow) {
    const allowed = goalRow?.calEventIds || [];
    const anchors = goalRow?.sessionAnchors || [];
    if (!allowed.length || !anchors.length) return -1;

    let targetMs = NaN;
    const geo = globalThis.GoalCalendarSync?.computeSessionRangeFromGeometry?.(chip);
    if (geo?.startTime) targetMs = Date.parse(geo.startTime);

    if (!Number.isFinite(targetMs)) {
      const aria = chip.closest('[data-eventid]')?.getAttribute('aria-label') || '';
      const m = aria.match(
        /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i
      );
      if (m) {
        const now = new Date();
        let h = parseInt(m[1], 10) % 12;
        if (/pm/i.test(m[3])) h += 12;
        const min = m[2] ? parseInt(m[2], 10) : 0;
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min, 0, 0);
        targetMs = d.getTime();
      }
    }

    if (!Number.isFinite(targetMs)) return -1;

    let bestIdx = -1;
    let bestDelta = Infinity;
    for (const a of anchors) {
      if (!a?.isoStart || a.eventId == null || a.eventId === '') continue;
      const ms = Date.parse(a.isoStart);
      if (!Number.isFinite(ms)) continue;
      const idx = allowed.findIndex((id) => String(id) === String(a.eventId));
      if (idx < 0) continue;
      const d = Math.abs(ms - targetMs);
      if (d < bestDelta) {
        bestDelta = d;
        bestIdx = idx;
      }
    }
    if (bestIdx >= 0 && bestDelta <= 12 * 60 * 60 * 1000) return bestIdx;
    return -1;
  }

  async function resolveCalEventIdForChipSession(chip, goalRow, legacyGoals, chipDoneMap) {
    if (!goalRow) return '';
    const allowed = goalRow.calEventIds || [];
    if (!allowed.length) return '';

    const stored = chip.dataset.gpCalEventId;
    if (stored && calEventIdsContain(allowed, stored)) return String(stored);

    let slotIdx = resolveDomSlotIndexFromGoalRow(
      goalRow,
      chip.closest('[data-eventid]')?.getAttribute('data-eventid')
    );
    if (slotIdx < 0) slotIdx = readChipSlotIndexFromDataset(chip, allowed.length);
    if (slotIdx < 0) slotIdx = resolveSlotIndexByGoalChipsOnCalendar(chip, goalRow, legacyGoals);
    if (slotIdx < 0) slotIdx = resolveSlotIndexByAnchorTime(chip, goalRow);
    if (slotIdx >= 0 && allowed[slotIdx] != null) {
      const id = String(allowed[slotIdx]);
      chip.dataset.gpCalEventId = id;
      chip.dataset.gpSlotIdx = String(slotIdx);
      return id;
    }

    const fromAnchors = pickPlannerEventIdFromAnchors(chip, goalRow);
    if (fromAnchors && calEventIdsContain(allowed, fromAnchors)) {
      chip.dataset.gpCalEventId = String(fromAnchors);
      return String(fromAnchors);
    }

    try {
      const fromUnified = await pickPlannerEventIdFromUnifiedSessions(
        chip,
        goalRow,
        legacyGoals || [],
        chipDoneMap || {}
      );
      if (fromUnified && calEventIdsContain(allowed, fromUnified)) {
        chip.dataset.gpCalEventId = String(fromUnified);
        return String(fromUnified);
      }
    } catch (_) {
      /* ignore */
    }
    return '';
  }

  /** Resolve calEventIds[] index for this checkbox (mirror keys → anchors → grid time). */
  async function resolveSlotIndexForGoalToggle(
    chip,
    goalRow,
    plannerEventId,
    storageKey,
    mirrorKeys,
    legacyGoals
  ) {
    const allowed = goalRow?.calEventIds || [];
    if (!allowed.length) return -1;

    let idx = readChipSlotIndexFromDataset(chip, allowed.length);
    if (idx < 0) idx = resolveDomSlotIndexFromGoalRow(goalRow, storageKey);
    if (idx < 0) idx = resolveSlotIndexByGoalChipsOnCalendar(chip, goalRow, legacyGoals);
    if (idx < 0) idx = resolveSlotIndexByAnchorTime(chip, goalRow);
    if (idx < 0) idx = computeSlotIndexForGoalSession(chip, goalRow, plannerEventId, storageKey);
    if (idx >= 0) return idx;

    const probes = [...(mirrorKeys || []), plannerEventId, storageKey]
      .filter((x) => x != null && x !== '')
      .map(String);
    idx = allowed.findIndex((id) =>
      probes.some(
        (mk) =>
          String(id) === mk ||
          gpChipDoneMirrorStrictPair(String(id), mk) ||
          gpChipDoneKeyMatchesCalEventId(String(id), mk)
      )
    );
    if (idx >= 0) return idx;

    const fromAnchors = pickPlannerEventIdFromAnchors(chip, goalRow);
    if (fromAnchors) {
      idx = allowed.findIndex((id) => String(id) === String(fromAnchors));
      if (idx >= 0) return idx;
    }

    try {
      const fromUnified = await pickPlannerEventIdFromUnifiedSessions(
        chip,
        goalRow,
        legacyGoals || [],
        {}
      );
      if (fromUnified) {
        idx = allowed.findIndex((id) => String(id) === String(fromUnified));
        if (idx >= 0) return idx;
      }
    } catch (_) {
      /* ignore */
    }

    if (allowed.length === 1) return 0;
    return -1;
  }

  function stampCalEventIdOnChipMap(map, allowedIds, slotIdx, nextDone) {
    if (slotIdx < 0 || !Array.isArray(allowedIds) || slotIdx >= allowedIds.length) return map;
    const calKey = String(allowedIds[slotIdx]);
    if (!calKey) return map;
    if (nextDone) map[calKey] = true;
    else delete map[calKey];
    return map;
  }

  /** When unified sessions have startTime from geometry sync, pick best calEventId for this chip. */
  async function pickPlannerEventIdFromUnifiedSessions(chip, goal, legacyGoals, chipDoneMap) {
    const ids = goal?.calEventIds || [];
    if (!ids.length) return '';
    const geo = globalThis.GoalCalendarSync?.computeSessionRangeFromGeometry?.(chip);
    if (!geo?.startTime) return '';
    const target = Date.parse(geo.startTime);
    if (!Number.isFinite(target)) return '';
    const Model = globalThis.GoalPlannerModel;
    if (!Model) return '';
    let st;
    try {
      st = await Model.loadUnifiedState();
    } catch (_) {
      return '';
    }
    try {
      st = Model.syncUnifiedWithLegacyGoals(st, legacyGoals, chipDoneMap || {});
    } catch (_) {
      return '';
    }
    const ug = st.goals.find((g) => String(g.id) === String(goal.id));
    const sessions = ug?.sessions || [];
    let best = '';
    let bestDelta = Infinity;
    for (const s of sessions) {
      if (!s?.eventId || !calEventIdsContain(ids, s.eventId) || !s.startTime) continue;
      const ms = Date.parse(s.startTime);
      if (!Number.isFinite(ms)) continue;
      const d = Math.abs(ms - target);
      if (d < bestDelta) {
        bestDelta = d;
        best = s.eventId;
      }
    }
    if (best && bestDelta <= 8 * 60 * 60 * 1000) return best;
    return '';
  }

  /** Synthetic sessionAnchors from unified model when gp_goals rows lack them (multi-session slot match). */
  async function enrichGoalRowWithUnifiedAnchors(goalRow, legacyGoals, chipDoneMap) {
    if (!goalRow || goalRow.sessionAnchors?.length) return goalRow;
    const Model = globalThis.GoalPlannerModel;
    if (!Model) return goalRow;
    try {
      let st = await Model.loadUnifiedState();
      st = Model.syncUnifiedWithLegacyGoals(st, legacyGoals, chipDoneMap || {});
      const ug = st.goals.find((g) => String(g.id) === String(goalRow.id));
      const calIds = goalRow.calEventIds || [];
      const syn = [];
      if (ug?.sessions?.length && calIds.length) {
        for (const id of calIds) {
          const s = ug.sessions.find((x) => x.eventId === id);
          if (s?.startTime) syn.push({ eventId: id, isoStart: s.startTime });
        }
        if (syn.length) return { ...goalRow, sessionAnchors: syn };
      }
    } catch (_) {
      /* ignore */
    }
    return goalRow;
  }

  /**
   * Final planner event id for gp_chip_done — must exist in goal.calEventIds[].
   * Sync helpers cannot async; checkbox handler resolves asynchronously.
   */
  async function resolvePlannerEventIdForSidebarSync(chip, storageKey, legacyGoals, chipDoneMap) {
    const domId =
      chip.closest('[data-eventid]')?.getAttribute('data-eventid')?.trim() || '';
    const goal = findLegacyGoalForGoalChip(chip, legacyGoals);
    let plannerEventId = '';
    const anchorGoal = goal ? await enrichGoalRowWithUnifiedAnchors(goal, legacyGoals, chipDoneMap) : goal;
    const calFromSession = await resolveCalEventIdForChipSession(
      chip,
      anchorGoal || goal,
      legacyGoals,
      chipDoneMap
    );
    if (calFromSession) plannerEventId = calFromSession;
    const quick = resolveChipCompletionTarget(chip, legacyGoals);
    const ids = goal?.calEventIds || [];
    if (!plannerEventId && quick.plannerEventId && calEventIdsContain(ids, quick.plannerEventId)) {
      plannerEventId = quick.plannerEventId;
    }
    if (!plannerEventId && goal) {
      const norm = resolvePlannerEventIdForChip(domId || storageKey || '', [goal]);
      if (norm && calEventIdsContain(ids, norm)) plannerEventId = norm;
    }

    if (!plannerEventId && anchorGoal) {
      const fromAnchors = pickPlannerEventIdFromAnchors(chip, anchorGoal);
      if (fromAnchors && calEventIdsContain(ids, fromAnchors)) plannerEventId = fromAnchors;
    }
    if (!plannerEventId && anchorGoal) {
      const fromUnified = await pickPlannerEventIdFromUnifiedSessions(
        chip,
        anchorGoal,
        legacyGoals,
        chipDoneMap
      );
      if (fromUnified && calEventIdsContain(ids, fromUnified)) plannerEventId = fromUnified;
    }
    if (!plannerEventId && goal && ids.length === 1) plannerEventId = ids[0];
    if (!plannerEventId && domId && calEventIdsContain(ids, domId)) plannerEventId = domId;
    if (!plannerEventId) {
      const fb = resolvePlannerEventIdForChip(storageKey || domId, legacyGoals);
      if (fb && calEventIdsContain(ids, fb)) plannerEventId = fb;
    }
    if (!plannerEventId) plannerEventId = quick.plannerEventId || storageKey || domId || '';
    const metaGoalId = goal?.id != null && goal.id !== '' ? goal.id : quick.goalId;
    return { plannerEventId, goalId: metaGoalId };
  }

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

      // Canonical id must match gp_goals[].calEventIds[] for sidebar sync (gp_chip_done ↔ unified model).
      const canonicalEventKey =
        chip.closest('[data-eventid]')?.getAttribute('data-eventid') || chip.dataset.gpChipKey;
      if (!canonicalEventKey) return;

      if (GP_GOAL_CLICK_DEBUG) {
        console.log('[GoalPlanner] checkbox click', {
          target: e.target,
          checkbox,
          canonicalEventKey,
          bubbles: e.bubbles,
        });
      }

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      this.toggleCompletion(canonicalEventKey, chip);
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

    toggleCompletion(canonicalEventKey, chip) {
      const nextDone = !chip.classList.contains('ext-goal-completed');
      this.applyGoalSessionCompletionUI(chip, nextDone);

      const liveEid = chip.closest('[data-eventid]')?.getAttribute('data-eventid');
      const storageKey = liveEid || canonicalEventKey;

      chrome.storage.local.get(['gp_chip_done', 'gp_goals', 'gp_goal_slot_done'], (d) => {
        void (async () => {
          const legacyGoals = Array.isArray(d.gp_goals) ? d.gp_goals : [];
          const chipDoneSnapshot = { ...(d.gp_chip_done || {}) };
          const slotPackPrev =
            d.gp_goal_slot_done && typeof d.gp_goal_slot_done === 'object'
              ? { ...d.gp_goal_slot_done }
              : {};
          let plannerEventId = '';
          let goalId = null;
          try {
            const resolved = await resolvePlannerEventIdForSidebarSync(
              chip,
              storageKey,
              legacyGoals,
              chipDoneSnapshot
            );
            plannerEventId = resolved.plannerEventId || '';
            goalId = resolved.goalId;
          } catch (_) {
            plannerEventId = '';
          }
          const goalRow = findLegacyGoalForGoalChip(chip, legacyGoals);
          const allowed = goalRow?.calEventIds || [];
          if ((goalId == null || goalId === '') && goalRow?.id != null && goalRow.id !== '') {
            goalId = goalRow.id;
          }
          if (allowed.length && plannerEventId && !calEventIdsContain(allowed, plannerEventId)) {
            const alt = resolvePlannerEventIdForChip(storageKey || plannerEventId, legacyGoals);
            if (alt && calEventIdsContain(allowed, alt)) plannerEventId = alt;
          }
          if (!plannerEventId && allowed.length === 1) plannerEventId = allowed[0];
          if (!plannerEventId) plannerEventId = storageKey || canonicalEventKey || '';
          if (!plannerEventId) {
            GoalInteractionController.applyGoalSessionCompletionUI(chip, !nextDone);
            return;
          }
          const gid = goalRow?.id != null ? String(goalRow.id) : '';
          let slotGoalRow = goalRow;
          if (goalRow) {
            try {
              slotGoalRow = await enrichGoalRowWithUnifiedAnchors(
                goalRow,
                legacyGoals,
                chipDoneSnapshot
              );
            } catch (_) {
              slotGoalRow = goalRow;
            }
          }

          let slotIdx = readChipSlotIndexFromDataset(chip, allowed.length);
          if (slotIdx < 0) slotIdx = resolveDomSlotIndexFromGoalRow(slotGoalRow, storageKey);
          if (slotIdx < 0) slotIdx = resolveSlotIndexByGoalChipsOnCalendar(chip, slotGoalRow, legacyGoals);
          if (slotIdx < 0) slotIdx = resolveSlotIndexByAnchorTime(chip, slotGoalRow);
          if (slotIdx < 0) {
            slotIdx = await resolveSlotIndexForGoalToggle(
              chip,
              slotGoalRow,
              plannerEventId,
              storageKey,
              [],
              legacyGoals
            );
          }

          if (slotIdx >= 0 && allowed[slotIdx] != null) {
            plannerEventId = String(allowed[slotIdx]);
            chip.dataset.gpCalEventId = plannerEventId;
            chip.dataset.gpSlotIdx = String(slotIdx);
            if (gid && storageKey) {
              await persistCalEventDomIdForGoalSlot(gid, slotIdx, storageKey, legacyGoals);
            }
          } else {
            const calApiId = await resolveCalEventIdForChipSession(
              chip,
              slotGoalRow,
              legacyGoals,
              chipDoneSnapshot
            );
            if (calApiId && calEventIdsContain(allowed, calApiId)) {
              plannerEventId = calApiId;
              slotIdx = allowed.findIndex((id) => String(id) === String(calApiId));
            }
          }

          if (plannerEventId) chip.dataset.gpChipKey = plannerEventId;

          const mirrorKeys = mirrorGpChipDoneKeysForSession(plannerEventId, allowed);
          const map = { ...chipDoneSnapshot };
          if (nextDone) {
            if (storageKey) map[storageKey] = true;
            for (const k of mirrorKeys) map[k] = true;
          } else {
            if (storageKey) delete map[storageKey];
            for (const k of mirrorKeys) delete map[k];
          }

          stampCalEventIdOnChipMap(map, allowed, slotIdx, nextDone);
          if (gid && slotIdx >= 0) {
            const prevArr = Array.isArray(slotPackPrev[gid]) ? slotPackPrev[gid] : [];
            const sset = new Set(
              prevArr.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 0)
            );
            if (nextDone) sset.add(slotIdx);
            else sset.delete(slotIdx);
            slotPackPrev[gid] = [...sset].sort((a, b) => a - b);
          } else if (gid && nextDone && allowed.length) {
            console.warn('[gp-my-goals] could not resolve session slot index', {
              goalId: gid,
              calEventIds: allowed,
              plannerEventId,
              storageKey,
              sessionAnchors: (slotGoalRow?.sessionAnchors || []).length,
              goalChipsOnPage: document.querySelectorAll('[data-eventchip]').length,
            });
          } else if (gid && slotIdx >= 0) {
            console.info('[gp-my-goals] session slot resolved', {
              goalId: gid,
              slotIdx,
              apiEventId: allowed[slotIdx],
            });
          }

          chrome.storage.local.set({ gp_chip_done: map, gp_goal_slot_done: slotPackPrev }, async () => {
            const persistEventId =
              allowed.find((id) =>
                mirrorKeys.some((mk) => String(mk) === String(id))
              ) || plannerEventId;
            try {
              await globalThis.GoalCalendarSync?.persistSessionCompleted?.(
                persistEventId,
                nextDone,
                {
                  legacyGoals,
                  chipDoneMap: map,
                  slotPack: slotPackPrev,
                }
              );
            } catch (_) {
              /* ignore */
            }

            let metaSidebar = {
              reason: 'sessionCompletion',
              chipDoneOverride: injectSlotDoneIntoExpandedChipDone(
                expandChipDoneOntoCalEventIds(map, legacyGoals),
                legacyGoals,
                slotPackPrev
              ),
              slotPackOverride: slotPackPrev,
            };
            if (goalId != null && goalId !== '') metaSidebar.goalId = goalId;
            try {
              const Model = globalThis.GoalPlannerModel;
              if ((!metaSidebar.goalId || metaSidebar.goalId === '') && Model && persistEventId) {
                const stHit = await Model.loadUnifiedState();
                let hit = Model.findSessionByEventId(stHit, persistEventId);
                if (
                  !hit &&
                  plannerEventId &&
                  String(plannerEventId) !== String(persistEventId)
                ) {
                  hit = Model.findSessionByEventId(stHit, plannerEventId);
                }
                if (hit?.goal?.id != null && hit.goal.id !== '') metaSidebar.goalId = hit.goal.id;
              }
              if (!metaSidebar.goalId) {
                const lid = legacyGoalIdForPlannerEventCandidates(
                  legacyGoals,
                  persistEventId,
                  plannerEventId,
                  storageKey
                );
                if (lid) metaSidebar.goalId = lid;
              }
            } catch (_) {
              /* sidebar optional */
            }

            try {
              if (goalPlannerModelAvailable()) {
                await patchMyGoalsSidebarProgressRows(null, metaSidebar);
              }
            } catch (_) {
              /* ignore */
            }
            chrome.runtime.sendMessage({ type: 'GOAL_TOGGLE', id: plannerEventId, complete: nextDone });
            renderHomeScreen();
          });
        })();
      });
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
      if (goalData.id != null && goalData.id !== '') {
        chip.dataset.gpGoalId = String(goalData.id);
      }
      if (goalData.slotIdx != null && goalData.slotIdx !== '' && Number.isFinite(Number(goalData.slotIdx))) {
        chip.dataset.gpSlotIdx = String(goalData.slotIdx);
      }
      {
        const liveEid = chip.closest('[data-eventid]')?.getAttribute('data-eventid');
        chip.dataset.gpChipKey = liveEid || goalData.chipKey;
      }
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
          const eidAttr = chip.closest('[data-eventid]')?.getAttribute('data-eventid');
          const prevDatasetKey = chip.dataset.gpChipKey;
          const target = resolveChipCompletionTarget(chip, goals);
          const goalRowForChip = target.goalId
            ? goals.find((g) => String(g.id) === String(target.goalId))
            : findLegacyGoalForGoalChip(chip, goals);
          let canonicalPlannerId =
            target.plannerEventId ||
            resolvePlannerEventIdForChip(eidAttr || prevDatasetKey || '', goals) ||
            eidAttr ||
            prevDatasetKey;
          if (goalRowForChip) {
            const slotFromTime = resolveSlotIndexByAnchorTime(chip, goalRowForChip);
            if (slotFromTime >= 0 && goalRowForChip.calEventIds?.[slotFromTime]) {
              canonicalPlannerId = String(goalRowForChip.calEventIds[slotFromTime]);
              chip.dataset.gpCalEventId = canonicalPlannerId;
            }
          }
          const isDone = !!(
            doneMap[prevDatasetKey] ||
            doneMap[eidAttr] ||
            (canonicalPlannerId && doneMap[canonicalPlannerId])
          );
          if (canonicalPlannerId) chip.dataset.gpChipKey = canonicalPlannerId;
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
        const eid =
          chip.closest('[data-eventid]') && chip.closest('[data-eventid]').getAttribute('data-eventid');
        const goal = findLegacyGoalForGoalChip(chip, goals);
        let resolvedEid = eid ? resolvePlannerEventIdForChip(eid, goals) || eid : '';
        let slotIdx = -1;
        if (goal) {
          slotIdx = readChipSlotIndexFromDataset(chip, (goal.calEventIds || []).length);
          if (slotIdx < 0) slotIdx = resolveDomSlotIndexFromGoalRow(goal, eid);
          if (slotIdx < 0) slotIdx = resolveSlotIndexByGoalChipsOnCalendar(chip, goal, goals);
          if (slotIdx < 0) slotIdx = resolveSlotIndexByAnchorTime(chip, goal);
          if (slotIdx >= 0 && goal.calEventIds?.[slotIdx]) {
            resolvedEid = String(goal.calEventIds[slotIdx]);
            chip.dataset.gpCalEventId = resolvedEid;
            chip.dataset.gpSlotIdx = String(slotIdx);
            if (eid) {
              void persistCalEventDomIdForGoalSlot(goal.id, slotIdx, eid, goals);
            }
          }
        }
        const chipKey =
          resolvedEid ||
          (goal ? goal.id + ':' + chip.textContent.trim().slice(0, 40) : 'tx:' + chip.textContent.trim().slice(0, 50));

        const goalData = {
          title,
          time,
          chipKey,
          id: goal ? goal.id : null,
          slotIdx: slotIdx >= 0 ? slotIdx : undefined,
        };
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
        const p = document.getElementById('gp-panel');
        if (p?.classList.contains('open')) renderGhostEvents();
      }, 1200);
      // Re-apply goal session decorations after navigation (GCal re-renders all chips)
      setTimeout(scheduleGoalEventDecoration, 1400);
    }
  }).observe(document.body, { childList: true, subtree: true });

})();
