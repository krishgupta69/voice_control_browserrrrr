/**
 * background.js — VoiceControl Browser
 * Service Worker (Manifest V3)
 *
 * Responsibilities (to be implemented):
 *  - Listen for messages from content.js and popup.js
 *  - Manage voice recognition state across tabs
 *  - Execute tab/scripting commands based on recognized speech
 *  - Handle TTS (text-to-speech) feedback via chrome.tts API
 */

// Listen for tab closed or refreshed to reset mic state
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // If the page reloaded, the content script lost its state, so reset the button
    if (changeInfo.status === 'loading') {
        chrome.storage.local.remove(`listening_${tabId}`);
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.remove(`listening_${tabId}`);
});
