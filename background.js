'use strict';

importScripts('goalModel.js');

const KANBAN_STORAGE_KEY = 'gpKanbanBoardState';
const FORCE_CLEAR_KANBAN_MARKER = 'gpForceClearKanbanBoard';
const KANBAN_RESET_BUILD = '20260514-sync';

const CONTENT_SCRIPT_FILES = [
  'goalModel.js',
  'goalCalendarSync.js',
  'TaskDeleteConfirm.js',
  'TaskDetailPopup.js',
  'content.js',
  'taskSidebar.js',
];

const CONTENT_STYLE_FILES = ['content.css', 'sidebar.css'];

function isCalendarTab(url) {
  return typeof url === 'string' && url.startsWith('https://calendar.google.com');
}

async function reloadCalendarTabs() {
  const tabs = await chrome.tabs.query({ url: 'https://calendar.google.com/*' });
  await Promise.all(
    tabs
      .filter((tab) => tab.id)
      .map((tab) => chrome.tabs.reload(tab.id)),
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
    console.error('My Tasks kanban reset failed.', error);
  });
});

void maybeResetKanbanBoardForBuild().catch((error) => {
  console.error('My Tasks kanban reset failed.', error);
});

async function ensureContentScripts(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING_SIDEBAR' });
    return;
  } catch {
    // Tabs opened before install may not have the content scripts yet.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: CONTENT_SCRIPT_FILES,
  });
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: CONTENT_STYLE_FILES,
  });
}

async function toggleTasksSidebar(tab) {
  if (!tab.id || !isCalendarTab(tab.url)) {
    return;
  }

  await ensureContentScripts(tab.id);
  await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
}

chrome.action.onClicked.addListener((tab) => {
  void toggleTasksSidebar(tab).catch((error) => {
    console.error('My Tasks sidebar could not toggle.', error);
  });
});

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
