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

// Handle tab commands from content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const senderTabId = sender.tab ? sender.tab.id : null;

    switch (request.command) {
        case "newTab":
            chrome.tabs.create({});
            sendResponse({ status: "ok" });
            break;

        case "closeTab":
            if (senderTabId) {
                chrome.tabs.remove(senderTabId);
            }
            sendResponse({ status: "ok" });
            break;

        case "nextTab":
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                if (!tabs.length || !senderTabId) return;
                const currentIndex = tabs.findIndex(t => t.id === senderTabId);
                const nextIndex = (currentIndex + 1) % tabs.length;
                chrome.tabs.update(tabs[nextIndex].id, { active: true });
            });
            sendResponse({ status: "ok" });
            break;

        case "previousTab":
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                if (!tabs.length || !senderTabId) return;
                const currentIndex = tabs.findIndex(t => t.id === senderTabId);
                const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
                chrome.tabs.update(tabs[prevIndex].id, { active: true });
            });
            sendResponse({ status: "ok" });
            break;

        case "openSite":
            if (request.url) {
                chrome.tabs.create({ url: request.url });
            }
            sendResponse({ status: "ok" });
            break;

        case "speak":
            chrome.storage.local.get(['ttsEnabled'], (result) => {
                if (result.ttsEnabled !== false) {
                    chrome.tts.speak(request.text, { rate: 1.2, pitch: 1.0, volume: 0.8 });
                }
            });
            sendResponse({ status: "ok" });
            break;
    }

    return true; // keep channel open for async responses
});
