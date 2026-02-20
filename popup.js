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
        try {
            const action = nextListeningState ? "startListening" : "stopListening";
            await chrome.tabs.sendMessage(tab.id, { action });

            // Only update our state and UI if the message was successfully received
            isListening = nextListeningState;
            chrome.storage.local.set({ [`listening_${tab.id}`]: isListening });
            updateUI(isListening);

        } catch (err) {
            console.error("Could not send message to tab. It might not be loaded yet.", err);
            alert("Could not connect to the page. Please wait for the page to finish loading or refresh the tab.");
        }
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
