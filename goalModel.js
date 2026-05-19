/**
 * Goal Planner — unified data model (single source of truth for persistence shape).
 *
 * Goal
 *   - id: string
 *   - title: string
 *   - recurrence: GoalRecurrence | null
 *   - sessions: GoalSession[]
 *   - progressPct: number (0–100, derived; stored for convenience, recomputed on writes)
 *
 * GoalSession
 *   - eventId: string        — Google Calendar event id (API id === data-eventid when present)
 *   - goalId: string
 *   - startTime: string      — ISO 8601 date-time (empty if unknown until sync)
 *   - endTime: string        — ISO 8601 date-time
 *   - completed: boolean
 *
 * GoalRecurrence — mirrors existing planner recurrence object from the UI layer.
 *
 * Connection to calendar events:
 *   - Each GoalSession.eventId is the primary key linking to a Google Calendar event.
 *   - DOM decoration (`data-eventid` on the event container) must match this id for chip UX.
 *
 * Legacy keys (until callers are migrated here — do not add new writers to these):
 *   - gp_goals[] with calEventIds[]
 *   - gp_chip_done[eventId]
 *   - goalStates[goalId] (partial session metadata)
 *
 * Canonical storage: chrome.storage.local[STORAGE_KEY] → GoalPlannerUnifiedState
 */
(function initGoalPlannerModel(global) {
  'use strict';

  /** @typedef {{ every: number, period: string, days: string[], time?: string, sessionMins?: number, ends?: string, endDate?: string, occurrences?: number }} GoalRecurrence */

  /** @typedef {{ eventId: string, goalId: string, startTime: string, endTime: string, completed: boolean }} GoalSession */

  /** @typedef {{ id: string, title: string, scheduleLabel?: string, recurrence: GoalRecurrence | null, endDate?: string, startDate?: string, created?: string, subtasks?: GoalSubtask[], sessions: GoalSession[], totalSessions?: number, progressPct: number }} Goal */

  /** @typedef {{ id: string, title: string, completed: boolean }} GoalSubtask */

  /** @typedef {{ version: number, goals: Goal[] }} GoalPlannerUnifiedState */

  var STORAGE_KEY = 'goalPlannerUnifiedState';
  var MODEL_VERSION = 1;

  /** @type {Set<function({ state: GoalPlannerUnifiedState, meta: Record<string, unknown> }): void>} */
  var _goalsStateSubscribers = new Set();

  /**
   * Subscribe to GoalPlannerUnifiedState persistence + in-process writes.
   * @param {(evt: { state: GoalPlannerUnifiedState, meta: Record<string, unknown> }) => void} fn
   * @returns {() => void} unsubscribe
   */
  function subscribeGoalsState(fn) {
    _goalsStateSubscribers.add(fn);
    return function unsubscribe() {
      _goalsStateSubscribers.delete(fn);
    };
  }

  function _emitGoalsState(detail) {
    _goalsStateSubscribers.forEach(function (fn) {
      try {
        fn(detail);
      } catch (_) {
        /* ignore subscriber errors — sidebar is optional */
      }
    });
  }

  var LEGACY_GOALS_KEY = 'gp_goals';
  var LEGACY_CHIP_DONE_KEY = 'gp_chip_done';
  var LEGACY_GOAL_STATES_KEY = 'goalStates';

  function createEmptyState() {
    return { version: MODEL_VERSION, goals: [] };
  }

  /** Goal-level checklist — carried on unified Goal rows and mirrored from gp_goals[].subtasks. */
  function cloneSubtasks(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var si = 0; si < raw.length; si++) {
      var x = raw[si];
      var o = typeof x === 'object' && x ? x : {};
      var idRaw = o.id || o.uid;
      var id =
        idRaw !== undefined && idRaw !== null && idRaw !== ''
          ? String(idRaw)
          : 'sub_' + MODEL_VERSION + '_' + Math.random().toString(36).slice(2, 12);
      out.push({
        id: id,
        title: typeof o.title === 'string' ? o.title : String(o.title || ''),
        /** Canonical goal-level checklist flag (legacy keys: `done`, `completed`) */
        completed: o.completed === true || o.done === true,
      });
    }
    return out;
  }

  function clampPct(n) {
    if (typeof n !== 'number' || isNaN(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  var RRULE_DAY_MAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  function parseYmdLocal(ymd) {
    if (!ymd || typeof ymd !== 'string') return null;
    var p = ymd.split('-').map(Number);
    if (p.length < 3 || p.some(function (n) { return !Number.isFinite(n); })) return null;
    return new Date(p[0], p[1] - 1, p[2], 0, 0, 0, 0);
  }

  function ymdFromDateLocal(d) {
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /**
   * Pure recurrence math — count session occurrences between start and end (inclusive).
   * Does not read calendar DOM or API event lists.
   * @param {GoalRecurrence} rec
   * @param {string} startDateYmd `YYYY-MM-DD` (first session day)
   * @returns {number} 0 when ends=never or inputs invalid (caller may fall back to slot count)
   */
  function computeTotalRecurringSessions(rec, startDateYmd) {
    if (!rec) return 0;
    if (rec.ends === 'after') {
      var occ = parseInt(rec.occurrences, 10);
      return Number.isFinite(occ) && occ > 0 ? occ : 0;
    }
    if (rec.ends === 'never') return 0;
    if (rec.ends !== 'on' || !rec.endDate) return 0;

    var start = parseYmdLocal(startDateYmd);
    var end = parseYmdLocal(rec.endDate);
    if (!start || !end || end < start) return 0;

    var period = rec.period || 'week';
    var every = Math.max(1, parseInt(rec.every, 10) || 1);
    var days = Array.isArray(rec.days) ? rec.days : [];
    var targetDows = new Set();
    days.forEach(function (code) {
      if (RRULE_DAY_MAP[code] !== undefined) targetDows.add(RRULE_DAY_MAP[code]);
    });

    var msDay = 86400000;
    var msWeek = 7 * msDay;
    end.setHours(23, 59, 59, 999);

    var count = 0;
    var cur = new Date(start.getTime());

    if (period === 'day') {
      while (cur <= end) {
        var dayIdx = Math.round((cur.getTime() - start.getTime()) / msDay);
        if (dayIdx % every === 0 && (!targetDows.size || targetDows.has(cur.getDay()))) count++;
        cur.setDate(cur.getDate() + 1);
      }
      return count;
    }

    if (period === 'month') {
      while (cur <= end) {
        var monthsSince =
          (cur.getFullYear() - start.getFullYear()) * 12 +
          (cur.getMonth() - start.getMonth());
        if (monthsSince >= 0 && monthsSince % every === 0) {
          if (!targetDows.size || targetDows.has(cur.getDay())) count++;
        }
        cur.setDate(cur.getDate() + 1);
      }
      return count;
    }

    if (!targetDows.size) return 0;
    while (cur <= end) {
      if (targetDows.has(cur.getDay())) {
        var weekIdx = Math.floor((cur.getTime() - start.getTime()) / msWeek);
        if (weekIdx % every === 0) count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }

  /** First calendar day for recurrence counting (stored startDate → anchors → created). */
  function deriveGoalStartDateYmd(legacyGoal) {
    var lg = legacyGoal || {};
    if (lg.startDate) return lg.startDate;
    if (lg.sessionAnchors && lg.sessionAnchors.length) {
      var best = null;
      lg.sessionAnchors.forEach(function (a) {
        if (!a || !a.isoStart) return;
        var d = new Date(a.isoStart);
        if (!Number.isFinite(d.getTime())) return;
        var ymd = ymdFromDateLocal(d);
        if (!best || ymd < best) best = ymd;
      });
      if (best) return best;
    }
    if (lg.created) return ymdFromDateLocal(new Date(lg.created));
    return ymdFromDateLocal(new Date());
  }

  /** Total scope for progress UI; falls back to recurring slot count when open-ended. */
  function resolveGoalTotalSessions(legacyGoal) {
    var lg = legacyGoal || {};
    var rec = lg.recurrence;
    var slots = (lg.calEventIds || []).length;
    if (!rec) return slots > 0 ? slots : 0;
    var total = computeTotalRecurringSessions(rec, deriveGoalStartDateYmd(lg));
    if (total > 0) return total;
    return slots > 0 ? slots : 0;
  }

  /** gp_chip_done keys are often strings; calEventIds may be stored as numbers — avoid strict key misses. */
  function chipDoneKeyMatchesCalEventId(calId, chipKey) {
    if (!calId || chipKey == null || chipKey === '') return false;
    var a = String(calId);
    var b = String(chipKey);
    if (a === b) return true;
    var dec = b;
    try {
      dec = decodeURIComponent(String(b).replace(/\+/g, ' '));
    } catch (_) {
      dec = b;
    }
    if (a === dec) return true;
    if (b.indexOf(a + '_') === 0 || dec.indexOf(a + '_') === 0) return true;
    if (a.indexOf(b + '_') === 0) return true;
    var aSeg = a.split('_')[0];
    var bSeg = b.split('_')[0];
    var decSeg = dec.split('_')[0];
    if (aSeg.length >= 8 && (aSeg === bSeg || aSeg === decSeg)) return true;
    return false;
  }

  /**
   * Count completed session instances (recurring instance keys), not just master calEventIds.
   * Avoids double-counting mirror keys (DOM id + API id for the same checkbox toggle).
   */
  function countCompletedInstancesForGoal(calEventIds, chipDoneMap) {
    var ids = Array.isArray(calEventIds)
      ? calEventIds.map(String).filter(Boolean)
      : [];
    if (!ids.length || !chipDoneMap) return 0;
    var keys = Object.keys(chipDoneMap).filter(function (k) {
      return chipDoneMap[k];
    });
    var instanceKeys = [];
    var masterOnly = [];
    for (var ki = 0; ki < keys.length; ki++) {
      var k = keys[ki];
      var matchedId = '';
      var isInstance = false;
      for (var ii = 0; ii < ids.length; ii++) {
        if (chipDoneKeyMatchesCalEventId(ids[ii], k)) {
          matchedId = ids[ii];
          isInstance = k !== ids[ii] && (k.indexOf(ids[ii] + '_') === 0);
          break;
        }
      }
      if (!matchedId) continue;
      if (isInstance) instanceKeys.push(k);
      else masterOnly.push({ key: k, matchedId: matchedId });
    }
    var count = instanceKeys.length;
    for (var mi = 0; mi < masterOnly.length; mi++) {
      var mo = masterOnly[mi];
      var hasInstance = false;
      for (var ij = 0; ij < instanceKeys.length; ij++) {
        if (chipDoneKeyMatchesCalEventId(mo.matchedId, instanceKeys[ij])) {
          hasInstance = true;
          break;
        }
      }
      if (!hasInstance) count++;
    }
    return count;
  }

  function lookupChipDone(doneMap, eventId) {
    if (!doneMap || eventId == null || eventId === '') return false;
    if (doneMap[eventId] || doneMap[String(eventId)]) return true;
    var e = String(eventId);
    var keys = Object.keys(doneMap);
    for (var ki = 0; ki < keys.length; ki++) {
      var k = keys[ki];
      if (!doneMap[k]) continue;
      if (k === e) return true;
      var dec = k;
      try {
        dec = decodeURIComponent(String(k).replace(/\+/g, ' '));
      } catch (_) {
        dec = k;
      }
      if (dec === e) return true;
      if (String(k).indexOf(e + '_') === 0 || dec.indexOf(e + '_') === 0) return true;
      if (e.indexOf(String(k) + '_') === 0 || e.indexOf(dec.split('_')[0] + '_') === 0) return true;
      var eSeg = e.split('_')[0];
      var kSeg = String(k).split('_')[0];
      var decSeg = dec.split('_')[0];
      if (eSeg.length >= 8 && (eSeg === kSeg || eSeg === decSeg)) return true;
    }
    return false;
  }

  function computeProgressPct(goal, chipDoneMap) {
    var sessions = goal.sessions || [];
    var total =
      typeof goal.totalSessions === 'number' && goal.totalSessions > 0
        ? goal.totalSessions
        : sessions.length;
    if (!total) return 0;
    var done = 0;
    if (chipDoneMap && sessions.length) {
      var ids = sessions.map(function (s) {
        return s.eventId;
      });
      done = countCompletedInstancesForGoal(ids, chipDoneMap);
    } else {
      done = sessions.filter(function (s) {
        return s.completed;
      }).length;
    }
    return clampPct((done / total) * 100);
  }

  function recomputeAllProgress(state, chipDoneMap) {
    state.goals.forEach(function (g) {
      g.progressPct = computeProgressPct(g, chipDoneMap);
    });
    return state;
  }

  /**
   * @param {GoalPlannerUnifiedState} state
   * @param {string} eventId
   * @returns {{ goal: Goal, session: GoalSession, gIdx: number, sIdx: number } | null}
   */
  function findSessionByEventId(state, eventId) {
    if (!eventId) return null;
    for (var g = 0; g < state.goals.length; g++) {
      var goal = state.goals[g];
      var list = goal.sessions || [];
      for (var s = 0; s < list.length; s++) {
        if (String(list[s].eventId) === String(eventId)) {
          return { goal: goal, session: list[s], gIdx: g, sIdx: s };
        }
      }
    }
    return null;
  }

  /**
   * @param {GoalPlannerUnifiedState} state
   * @param {GoalSession} session
   * @returns {GoalPlannerUnifiedState}
   */
  function upsertSession(state, session) {
    var found = findSessionByEventId(state, session.eventId);
    if (found) {
      Object.assign(found.session, session);
      found.goal.progressPct = computeProgressPct(found.goal);
      return state;
    }
    var goal = state.goals.find(function (g) { return g.id === session.goalId; });
    if (!goal) return state;
    if (!goal.sessions) goal.sessions = [];
    goal.sessions.push({
      eventId: session.eventId,
      goalId: session.goalId,
      startTime: session.startTime || '',
      endTime: session.endTime || '',
      completed: !!session.completed,
    });
    goal.progressPct = computeProgressPct(goal);
    return state;
  }

  /**
   * @param {GoalPlannerUnifiedState} state
   * @param {string} eventId
   * @param {Partial<GoalSession>} patch
   */
  function patchSessionByEventId(state, eventId, patch) {
    var found = findSessionByEventId(state, eventId);
    if (!found) return state;
    Object.assign(found.session, patch);
    found.goal.progressPct = computeProgressPct(found.goal);
    return state;
  }

  /**
   * @param {GoalPlannerUnifiedState} state
   * @param {string} eventId
   * @param {boolean} completed
   */
  function setSessionCompleted(state, eventId, completed) {
    return patchSessionByEventId(state, eventId, { completed: !!completed });
  }

  /**
   * @param {GoalPlannerUnifiedState} state
   * @param {Goal} goal
   */
  function upsertGoal(state, goal) {
    var idx = state.goals.findIndex(function (g) { return g.id === goal.id; });
    if (!goal.sessions) goal.sessions = [];
    goal.progressPct = computeProgressPct(goal);
    if (idx === -1) {
      state.goals.push(goal);
    } else {
      state.goals[idx] = Object.assign({}, state.goals[idx], goal);
      if (!state.goals[idx].sessions) state.goals[idx].sessions = [];
      state.goals[idx].progressPct = computeProgressPct(state.goals[idx]);
    }
    return state;
  }

  /**
   * Build unified state from legacy chrome.storage snapshot (read-only merge).
   * @param {{ gp_goals?: object[], gp_chip_done?: Record<string, boolean>, goalStates?: Record<string, { time?: string }> }} legacy
   * @returns {GoalPlannerUnifiedState}
   */
  function migrateFromLegacy(legacy) {
    var goals = Array.isArray(legacy.gp_goals) ? legacy.gp_goals : [];
    var doneMap = legacy.gp_chip_done || {};

    var state = createEmptyState();

    goals.forEach(function (g) {
      var ids = g.calEventIds || [];
      var sessions = ids.map(function (eventId) {
        return {
          eventId: eventId,
          goalId: g.id,
          startTime: '',
          endTime: '',
          completed: lookupChipDone(doneMap, eventId),
        };
      });
      state.goals.push({
        id: g.id,
        title: g.title || '',
        scheduleLabel: g.scheduleLabel,
        recurrence: g.recurrence ? Object.assign({}, g.recurrence) : null,
        endDate: g.endDate || '',
        startDate: deriveGoalStartDateYmd(g),
        created: g.created,
        color: g.color || '',
        subtasks: cloneSubtasks(g.subtasks != null ? g.subtasks : []),
        sessions: sessions,
        totalSessions: resolveGoalTotalSessions(g),
        progressPct: 0,
      });
    });

    return recomputeAllProgress(state, doneMap);
  }

  /**
   * Merge legacy keys into unified blob if unified is missing or empty.
   * @param {Record<string, unknown>} storage
   */
  function hydrateUnifiedFromStorageRaw(storage) {
    var unified = storage[STORAGE_KEY];
    if (unified && unified.version === MODEL_VERSION && Array.isArray(unified.goals) && unified.goals.length > 0) {
      return recomputeAllProgress(unified);
    }
    return migrateFromLegacy({
      gp_goals: storage[LEGACY_GOALS_KEY],
      gp_chip_done: storage[LEGACY_CHIP_DONE_KEY],
      goalStates: storage[LEGACY_GOAL_STATES_KEY],
    });
  }

  /**
   * Rewrite unified.goals from gp_goals while preserving session geometry/completion where event ids match.
   * Call after every gp_goals write so sidebar + chips stay aligned with legacy storage.
   * @param {GoalPlannerUnifiedState} prevState
   * @param {object[]} legacyGoals gp_goals rows (calEventIds, title, …)
   * @param {Record<string, boolean>} chipDone gp_chip_done map
   * @returns {GoalPlannerUnifiedState}
   */
  function syncUnifiedWithLegacyGoals(prevState, legacyGoals, chipDone) {
    chipDone = chipDone || {};
    var prevById = new Map();
    (prevState.goals || []).forEach(function (g) {
      prevById.set(g.id, g);
      prevById.set(String(g.id), g);
    });
    var nextGoals = [];
    (Array.isArray(legacyGoals) ? legacyGoals : []).forEach(function (lg) {
      var prev = prevById.get(lg.id) || prevById.get(String(lg.id));
      var ids = lg.calEventIds || [];
      var prevSessionsByEvent = new Map();
      if (prev && prev.sessions) {
        prev.sessions.forEach(function (s) {
          prevSessionsByEvent.set(s.eventId, s);
          prevSessionsByEvent.set(String(s.eventId), s);
        });
      }
      var sessions = ids.map(function (eventId) {
        var ps = prevSessionsByEvent.get(eventId) || prevSessionsByEvent.get(String(eventId));
        var completed = !!(lookupChipDone(chipDone, eventId) || (ps && ps.completed));
        return {
          eventId: eventId,
          goalId: lg.id,
          startTime: ps ? ps.startTime : '',
          endTime: ps ? ps.endTime : '',
          completed: completed,
        };
      });
      var startDate = deriveGoalStartDateYmd(lg);
      var totalSessions = resolveGoalTotalSessions(lg);
      var subSrc =
        lg.subtasks != null ? lg.subtasks : prev && prev.subtasks != null ? prev.subtasks : [];
      nextGoals.push({
        id: lg.id,
        title: lg.title || '',
        scheduleLabel: lg.scheduleLabel,
        recurrence: lg.recurrence ? Object.assign({}, lg.recurrence) : null,
        endDate: lg.endDate || '',
        startDate: startDate,
        created: lg.created,
        color: lg.color || '',
        subtasks: cloneSubtasks(subSrc),
        sessions: sessions,
        totalSessions: totalSessions,
        progressPct: 0,
      });
    });
    var out = Object.assign({}, prevState);
    out.goals = nextGoals;
    return recomputeAllProgress(out, chipDone);
  }

  function loadUnifiedState() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(
        [STORAGE_KEY, LEGACY_GOALS_KEY, LEGACY_CHIP_DONE_KEY, LEGACY_GOAL_STATES_KEY],
        function (raw) {
          resolve(hydrateUnifiedFromStorageRaw(raw || {}));
        }
      );
    });
  }

  /**
   * @param {GoalPlannerUnifiedState} state
   * @param {Record<string, unknown>} [meta] Optional: `{ silent?: true }` skips subscriber notify (geometry-only churn).
   */
  function saveUnifiedState(state, meta) {
    state.version = MODEL_VERSION;
    recomputeAllProgress(state);
    var payload = {};
    payload[STORAGE_KEY] = state;
    return new Promise(function (resolve) {
      chrome.storage.local.set(payload, function () {
        if (!meta || !meta.silent) {
          _emitGoalsState({ state: state, meta: meta ? Object.assign({}, meta) : {} });
        }
        resolve();
      });
    });
  }

  var GoalPlannerModel = {
    STORAGE_KEY: STORAGE_KEY,
    MODEL_VERSION: MODEL_VERSION,
    createEmptyState: createEmptyState,
    computeProgressPct: computeProgressPct,
    countCompletedInstancesForGoal: countCompletedInstancesForGoal,
    chipDoneKeyMatchesCalEventId: chipDoneKeyMatchesCalEventId,
    computeTotalRecurringSessions: computeTotalRecurringSessions,
    deriveGoalStartDateYmd: deriveGoalStartDateYmd,
    resolveGoalTotalSessions: resolveGoalTotalSessions,
    recomputeAllProgress: recomputeAllProgress,
    findSessionByEventId: findSessionByEventId,
    upsertSession: upsertSession,
    patchSessionByEventId: patchSessionByEventId,
    setSessionCompleted: setSessionCompleted,
    upsertGoal: upsertGoal,
    migrateFromLegacy: migrateFromLegacy,
    hydrateUnifiedFromStorageRaw: hydrateUnifiedFromStorageRaw,
    syncUnifiedWithLegacyGoals: syncUnifiedWithLegacyGoals,
    loadUnifiedState: loadUnifiedState,
    saveUnifiedState: saveUnifiedState,
    subscribeGoalsState: subscribeGoalsState,
  };

  global.GoalPlannerModel = GoalPlannerModel;
})(typeof self !== 'undefined' ? self : globalThis);
