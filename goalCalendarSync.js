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

  function calEventIdsContain(calIds, candidate) {
    if (candidate == null || candidate === '') return false;
    var c = String(candidate);
    var ids = Array.isArray(calIds) ? calIds : [];
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i]) === c) return true;
    }
    return false;
  }

  function resolvePlannerEventIdForChip(domOrStoredId, legacyGoals) {
    var raw = domOrStoredId && String(domOrStoredId).trim();
    if (!raw) return '';
    var goals = Array.isArray(legacyGoals) ? legacyGoals : [];
    var allIds = [];
    for (var gi = 0; gi < goals.length; gi++) {
      var ce = goals[gi].calEventIds || [];
      for (var ci = 0; ci < ce.length; ci++) {
        if (ce[ci] || ce[ci] === 0) allIds.push(ce[ci]);
      }
    }
    var ai;
    for (ai = 0; ai < allIds.length; ai++) {
      if (String(allIds[ai]) === String(raw)) return allIds[ai];
    }
    var decoded = raw;
    try {
      decoded = decodeURIComponent(raw.replace(/\+/g, ' '));
    } catch (_) {
      decoded = raw;
    }
    if (decoded !== raw) {
      for (ai = 0; ai < allIds.length; ai++) {
        if (String(allIds[ai]) === String(decoded)) return allIds[ai];
      }
    }
    for (ai = 0; ai < allIds.length; ai++) {
      var id = allIds[ai];
      if (!id && id !== 0) continue;
      var instPrefix = String(id) + '_';
      if (raw === id || decoded === id || String(raw) === String(id)) return id;
      if (raw.indexOf(instPrefix) === 0 || decoded.indexOf(instPrefix) === 0) return id;
    }
    return raw;
  }

  function gpChipDoneKeyMatchesCalEventId(calId, chipKey) {
    if (!calId || chipKey == null || chipKey === '') return false;
    var a = String(calId);
    var b = String(chipKey);
    if (a === b) return true;
    var dec = b;
    try {
      dec = decodeURIComponent(b.replace(/\+/g, ' '));
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

  function expandChipDoneOntoCalEventIds(chipDone, legacyGoals) {
    var raw = chipDone && typeof chipDone === 'object' ? Object.assign({}, chipDone) : {};
    var goals = Array.isArray(legacyGoals) ? legacyGoals : [];
    for (var gi = 0; gi < goals.length; gi++) {
      var g = goals[gi];
      var ids = g.calEventIds || [];
      if (!ids.length) continue;
      var idSet = {};
      for (var ii = 0; ii < ids.length; ii++) idSet[String(ids[ii])] = true;
      for (var ci = 0; ci < ids.length; ci++) {
        var calId = ids[ci];
        if (calId == null || calId === '') continue;
        var calStr = String(calId);
        if (raw[calStr]) continue;
        var keys = Object.keys(raw);
        for (var ki = 0; ki < keys.length; ki++) {
          var k = keys[ki];
          if (!raw[k]) continue;
          if (idSet[String(k)]) continue;
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
    var truthyKeys = Object.keys(raw).filter(function (k) {
      return raw[k];
    });
    for (var gj = 0; gj < goals.length; gj++) {
      var gg = goals[gj];
      var idsG = gg.calEventIds || [];
      if (!idsG.length) continue;
      var idStrSetG = {};
      for (var ij = 0; ij < idsG.length; ij++) idStrSetG[String(idsG[ij])] = true;
      var syntheticGoal = [{ calEventIds: idsG }];
      for (var cj = 0; cj < idsG.length; cj++) {
        var calIdG = idsG[cj];
        if (!calIdG && calIdG !== 0) continue;
        var calStrG = String(calIdG);
        if (raw[calStrG]) continue;
        for (var kj = 0; kj < truthyKeys.length; kj++) {
          var kk = truthyKeys[kj];
          if (idStrSetG[String(kk)]) continue;
          var hitG = resolvePlannerEventIdForChip(kk, syntheticGoal);
          if (hitG && calEventIdsContain(idsG, hitG)) {
            raw[calStrG] = true;
            break;
          }
        }
      }
    }
    return raw;
  }

  function injectSlotDoneIntoExpandedChipDone(expanded, legacyGoals, slotPack) {
    var out = expanded && typeof expanded === 'object' ? Object.assign({}, expanded) : {};
    var pack = slotPack && typeof slotPack === 'object' ? slotPack : {};
    for (var gi = 0; gi < (legacyGoals || []).length; gi++) {
      var g = legacyGoals[gi];
      var ids = g.calEventIds || [];
      var arr = pack[String(g.id)];
      if (!Array.isArray(arr) || !ids.length) continue;
      for (var ai = 0; ai < arr.length; ai++) {
        var i = Number(arr[ai]);
        if (Number.isFinite(i) && i >= 0 && i < ids.length) out[String(ids[i])] = true;
      }
    }
    return out;
  }

  function loadLegacyGoalsAndChipDone() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(['gp_goals', 'gp_chip_done', 'gp_goal_slot_done'], function (raw) {
        var goals = Array.isArray(raw.gp_goals) ? raw.gp_goals : [];
        var expanded = expandChipDoneOntoCalEventIds(raw.gp_chip_done || {}, goals);
        var doneMap = injectSlotDoneIntoExpandedChipDone(expanded, goals, raw.gp_goal_slot_done || {});
        resolve({
          goals: goals,
          doneMap: doneMap,
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
