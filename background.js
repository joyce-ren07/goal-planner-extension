'use strict';

const KANBAN_STORAGE_KEY = 'gpKanbanBoardState';
const FORCE_CLEAR_KANBAN_MARKER = 'gpForceClearKanbanBoard';
const KANBAN_RESET_BUILD = '20260514-sync';

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

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING_SIDEBAR' });
    return;
  } catch {
    // Tabs opened before install may not have the content script yet.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  });
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ['sidebar.css'],
  });
}

async function toggleSidebar(tab) {
  if (!tab.id || !isCalendarTab(tab.url)) {
    return;
  }

  await ensureContentScript(tab.id);
  await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
}

chrome.action.onClicked.addListener((tab) => {
  void toggleSidebar(tab).catch((error) => {
    console.error('My Tasks sidebar could not toggle.', error);
  });
});
