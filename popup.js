/**
 * popup.js — VoiceControl Browser
 * Popup UI Controller
 */

document.addEventListener("DOMContentLoaded", async () => {
    const micToggleBtn = document.getElementById("mic-toggle");
    const statusText = document.getElementById("status-text");

    // Retrieve the state for the current tab
    let isListening = false;

    // First, find the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Check global/tab state to set initial UI
    chrome.storage.local.get([`listening_${tab.id}`], (result) => {
        isListening = result[`listening_${tab.id}`] || false;
        updateUI(isListening);
    });

    micToggleBtn.addEventListener("click", async () => {
        // Prevent toggle if it's a restricted page (like chrome:// or new tab)
        if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
            alert("VoiceControl cannot run on browser settings pages or empty tabs. Please navigate to a standard website first.");
            return;
        }

        const nextListeningState = !isListening;

        // Tell content script to start/stop
        const action = nextListeningState ? "startListening" : "stopListening";

        try {
            await chrome.tabs.sendMessage(tab.id, { action });
        } catch (err) {
            // Content script not injected yet — inject it now and retry
            console.warn("Content script not found, injecting...", err);
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ["content.js"]
                });
                await chrome.scripting.insertCSS({
                    target: { tabId: tab.id },
                    files: ["styles/content.css"]
                });
                // Small delay to let the script initialize
                await new Promise(r => setTimeout(r, 200));
                await chrome.tabs.sendMessage(tab.id, { action });
            } catch (injectErr) {
                console.error("Failed to inject content script:", injectErr);
                alert("Could not connect to this page. Make sure you're on a regular website (not a browser settings page).");
                return;
            }
        }

        // Update state and UI after successful message
        isListening = nextListeningState;
        chrome.storage.local.set({ [`listening_${tab.id}`]: isListening });
        updateUI(isListening);
    });

    function updateUI(listening) {
        if (listening) {
            micToggleBtn.classList.add("active");
            statusText.innerHTML = "Mic is <strong>On</strong>";
        } else {
            micToggleBtn.classList.remove("active");
            statusText.innerHTML = "Mic is <strong>Off</strong>";
        }
    }
});
