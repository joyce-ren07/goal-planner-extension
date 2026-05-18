'use strict';

importScripts('goalModel.js');

// ============================================================================
// Goal Planner — OAuth token handlers (cursor branch)
// Provides GET_AUTH_TOKEN / CLEAR_AUTH_TOKEN used by the goal tracker to
// talk to the Google Calendar API.
// ============================================================================
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_AUTH_TOKEN') {
    const interactive = message.interactive !== false;
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        sendResponse({ error: chrome.runtime.lastError?.message || 'No token returned' });
      } else {
        sendResponse({ token });
      }
    });
    return true;
  }

  if (message.type === 'CLEAR_AUTH_TOKEN') {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (!token) {
        sendResponse({ ok: true });
        return;
      }
      chrome.identity.removeCachedAuthToken({ token }, () => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  return false;
});

// ============================================================================
// Kanban / My Tasks sidebar — toolbar toggle + storage reset (shannon branch)
// Toggles the kanban sidebar via chrome.action.onClicked and clears stale
// kanban state on install when the build marker changes.
// ============================================================================
const FORCE_CLEAR_KANBAN_MARKER = 'gpForceClearKanbanBoard';
const KANBAN_RESET_BUILD = '20260514-sync';

function isCalendarTab(url) {
  return typeof url === 'string' && url.startsWith('https://calendar.google.com');
}

async function reloadCalendarTabs() {
  const tabs = await chrome.tabs.query({ url: 'https://calendar.google.com/*' });
  await Promise.all(
    tabs.filter((tab) => tab.id).map((tab) => chrome.tabs.reload(tab.id)),
  );
}

async function requestKanbanBoardReset() {
  await chrome.storage.local.set({ [FORCE_CLEAR_KANBAN_MARKER]: true });
  await reloadCalendarTabs();
}

async function maybeResetKanbanBoardForBuild() {
  const stored = await chrome.storage.local.get('gpKanbanResetBuild');
  if (stored.gpKanbanResetBuild === KANBAN_RESET_BUILD) return;
  await requestKanbanBoardReset();
  await chrome.storage.local.set({ gpKanbanResetBuild: KANBAN_RESET_BUILD });
}

chrome.runtime.onInstalled.addListener(() => {
  void maybeResetKanbanBoardForBuild().catch((error) => {
    console.error('Kanban reset failed.', error);
  });
});

void maybeResetKanbanBoardForBuild().catch((error) => {
  console.error('Kanban reset failed.', error);
});

async function waitForKanbanReady(tabId, attempts = 25, delayMs = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'PING_SIDEBAR' });
      if (response?.ready) return true;
    } catch {
      // Content script still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

async function ensureKanbanContentScript(tabId) {
  const ready = await waitForKanbanReady(tabId, 1, 0);
  if (ready) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['TaskDeleteConfirm.js', 'TaskDetailPopup.js', 'kanbanSidebar.js'],
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['sidebar.css'],
    });
  } catch {
    // Scripts may already be present via manifest content_scripts.
  }

  await waitForKanbanReady(tabId);
}

async function toggleKanbanSidebar(tab) {
  if (!tab.id || !isCalendarTab(tab.url)) return;
  await ensureKanbanContentScript(tab.id);
  await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
}

chrome.action.onClicked.addListener((tab) => {
  void toggleKanbanSidebar(tab).catch((error) => {
    console.error('Kanban sidebar could not toggle.', error);
  });
});
