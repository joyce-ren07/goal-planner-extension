'use strict';

function isCalendarTab(url) {
  return typeof url === 'string' && url.startsWith('https://calendar.google.com');
}

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
