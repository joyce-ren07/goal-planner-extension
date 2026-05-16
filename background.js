importScripts('goalModel.js');

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
});
