/**
 * Calendar ↔ GoalPlannerModel sync layer.
 *
 * Canonical session times come from grid geometry (hour scale + day column + event
 * position/size), not from aria-labels or visible time strings.
 *
 * Depends on global GoalPlannerModel (goalModel.js) and init() injection of grid helpers.
 */
(function (global) {
  'use strict';

  /** @type {null | { findCalendarScrollContainer: function, findHourAbsolutePositions: function, findDayColumnPositions: function, getGridMetrics?: function }} */
  var deps = null;

  function init(d) {
    deps = d || null;
  }

  function snapMins15(mins) {
    return Math.max(0, Math.round(mins / 15) * 15);
  }

  /**
   * Derive ISO start/end from event block position (week/day time grid).
   * @returns {{ eventId: string, startTime: string, endTime: string } | null}
   */
  function computeSessionRangeFromGeometry(chip) {
    if (!deps || !chip) return null;
    var ec = chip.closest('[data-eventid]');
    if (!ec) return null;
    var eventId = ec.getAttribute('data-eventid');
    if (!eventId) return null;

    var scrollCont = deps.findCalendarScrollContainer();
    if (!scrollCont) return null;
    var hourPositions = deps.findHourAbsolutePositions(scrollCont);
    if (hourPositions.length < 2) return null;
    hourPositions.sort(function (a, b) {
      return a.hour - b.hour;
    });
    var first = hourPositions[0];
    var last = hourPositions[hourPositions.length - 1];
    var pxPerHour = (last.absY - first.absY) / (last.hour - first.hour);
    if (pxPerHour <= 0) return null;
    var absYAtHour0 = first.absY - first.hour * pxPerHour;

    var dayColumns = deps.findDayColumnPositions();
    if (!dayColumns.length) return null;

    var contRect = scrollCont.getBoundingClientRect();
    var er = ec.getBoundingClientRect();
    var centerX = er.left + er.width / 2;
    var col = dayColumns.find(function (c) {
      return centerX >= c.left && centerX <= c.left + c.width;
    });
    if (!col) {
      var best = null;
      for (var i = 0; i < dayColumns.length; i++) {
        var c = dayColumns[i];
        var cx = c.left + c.width / 2;
        var dist = Math.abs(centerX - cx);
        if (!best || dist < best.d) best = { c: c, d: dist };
      }
      col = best && best.c;
    }
    if (!col) return null;

    var absTop = er.top - contRect.top + scrollCont.scrollTop;
    var rawStartMins = ((absTop - absYAtHour0) / pxPerHour) * 60;
    var snappedStart = snapMins15(rawStartMins);

    var containerH = er.height;
    var rawDur = (containerH / pxPerHour) * 60;
    var durationMins = Math.max(15, Math.round(rawDur / 15) * 15);

    var start = new Date(col.date.getFullYear(), col.date.getMonth(), col.date.getDate(), 0, 0, 0, 0);
    var totalMins = snappedStart;
    start.setHours(Math.floor(totalMins / 60), totalMins % 60, 0, 0);

    var end = new Date(start.getTime() + durationMins * 60000);

    return {
      eventId: eventId,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    };
  }

  function loadLegacyGoalsAndChipDone() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(['gp_goals', 'gp_chip_done'], function (raw) {
        resolve({
          goals: Array.isArray(raw.gp_goals) ? raw.gp_goals : [],
          doneMap: raw.gp_chip_done || {},
        });
      });
    });
  }

  var GEOM_PERSIST_DEBOUNCE_MS = 50;
  /** @type {WeakMap<object, number>} */
  var geomTimersByChip = new WeakMap();

  /**
   * Ensure unified state has a GoalSession row for this Google event id (from gp_goals).
   */
  async function ensureSessionRow(Model, state, eventId) {
    if (Model.findSessionByEventId(state, eventId)) return;
    var legacy = await loadLegacyGoalsAndChipDone();
    var g = legacy.goals.find(function (x) {
      return (x.calEventIds || []).some(function (id) {
        return id === eventId;
      });
    });
    if (!g) return;
    var goalPresent = state.goals.some(function (x) {
      return x.id === g.id;
    });
    if (!goalPresent) {
      var migrated = Model.migrateFromLegacy({
        gp_goals: [g],
        gp_chip_done: legacy.doneMap,
        goalStates: {},
      });
      migrated.goals.forEach(function (ng) {
        Model.upsertGoal(state, ng);
      });
    }
    if (!Model.findSessionByEventId(state, eventId)) {
      Model.upsertSession(state, {
        eventId: eventId,
        goalId: g.id,
        startTime: '',
        endTime: '',
        completed: !!legacy.doneMap[eventId],
      });
    }
  }

  async function persistSessionGeometry(chip) {
    var Model = global.GoalPlannerModel;
    if (!Model || !deps || !chip) return;
    var range = computeSessionRangeFromGeometry(chip);
    if (!range) return;

    var state = await Model.loadUnifiedState();
    await ensureSessionRow(Model, state, range.eventId);
    Model.patchSessionByEventId(state, range.eventId, {
      startTime: range.startTime,
      endTime: range.endTime,
    });
    await Model.saveUnifiedState(state, { silent: true });
  }

  /**
   * After gp_chip_done is written from the calendar checkbox, reshuffle unified state
   * from gp_goals + chip map so completions always match sidebar + chips (avoids orphaned
   * unified sessions rows that setSessionCompleted could not find).
   */
  async function persistSessionCompleted(eventId, completed) {
    var Model = global.GoalPlannerModel;
    if (!Model || !eventId) return;
    void completed;
    var legacy = await loadLegacyGoalsAndChipDone();
    var state = await Model.loadUnifiedState();
    var merged = Model.syncUnifiedWithLegacyGoals(state, legacy.goals, legacy.doneMap);
    var hit = Model.findSessionByEventId(merged, eventId);
    var goalId = hit ? hit.goal.id : null;
    await Model.saveUnifiedState(merged, {
      reason: 'sessionCompletion',
      eventId: eventId,
      goalId: goalId,
    });
  }

  function cancelScheduledPersistSessionGeometry(chip) {
    var t = geomTimersByChip.get(chip);
    if (t != null) {
      clearTimeout(t);
      geomTimersByChip.delete(chip);
    }
  }

  /** Trailing debounced persist while drag/resize is moving (avoids storage thrash). */
  function schedulePersistSessionGeometry(chip) {
    if (!chip || !deps) return;
    var prev = geomTimersByChip.get(chip);
    if (prev != null) clearTimeout(prev);
    geomTimersByChip.set(
      chip,
      setTimeout(function () {
        geomTimersByChip.delete(chip);
        persistSessionGeometry(chip).catch(function () {});
      }, GEOM_PERSIST_DEBOUNCE_MS)
    );
  }

  /** Flush geometry to storage immediately (e.g. after GCal commits drop). */
  function flushPersistSessionGeometry(chip) {
    if (!chip || !deps) return Promise.resolve();
    cancelScheduledPersistSessionGeometry(chip);
    return persistSessionGeometry(chip);
  }

  global.GoalCalendarSync = {
    init: init,
    computeSessionRangeFromGeometry: computeSessionRangeFromGeometry,
    persistSessionGeometry: persistSessionGeometry,
    persistSessionCompleted: persistSessionCompleted,
    schedulePersistSessionGeometry: schedulePersistSessionGeometry,
    flushPersistSessionGeometry: flushPersistSessionGeometry,
  };
})(typeof self !== 'undefined' ? self : globalThis);
