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

  /** @typedef {{ id: string, title: string, scheduleLabel?: string, recurrence: GoalRecurrence | null, endDate?: string, created?: string, sessions: GoalSession[], progressPct: number }} Goal */

  /** @typedef {{ version: number, goals: Goal[] }} GoalPlannerUnifiedState */

  var STORAGE_KEY = 'goalPlannerUnifiedState';
  var MODEL_VERSION = 1;

  var LEGACY_GOALS_KEY = 'gp_goals';
  var LEGACY_CHIP_DONE_KEY = 'gp_chip_done';
  var LEGACY_GOAL_STATES_KEY = 'goalStates';

  function createEmptyState() {
    return { version: MODEL_VERSION, goals: [] };
  }

  function clampPct(n) {
    if (typeof n !== 'number' || isNaN(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function computeProgressPct(goal) {
    var sessions = goal.sessions || [];
    if (!sessions.length) return 0;
    var done = sessions.filter(function (s) { return s.completed; }).length;
    return clampPct((done / sessions.length) * 100);
  }

  function recomputeAllProgress(state) {
    state.goals.forEach(function (g) {
      g.progressPct = computeProgressPct(g);
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
        if (list[s].eventId === eventId) {
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
    var goals = legacy.gp_goals || [];
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
          completed: !!doneMap[eventId],
        };
      });
      state.goals.push({
        id: g.id,
        title: g.title || '',
        scheduleLabel: g.scheduleLabel,
        recurrence: g.recurrence ? Object.assign({}, g.recurrence) : null,
        endDate: g.endDate || '',
        created: g.created,
        sessions: sessions,
        progressPct: 0,
      });
    });

    return recomputeAllProgress(state);
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
    });
    var nextGoals = [];
    (legacyGoals || []).forEach(function (lg) {
      var prev = prevById.get(lg.id);
      var ids = lg.calEventIds || [];
      var prevSessionsByEvent = new Map();
      if (prev && prev.sessions) {
        prev.sessions.forEach(function (s) {
          prevSessionsByEvent.set(s.eventId, s);
        });
      }
      var sessions = ids.map(function (eventId) {
        var ps = prevSessionsByEvent.get(eventId);
        var completed = !!(chipDone[eventId] || (ps && ps.completed));
        return {
          eventId: eventId,
          goalId: lg.id,
          startTime: ps ? ps.startTime : '',
          endTime: ps ? ps.endTime : '',
          completed: completed,
        };
      });
      nextGoals.push({
        id: lg.id,
        title: lg.title || '',
        scheduleLabel: lg.scheduleLabel,
        recurrence: lg.recurrence ? Object.assign({}, lg.recurrence) : null,
        endDate: lg.endDate || '',
        created: lg.created,
        sessions: sessions,
        progressPct: 0,
      });
    });
    var out = Object.assign({}, prevState);
    out.goals = nextGoals;
    return recomputeAllProgress(out);
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

  function saveUnifiedState(state) {
    state.version = MODEL_VERSION;
    recomputeAllProgress(state);
    var payload = {};
    payload[STORAGE_KEY] = state;
    return new Promise(function (resolve) {
      chrome.storage.local.set(payload, resolve);
    });
  }

  var GoalPlannerModel = {
    STORAGE_KEY: STORAGE_KEY,
    MODEL_VERSION: MODEL_VERSION,
    createEmptyState: createEmptyState,
    computeProgressPct: computeProgressPct,
    recomputeAllProgress: recomputeAllProgress,
    findSessionByEventId: findSessionByEventId,
    upsertSession: upsertSession,
    patchSessionByEventId: patchSessionByEventId,
    setSessionCompleted: setSessionCompleted,
    upsertGoal: upsertGoal,
    migrateFromLegacy: migrateFromLegacy,
    hydrateUnifiedFromStorageRaw: hydrateUnifiedFromStorageRaw,
    loadUnifiedState: loadUnifiedState,
    saveUnifiedState: saveUnifiedState,
  };

  global.GoalPlannerModel = GoalPlannerModel;
})(typeof self !== 'undefined' ? self : globalThis);
