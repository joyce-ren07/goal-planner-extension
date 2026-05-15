importScripts('goalModel.js');

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_AUTH_TOKEN') {
    chrome.identity.getAuthToken({ interactive: true }, token => {
      if (chrome.runtime.lastError || !token) {
        sendResponse({ error: chrome.runtime.lastError?.message || 'No token returned' });
      } else {
        sendResponse({ token });
      }
    });
    return true; // keep message channel open for async response
  }
});
