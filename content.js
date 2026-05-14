// Goal Planner v3 — content.js
// Screens: empty → goal name + schedule → recurrence overlay → suggested sessions

(function () {
  'use strict';

  const GP_PANEL_WIDTH_PX = 320;
  const GP_MAIN_MARGIN_TRANSITION = 'margin-right 0.2s ease';

  // ── State ──
  let state = {
    goalTitle: '',
    recurrence: null,   // { every: 1, period: 'week', days: ['M','W','F'], time: '21:00', sessionMins: 60, ends: 'on', endDate: '', occurrences: 13 }
    suggestions: [],    // [{ date, startTime, endTime }]
  };

  // ── Inject once ──
  function inject() {
    if (document.getElementById('gp-panel')) return;
    const btn = createRailBtn();
    const panel = createPanel();
    document.body.appendChild(panel);

    const rail = findRailByStructure();
    if (rail) {
      rail.appendChild(btn);
    } else {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;right:8px;top:120px;z-index:999;display:flex;flex-direction:column;gap:8px;align-items:center;';
      wrap.appendChild(btn);
      document.body.appendChild(wrap);
    }

    wireEvents();
    renderHomeScreen();
    setupCalendarPushObserver();
  }

  /** Main calendar region that natively shrinks when Tasks/Notes opens — push layout, not overlay. */
  let cachedCalendarMainEl = null;
  function getCalendarMainEl() {
    if (cachedCalendarMainEl && document.contains(cachedCalendarMainEl)) return cachedCalendarMainEl;
    const candidates = [
      document.querySelector('[role="main"]'),
      document.querySelector('main'),
    ].filter(Boolean);
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      if (r.width >= 280 && r.height >= 200) {
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
    mainEl.style.transition = GP_MAIN_MARGIN_TRANSITION;
    mainEl.style.marginRight = open ? `${GP_PANEL_WIDTH_PX}px` : '';
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
    return [...document.querySelectorAll('*')].find(el => {
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (s.position === 'fixed' || s.position === 'sticky')
        && r.right > window.innerWidth - 80 && r.width < 80 && el.children.length >= 2;
    });
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
          <h2>My goals</h2>
          <div class="gp-header-actions">
            <button class="gp-icon-btn" id="gp-add-btn" title="New goal">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="gp-icon-btn" id="gp-close-btn" title="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>
        <div class="gp-divider"></div>

        <!-- ── SCREEN 1: Empty / home ── -->
        <div class="gp-screen active" id="gp-screen-home">
          <div class="gp-tasks-accordion" id="gp-tasks-accordion">
            <section class="gp-task-folder" data-folder="today">
              <div class="gp-task-folder-header">
                <span class="gp-task-folder-label">Due Today (3)</span>
                <button class="gp-task-folder-toggle" type="button" aria-expanded="false" aria-label="Toggle Due Today tasks">
                  <svg class="gp-task-folder-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </div>
              <div class="gp-task-folder-panel">
                <div class="gp-task-folder-panel-inner">
                  <div class="gp-task-item"><span class="gp-task-skeleton"></span></div>
                  <div class="gp-task-item"><span class="gp-task-skeleton gp-task-skeleton--short"></span></div>
                  <div class="gp-task-item"><span class="gp-task-skeleton"></span></div>
                </div>
              </div>
            </section>
            <section class="gp-task-folder" data-folder="tomorrow">
              <div class="gp-task-folder-header">
                <span class="gp-task-folder-label">Due Tomorrow (1)</span>
                <button class="gp-task-folder-toggle" type="button" aria-expanded="false" aria-label="Toggle Due Tomorrow tasks">
                  <svg class="gp-task-folder-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </div>
              <div class="gp-task-folder-panel">
                <div class="gp-task-folder-panel-inner">
                  <div class="gp-task-item"><span class="gp-task-skeleton"></span></div>
                  <div class="gp-task-item"><span class="gp-task-skeleton gp-task-skeleton--short"></span></div>
                </div>
              </div>
            </section>
            <section class="gp-task-folder" data-folder="later">
              <div class="gp-task-folder-header">
                <span class="gp-task-folder-label">Due Later (2)</span>
                <button class="gp-task-folder-toggle" type="button" aria-expanded="false" aria-label="Toggle Due Later tasks">
                  <svg class="gp-task-folder-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </div>
              <div class="gp-task-folder-panel">
                <div class="gp-task-folder-panel-inner">
                  <div class="gp-task-item"><span class="gp-task-skeleton"></span></div>
                  <div class="gp-task-item"><span class="gp-task-skeleton gp-task-skeleton--short"></span></div>
                  <div class="gp-task-item"><span class="gp-task-skeleton"></span></div>
                </div>
              </div>
            </section>
            <section class="gp-task-folder" data-folder="completed">
              <div class="gp-task-folder-header">
                <span class="gp-task-folder-label">Completed (15)</span>
                <button class="gp-task-folder-toggle" type="button" aria-expanded="false" aria-label="Toggle Completed tasks">
                  <svg class="gp-task-folder-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </div>
              <div class="gp-task-folder-panel">
                <div class="gp-task-folder-panel-inner">
                  <div class="gp-task-item"><span class="gp-task-skeleton gp-task-skeleton--muted"></span></div>
                  <div class="gp-task-item"><span class="gp-task-skeleton gp-task-skeleton--short gp-task-skeleton--muted"></span></div>
                </div>
              </div>
            </section>
          </div>
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
        <div class="gp-screen" id="gp-screen-form" style="position:relative;">
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
            <button class="gp-btn-primary" id="gp-to-suggestions" disabled>Add to Calendar</button>
            <button class="gp-btn-secondary" id="gp-adjust-sessions" disabled>Adjust Sessions</button>
          </div>

          <!-- Recurrence overlay (sits over screen 2) -->
          <div id="gp-recurrence-overlay">
            <div class="gp-recurrence-sheet">
              <div class="gp-rec-inner">
                <p class="gp-rec-title">Select recurrence</p>

                <p class="gp-rec-label">Repeats every</p>
                <div class="gp-rec-freq">
                  <input class="gp-rec-num-input" type="number" id="gp-freq-num" value="1" min="1" max="12"/>
                  <select class="gp-rec-period-select" id="gp-freq-period">
                    <option value="day">day</option>
                    <option value="week" selected>week</option>
                    <option value="month">month</option>
                  </select>
                </div>

                <div>
                  <p class="gp-rec-label" style="margin-bottom:12px">Repeat on</p>
                  <div class="gp-days" id="gp-days-selector">
                    ${['S','M','T','W','T','F','S'].map((d,i) =>
                      `<button class="gp-day-btn${['M','W','F'].includes(d) && i !== 0 && i !== 6 ? ' selected' : ''}" data-day="${['SU','MO','TU','WE','TH','FR','SA'][i]}">${d}</button>`
                    ).join('')}
                  </div>
                </div>

                <div>
                  <p class="gp-rec-label" style="margin-bottom:8px">Set time</p>
                  <input class="gp-time-input" type="time" id="gp-rec-time" value="21:00"/>
                </div>

                <div>
                  <p class="gp-rec-label" style="margin-bottom:8px">Session length</p>
                  <div class="gp-session-row">
                    <input class="gp-session-input" type="number" id="gp-session-mins" value="60" min="15" max="240" step="15"/>
                    <span class="gp-session-unit">minutes</span>
                  </div>
                </div>

                <div class="gp-ends">
                  <p class="gp-rec-label" style="margin-bottom:4px">Ends</p>
                  <div class="gp-radio-row">
                    <input type="radio" name="gp-ends" id="gp-ends-never" value="never"/>
                    <label for="gp-ends-never">Never</label>
                  </div>
                  <div class="gp-radio-row">
                    <input type="radio" name="gp-ends" id="gp-ends-on" value="on" checked/>
                    <label for="gp-ends-on">On</label>
                    <input class="gp-end-date-input" type="date" id="gp-end-date" value="${defaultEndDate()}"/>
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
          </div>
        </div>

        <!-- ── SCREEN 3: Suggested sessions ── -->
        <div class="gp-screen" id="gp-screen-suggestions">
          <div class="gp-field">
            <span class="gp-field-label">Goal Name</span>
            <div class="gp-input-box gp-input-box-static">
              <span id="gp-confirm-title" class="gp-confirm-title-text"></span>
            </div>
          </div>
          <div class="gp-field" style="margin-top:20px;">
            <span class="gp-field-label">Schedule</span>
            <div class="gp-chip" id="gp-confirm-schedule"></div>
            <div class="gp-chip" id="gp-confirm-ends"></div>
            <button class="gp-chip editable gp-adjust-recurrence-btn" id="gp-adjust-btn">
              <span class="gp-adjust-recurrence-label">Adjust recurrence</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#444746" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
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
          <div class="gp-action-group" style="margin-top:8px;">
            <button class="gp-btn-primary" id="gp-confirm-add">Add to Calendar</button>
            <div class="gp-toast" id="gp-toast">✅ Sessions added to your calendar!</div>
          </div>
        </div>

      </div>`;
    return panel;
  }

  // ── Wire all events ──
  function wireEvents() {
    // Rail btn
    document.getElementById('gp-sidebar-btn').addEventListener('click', togglePanel);
    document.getElementById('gp-close-btn').addEventListener('click', closePanel);
    document.getElementById('gp-add-btn').addEventListener('click', () => showScreen('form'));
    document.getElementById('gp-set-goal-btn').addEventListener('click', () => showScreen('form'));

    // Screen 2 — goal name input
    const titleInput = document.getElementById('gp-goal-title');
    const nameBox = document.getElementById('gp-name-box');
    titleInput.addEventListener('focus', () => nameBox.classList.add('focused'));
    titleInput.addEventListener('blur', () => nameBox.classList.remove('focused'));
    titleInput.addEventListener('input', updateFormBtns);

    // Open recurrence overlay
    document.getElementById('gp-open-recurrence').addEventListener('click', openRecurrence);

    // Day buttons
    document.querySelectorAll('.gp-day-btn').forEach(btn => {
      btn.addEventListener('click', () => btn.classList.toggle('selected'));
    });

    // Recurrence overlay — Cancel / Done
    document.getElementById('gp-rec-cancel').addEventListener('click', closeRecurrence);
    document.getElementById('gp-rec-done').addEventListener('click', saveRecurrence);

    // Screen 2 action buttons
    document.getElementById('gp-to-suggestions').addEventListener('click', goToSuggestions);
    document.getElementById('gp-adjust-sessions').addEventListener('click', goToSuggestions);

    // Screen 3 — adjust back / confirm add
    document.getElementById('gp-adjust-btn').addEventListener('click', () => { showScreen('form'); openRecurrence(); });
    document.getElementById('gp-confirm-add').addEventListener('click', confirmAddToCalendar);

    initTasksAccordion();
  }

  function initTasksAccordion() {
    const root = document.getElementById('gp-tasks-accordion');
    if (!root || root.dataset.wired === 'true') return;
    root.dataset.wired = 'true';

    root.querySelectorAll('.gp-task-folder').forEach(folder => {
      const toggle = folder.querySelector('.gp-task-folder-toggle');
      if (!toggle) return;

      toggle.addEventListener('click', () => {
        const isOpen = folder.classList.contains('open');

        root.querySelectorAll('.gp-task-folder.open').forEach(openFolder => {
          if (openFolder === folder) return;
          openFolder.classList.remove('open');
          const openToggle = openFolder.querySelector('.gp-task-folder-toggle');
          if (openToggle) openToggle.setAttribute('aria-expanded', 'false');
        });

        if (isOpen) {
          folder.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
          return;
        }

        folder.classList.add('open');
        toggle.setAttribute('aria-expanded', 'true');
      });
    });
  }

  // ── Panel toggle ──
  function togglePanel() {
    const p = document.getElementById('gp-panel');
    p.classList.contains('open') ? closePanel() : openPanel();
  }
  function openPanel() {
    document.getElementById('gp-panel').classList.add('open');
    document.getElementById('gp-sidebar-btn').classList.add('active');
    setCalendarPushed(true);
    requestAnimationFrame(() => setCalendarPushed(true));
  }
  function closePanel() {
    document.getElementById('gp-panel').classList.remove('open');
    document.getElementById('gp-sidebar-btn').classList.remove('active');
    setCalendarPushed(false);
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
      return;
    }
    emptyEl.style.display = 'none';
    listEl.classList.add('visible');
    const now = new Date();
    listEl.innerHTML = goals.map(g => {
      const deadline = new Date(g.endDate || g.deadline);
      const totalDays = Math.max(1, Math.ceil((deadline - new Date(g.created)) / 86400000));
      const elapsed = Math.ceil((now - new Date(g.created)) / 86400000);
      const pct = Math.min(100, Math.round((elapsed / totalDays) * 100));
      const daysLeft = Math.max(0, Math.ceil((deadline - now) / 86400000));
      return `<div class="gp-goal-chip">
        <p class="gp-goal-chip-name">🎯 ${g.title}</p>
        <p class="gp-goal-chip-sub">${g.scheduleLabel} · ${daysLeft}d left</p>
        <div class="gp-progress-bar"><div class="gp-progress-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
    const addBtn = document.createElement('button');
    addBtn.className = 'gp-add-another';
    addBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add another goal`;
    addBtn.addEventListener('click', () => showScreen('form'));
    listEl.appendChild(addBtn);
  }

  // ── Form helpers ──
  function updateFormBtns() {
    const hasTitle = document.getElementById('gp-goal-title').value.trim().length > 0;
    const hasRec = state.recurrence !== null;
    const addBtn = document.getElementById('gp-to-suggestions');
    const adjBtn = document.getElementById('gp-adjust-sessions');
    addBtn.disabled = !(hasTitle && hasRec);
    adjBtn.disabled = !(hasTitle && hasRec);
    adjBtn.className = (hasTitle && hasRec) ? 'gp-btn-secondary enabled' : 'gp-btn-secondary';
  }

  // ── Recurrence overlay ──
  function openRecurrence() {
    document.getElementById('gp-recurrence-overlay').classList.add('open');
  }
  function closeRecurrence() {
    document.getElementById('gp-recurrence-overlay').classList.remove('open');
  }
  function saveRecurrence() {
    const every = parseInt(document.getElementById('gp-freq-num').value) || 1;
    const period = document.getElementById('gp-freq-period').value;
    const days = [...document.querySelectorAll('.gp-day-btn.selected')].map(b => b.dataset.day);
    const time = document.getElementById('gp-rec-time').value || '21:00';
    const sessionMins = parseInt(document.getElementById('gp-session-mins').value) || 60;
    const endsVal = document.querySelector('input[name="gp-ends"]:checked').value;
    const endDate = document.getElementById('gp-end-date').value;
    const occurrences = parseInt(document.getElementById('gp-occurrences').value) || 13;

    state.recurrence = { every, period, days, time, sessionMins, ends: endsVal, endDate, occurrences };

    // Update summary pill
    const dayNames = { SU:'Sun', MO:'Mon', TU:'Tue', WE:'Wed', TH:'Thu', FR:'Fri', SA:'Sat' };
    const dayStr = days.length ? days.map(d => dayNames[d]).join(', ') : 'selected days';
    const label = every === 1 ? `Weekly on ${dayStr}` : `Every ${every} ${period}s on ${dayStr}`;
    const summaryEl = document.getElementById('gp-recurrence-summary');
    summaryEl.textContent = label;
    summaryEl.classList.remove('placeholder');

    closeRecurrence();
    updateFormBtns();
  }

  // ── Go to suggestions screen ──
  async function goToSuggestions() {
    state.goalTitle = document.getElementById('gp-goal-title').value.trim();

    // Build summary labels
    const r = state.recurrence;
    const dayNames = { SU:'Sun', MO:'Mon', TU:'Tue', WE:'Wed', TH:'Thu', FR:'Fri', SA:'Sat' };
    const dayStr = r.days.map(d => dayNames[d]).join(', ');
    const schedLabel = r.every === 1 ? `Weekly on ${dayStr}` : `Every ${r.every} ${r.period}s on ${dayStr}`;

    document.getElementById('gp-confirm-title').textContent = state.goalTitle;
    document.getElementById('gp-confirm-schedule').textContent = schedLabel;

    let endsLabel = 'Never ends';
    if (r.ends === 'on' && r.endDate) {
      endsLabel = `Ends ${formatDate(r.endDate)}`;
    } else if (r.ends === 'after') {
      endsLabel = `Ends after ${r.occurrences} sessions`;
    }
    document.getElementById('gp-confirm-ends').textContent = endsLabel;

    // Generate suggested sessions
    state.suggestions = generateSuggestions(r);
    renderSuggestions();
    showScreen('suggestions');
  }

  function generateSuggestions(r) {
    const dayMap = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };
    const targetDays = r.days.map(d => dayMap[d]);
    const [hour, min] = (r.time || '21:00').split(':').map(Number);
    const sessionMins = r.sessionMins || 60;

    const sessions = [];
    const limit = r.ends === 'after' ? r.occurrences : 6; // show up to 6 upcoming
    let cur = new Date();
    cur.setDate(cur.getDate() + 1);

    const endBoundary = r.ends === 'on' && r.endDate ? new Date(r.endDate) : null;

    while (sessions.length < limit) {
      if (endBoundary && cur > endBoundary) break;
      if (targetDays.length === 0 || targetDays.includes(cur.getDay())) {
        const start = new Date(cur);
        start.setHours(hour, min, 0, 0);
        const end = new Date(start);
        end.setMinutes(end.getMinutes() + sessionMins);
        sessions.push({
          date: formatDayDate(start),
          startTime: formatTime(start),
          endTime: formatTime(end),
          isoStart: start.toISOString(),
          isoEnd: end.toISOString(),
        });
      }
      cur.setDate(cur.getDate() + 1);
    }
    return sessions;
  }

  function renderSuggestions() {
    const list = document.getElementById('gp-suggestions-list');
    list.innerHTML = state.suggestions.map(s => `
      <div class="gp-session-card">
        <p class="gp-session-date">${s.date}</p>
        <p class="gp-session-time">${s.startTime} – ${s.endTime}</p>
      </div>`).join('');
  }

  // ── Confirm + add to Calendar ──
  async function confirmAddToCalendar() {
    const btn = document.getElementById('gp-confirm-add');
    btn.textContent = 'Adding…'; btn.disabled = true;
    try {
      const token = await getAuthToken();
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      for (const s of state.suggestions) {
        await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
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
      }
      // Save goal
      const r = state.recurrence;
      const dayNames = { SU:'Sun', MO:'Mon', TU:'Tue', WE:'Wed', TH:'Thu', FR:'Fri', SA:'Sat' };
      const dayStr = r.days.map(d => dayNames[d]).join(', ');
      const schedLabel = r.every === 1 ? `Weekly on ${dayStr}` : `Every ${r.every} ${r.period}s`;
      const goals = await getGoals();
      goals.push({
        title: state.goalTitle, scheduleLabel: schedLabel,
        endDate: r.endDate || '', created: new Date().toISOString(),
      });
      await saveGoals(goals);

      document.getElementById('gp-toast').classList.add('visible');
      btn.textContent = 'Add to Calendar';
      btn.disabled = false;
      setTimeout(() => { showScreen('home'); document.getElementById('gp-toast').classList.remove('visible'); }, 1800);
    } catch (e) {
      console.error(e);
      alert('Could not add to Calendar. Make sure the extension has Calendar access.');
      btn.textContent = 'Add to Calendar'; btn.disabled = false;
    }
  }

  // ── Auth ──
  function getAuthToken() {
    return new Promise((res, rej) => {
      chrome.identity.getAuthToken({ interactive: true }, t => {
        chrome.runtime.lastError || !t ? rej(chrome.runtime.lastError) : res(t);
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

  // ── Boot ──
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; setTimeout(inject, 1000); }
  }).observe(document.body, { childList: true, subtree: true });

})();
