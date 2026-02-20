/**
 * content.js — VoiceControl Browser
 * Content Script (injected into all pages)
 */

let recognition = null;
let isListening = false;
let hudElement = null;
let hudTextElement = null;
let fadeTimeout = null;

function initRecognition() {
    if (recognition) return;

    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.error("VoiceControl: SpeechRecognition API not supported in this browser.");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
        setupHUD();
        updateHUD("🎙️", "Listening...", "status-listening");
    };

    recognition.onresult = (event) => {
        // Extract the latest final transcript
        const lastResultIndex = event.results.length - 1;
        const finalTranscript = event.results[lastResultIndex][0].transcript.trim();
        console.log("VoiceControl Heard:", finalTranscript);
        parseCommand(finalTranscript);
    };

    recognition.onerror = (event) => {
        if (event.error === 'no-speech') {
            console.warn("VoiceControl Error: No speech detected.");
            updateHUD("🎙️", "Listening...", "status-listening");
        } else if (event.error === 'network') {
            console.warn("VoiceControl Error: Network issues.");
            updateHUD("❌", "Network error", "status-error");
        } else if (event.error === 'not-allowed') {
            console.warn("VoiceControl Error: Microphone access not allowed.");
            updateHUD("❌", "Mic access denied", "status-error");
        } else {
            console.warn("VoiceControl Error:", event.error);
            updateHUD("❌", "Error: " + event.error, "status-error");
        }
    };

    recognition.onend = () => {
        // If we're supposed to be listening and it ends (e.g., due to silence), optionally restart.
        // For now, we'll just update state.
        if (isListening) {
            // In a robust implementation, we might try to recognition.start() again here
            // to keep it truly continuous despite browser timeouts.
            console.log("VoiceControl: Recognition ended.");
            isListening = false;
            removeHUD();
        }
    };
}

function setupHUD() {
    if (document.getElementById("vc-hud-container")) return;

    hudElement = document.createElement("div");
    hudElement.id = "vc-hud-container";

    const iconSpan = document.createElement("span");
    iconSpan.id = "vc-hud-icon";

    hudTextElement = document.createElement("span");
    hudTextElement.id = "vc-hud-text";

    hudElement.appendChild(iconSpan);
    hudElement.appendChild(hudTextElement);
    document.body.appendChild(hudElement);

    // Trigger reflow for transition
    void hudElement.offsetWidth;
    hudElement.classList.add("visible");
}

function removeHUD() {
    if (hudElement) {
        hudElement.classList.remove("visible");
        setTimeout(() => {
            if (hudElement && hudElement.parentNode) {
                hudElement.parentNode.removeChild(hudElement);
            }
            hudElement = null;
            hudTextElement = null;
        }, 300); // match CSS transition duration
    }
}

function updateHUD(icon, text, statusClass) {
    if (!hudElement || !hudTextElement) return;

    // Reset classes
    hudElement.className = "visible " + statusClass;

    // Animate text change
    hudTextElement.classList.add("vc-fade-out");
    hudTextElement.classList.remove("vc-fade-in");

    clearTimeout(fadeTimeout);
    fadeTimeout = setTimeout(() => {
        document.getElementById("vc-hud-icon").textContent = icon;
        hudTextElement.textContent = text;
        hudTextElement.classList.remove("vc-fade-out");
        hudTextElement.classList.add("vc-fade-in");
    }, 150); // wait for fade out to complete before changing text
}

function parseCommand(transcript) {
    const text = transcript.toLowerCase();
    let recognized = false;

    if (text.includes("go to ")) {
        let urlPart = text.split("go to ")[1].trim().replace(/\s/g, "");
        if (!urlPart.includes(".")) {
            // If they just say "go to google", append .com
            urlPart += ".com";
        }
        let url = urlPart;
        if (!url.startsWith("http")) {
            url = "https://" + url;
        }
        recognized = true;
        updateHUD("✅", "Navigating to " + url, "status-success");
        setTimeout(() => window.location.href = url, 800);
    } else if (text.includes("scroll down")) {
        recognized = true;
        updateHUD("✅", "Scrolled down", "status-success");
        window.scrollBy({ top: 400, behavior: 'smooth' });
    } else if (text.includes("scroll up")) {
        recognized = true;
        updateHUD("✅", "Scrolled up", "status-success");
        window.scrollBy({ top: -400, behavior: 'smooth' });
    } else if (text.includes("scroll to top")) {
        recognized = true;
        updateHUD("✅", "Scrolled to top", "status-success");
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (text.includes("scroll to bottom")) {
        recognized = true;
        updateHUD("✅", "Scrolled to bottom", "status-success");
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } else if (text.includes("go back")) {
        recognized = true;
        updateHUD("✅", "Going back", "status-success");
        setTimeout(() => window.history.back(), 800);
    } else if (text.includes("go forward")) {
        recognized = true;
        updateHUD("✅", "Going forward", "status-success");
        setTimeout(() => window.history.forward(), 800);
    } else if (text.includes("reload")) {
        recognized = true;
        updateHUD("✅", "Reloading", "status-success");
        setTimeout(() => window.location.reload(), 800);
    } else {
        console.log("VoiceControl: Command not recognized:", transcript);
        updateHUD("❌", "Not recognized: " + transcript, "status-error");
    }

    // Reset to listening state after a few seconds if everything keeps going
    if (isListening) {
        setTimeout(() => {
            if (isListening) {
                updateHUD("🎙️", "Listening...", "status-listening");
            }
        }, 3000);
    }
}

function start() {
    if (!recognition) initRecognition();
    if (!recognition || isListening) return;

    try {
        recognition.start();
        isListening = true;
        console.log("VoiceControl: Listening started.");
    } catch (err) {
        console.error("VoiceControl: Error starting recognition", err);
    }
}

function stop() {
    if (!recognition || !isListening) return;

    try {
        recognition.stop();
        isListening = false;
        console.log("VoiceControl: Listening stopped.");
        removeHUD();
    } catch (err) {
        console.error("VoiceControl: Error stopping recognition", err);
    }
}

// Ensure the functions can be triggered via messages from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startListening") {
        start();
        sendResponse({ status: "started" });
    } else if (request.action === "stopListening") {
        stop();
        sendResponse({ status: "stopped" });
    }
    return true;
});

// Since extensions might inject this as a module or plain script, 
// we attach to window as a fallback if `export` isn't accessible via standard message passing.
window.voiceControl = { start, stop };
