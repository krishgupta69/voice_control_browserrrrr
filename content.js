/**
 * content.js — VoiceControl Browser
 * Content Script (injected into all pages)
 */

let recognition = null;
let isListening = false;
let hudElement = null;
let hudTextElement = null;
let fadeTimeout = null;
let linkBadges = [];       // Array of { badge: HTMLElement, link: HTMLElement }
let linkBadgeTimeout = null;

let modeState = "command"; // "command" or "dictation"
let wakeWord = "hey browser";
let wakeWordState = "idle"; // "idle" or "active"
let activeTimeout = null;

chrome.storage.sync.get(['wakeWord'], (result) => {
    wakeWord = result.wakeWord || "hey browser";
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.wakeWord) {
        wakeWord = changes.wakeWord.newValue;
        if (isListening) refreshHUDState();
    }
});

function initRecognition() {
    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.error("VoiceControl: SpeechRecognition API not supported in this browser.");
        return;
    }

    // Destroy old instance — detach handlers FIRST to prevent cascade
    if (recognition) {
        recognition.onstart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        try { recognition.abort(); } catch (e) { }
        recognition = null;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
        console.log("VoiceControl: Recognition session started.");
        setupHUD();
        refreshHUDState();
    };

    recognition.onresult = (event) => {
        try {
            const lastResultIndex = event.results.length - 1;
            if (!event.results[lastResultIndex].isFinal) return;
            const finalTranscript = event.results[lastResultIndex][0].transcript.trim().toLowerCase();
            if (!finalTranscript) return;
            console.log("VoiceControl Heard:", finalTranscript);

            if (wakeWordState === "idle") {
                if (finalTranscript.includes(wakeWord.toLowerCase())) {
                    activateWakeWord();
                }
            } else {
                resetActiveTimeout();
                parseCommand(finalTranscript);
            }
        } catch (err) {
            console.error("VoiceControl: Error processing speech result:", err);
            updateHUD("❌", "Error processing command", "status-error");
        }
    };

    recognition.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
            // Harmless — just log it
            console.warn("VoiceControl:", event.error);
        } else if (event.error === 'network') {
            console.warn("VoiceControl Error: Network issues.");
            updateHUD("❌", "Network error", "status-error");
        } else if (event.error === 'not-allowed') {
            console.warn("VoiceControl Error: Microphone access not allowed.");
            updateHUD("❌", "Mic access denied", "status-error");
            isListening = false;
        } else {
            console.warn("VoiceControl Error:", event.error);
            updateHUD("❌", "Error: " + event.error, "status-error");
        }
    };

    recognition.onend = () => {
        console.log("VoiceControl: Recognition session ended.");
        if (isListening) {
            setTimeout(() => {
                if (isListening) {
                    console.log("VoiceControl: Restarting recognition...");
                    initRecognition();
                    if (recognition) {
                        try {
                            recognition.start();
                        } catch (err) {
                            console.error("VoiceControl: Failed to restart:", err);
                        }
                    }
                }
            }, 300);
        } else {
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

function showLinks() {
    hideLinks(); // clear any existing badges first

    const links = document.querySelectorAll("a");
    let count = 0;

    links.forEach((link) => {
        const rect = link.getBoundingClientRect();
        // Skip links that are not visible in viewport
        if (
            rect.width === 0 || rect.height === 0 ||
            rect.bottom < 0 || rect.top > window.innerHeight ||
            rect.right < 0 || rect.left > window.innerWidth
        ) {
            return;
        }

        count++;
        const badge = document.createElement("span");
        badge.className = "vc-link-badge";
        badge.textContent = count;
        badge.style.cssText = `
            position: absolute;
            top: ${rect.top + window.scrollY - 8}px;
            left: ${rect.left + window.scrollX - 8}px;
            width: 22px;
            height: 22px;
            background: #2563eb;
            color: #fff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 700;
            font-family: Arial, sans-serif;
            z-index: 2147483647;
            pointer-events: none;
            box-shadow: 0 1px 4px rgba(0,0,0,0.3);
            line-height: 1;
        `;
        document.body.appendChild(badge);
        linkBadges.push({ badge, link });
    });

    // Auto-hide after 10 seconds
    linkBadgeTimeout = setTimeout(() => hideLinks(), 10000);
}

function hideLinks() {
    clearTimeout(linkBadgeTimeout);
    linkBadgeTimeout = null;
    linkBadges.forEach(({ badge }) => {
        if (badge && badge.parentNode) {
            badge.parentNode.removeChild(badge);
        }
    });
    linkBadges = [];
}

function refreshHUDState() {
    if (!isListening) return;
    if (wakeWordState === "idle") {
        updateHUD("💤", `Waiting for '${wakeWord}'...`, "status-listening");
    } else {
        const icon = modeState === "dictation" ? "⌨️" : "🎙️";
        const text = modeState === "dictation" ? "Dictating..." : "Commanding...";
        updateHUD(icon, text, "status-listening");
    }
}

function activateWakeWord() {
    wakeWordState = "active";
    speak("Yes?");
    refreshHUDState();
    resetActiveTimeout();
}

function idleWakeWord() {
    wakeWordState = "idle";
    modeState = "command";
    speak("Going to sleep");
    refreshHUDState();
}

function resetActiveTimeout() {
    clearTimeout(activeTimeout);
    activeTimeout = setTimeout(() => {
        idleWakeWord();
    }, 10000);
}

function stringSimilarity(s1, s2) {
    let longer = s1;
    let shorter = s2;
    if (s1.length < s2.length) {
        longer = s2;
        shorter = s1;
    }
    let longerLength = longer.length;
    if (longerLength === 0) {
        return 1.0;
    }
    return (longerLength - levenshteinDistance(longer, shorter)) / parseFloat(longerLength);
}

function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

const commandMap = [
    { keywords: ["go to", "navigate to"], action: "goTo", hasParam: true },
    { keywords: ["scroll down", "move down", "go down"], action: "scrollDown" },
    { keywords: ["scroll up", "move up", "go up"], action: "scrollUp" },
    { keywords: ["scroll to top", "go to top", "top of page"], action: "scrollToTop" },
    { keywords: ["scroll to bottom", "go to bottom", "bottom of page"], action: "scrollToBottom" },
    { keywords: ["go back", "previous page", "back"], action: "goBack" },
    { keywords: ["go forward", "next page", "forward"], action: "goForward" },
    { keywords: ["reload", "refresh", "reload page"], action: "reload" },
    { keywords: ["new tab", "open tab"], action: "newTab" },
    { keywords: ["close tab", "close this tab"], action: "closeTab" },
    { keywords: ["next tab", "go to next tab"], action: "nextTab" },
    { keywords: ["previous tab", "go to previous tab"], action: "previousTab" },
    { keywords: ["show links", "show all links", "display links"], action: "showLinks" },
    { keywords: ["hide links", "hide all links", "remove links"], action: "hideLinks" },
    { keywords: ["click", "tap", "press button"], action: "click", hasParam: true },
    { keywords: ["type", "write", "enter text"], action: "type", hasParam: true },
    { keywords: ["press enter", "hit enter", "enter"], action: "pressEnter" },
    { keywords: ["focus", "select field"], action: "focus", hasParam: true },
    { keywords: ["clear field", "clear text", "clear input"], action: "clearField" },
    { keywords: ["open", "launch"], action: "open", hasParam: true }
];

function speak(text) {
    chrome.runtime.sendMessage({ command: "speak", text });
}

function handleDictation(transcript) {
    if (stringSimilarity(transcript.toLowerCase().trim(), "stop typing") > 0.8 ||
        stringSimilarity(transcript.toLowerCase().trim(), "command mode") > 0.8) {
        modeState = "command";
        updateHUD("🎙️", "Commanding...", "status-listening");
        return;
    }

    const el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        if (el.isContentEditable) {
            el.textContent += transcript + " ";
        } else {
            el.value += transcript + " ";
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        updateHUD("⌨️", "Dictated: " + transcript, "status-success");
    } else {
        updateHUD("❌", "No input focused for dictation", "status-error");
    }
}

function parseCommand(transcript) {
    if (modeState === "dictation") {
        handleDictation(transcript);

        if (isListening) {
            setTimeout(() => {
                if (isListening && modeState === "dictation" && wakeWordState === "active") {
                    refreshHUDState();
                }
            }, 3000);
        }
        return;
    }

    const text = transcript.toLowerCase().trim();

    let bestScore = 0;
    let bestAction = null;
    let bestKeyword = null;
    let matchedParam = "";

    for (const cmd of commandMap) {
        for (const kw of cmd.keywords) {
            let score = 0;
            let param = "";

            if (cmd.hasParam) {
                const kwWords = kw.split(" ").length;
                const trWords = text.split(" ");

                if (trWords.length >= kwWords) {
                    const trCmdPart = trWords.slice(0, kwWords).join(" ");
                    param = trWords.slice(kwWords).join(" ");
                    score = stringSimilarity(trCmdPart, kw);
                } else {
                    score = stringSimilarity(text, kw);
                }
            } else {
                score = stringSimilarity(text, kw);
            }

            if (score > bestScore) {
                bestScore = score;
                bestAction = cmd.action;
                bestKeyword = kw;
                matchedParam = param;
            }
        }
    }

    if (bestScore > 0.6) {
        executeCommand(bestAction, matchedParam, transcript);
    } else if (bestKeyword) {
        speak("Did you mean " + bestKeyword);
        updateHUD("❓", `Did you mean: ${bestKeyword}?`, "status-error");
    } else {
        console.log("VoiceControl: Command not recognized:", transcript);
        speak("Command not recognized");
        updateHUD("❌", "Not recognized: " + transcript, "status-error");
    }

    // Reset to listening state after a few seconds if everything keeps going
    if (isListening && wakeWordState === "active") {
        setTimeout(() => {
            if (isListening && modeState === "command" && wakeWordState === "active") {
                refreshHUDState();
            }
        }, 3000);
    }
}

function executeCommand(action, param, transcript) {
    switch (action) {
        case "goTo": {
            let urlPart = param.replace(/\s/g, "");
            if (!urlPart.includes(".")) urlPart += ".com";
            let url = urlPart.startsWith("http") ? urlPart : "https://" + urlPart;
            speak("Navigating to " + urlPart);
            updateHUD("✅", "Navigating to " + url, "status-success");
            setTimeout(() => window.location.href = url, 800);
            break;
        }
        case "scrollDown":
            speak("Scrolling down");
            updateHUD("✅", "Scrolled down", "status-success");
            window.scrollBy({ top: 400, behavior: 'smooth' });
            break;
        case "scrollUp":
            speak("Scrolling up");
            updateHUD("✅", "Scrolled up", "status-success");
            window.scrollBy({ top: -400, behavior: 'smooth' });
            break;
        case "scrollToTop":
            speak("Scrolling to top");
            updateHUD("✅", "Scrolled to top", "status-success");
            window.scrollTo({ top: 0, behavior: 'smooth' });
            break;
        case "scrollToBottom":
            speak("Scrolling to bottom");
            updateHUD("✅", "Scrolled to bottom", "status-success");
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            break;
        case "goBack":
            speak("Going back");
            updateHUD("✅", "Going back", "status-success");
            setTimeout(() => window.history.back(), 800);
            break;
        case "goForward":
            speak("Going forward");
            updateHUD("✅", "Going forward", "status-success");
            setTimeout(() => window.history.forward(), 800);
            break;
        case "reload":
            speak("Reloading page");
            updateHUD("✅", "Reloading", "status-success");
            setTimeout(() => window.location.reload(), 800);
            break;
        case "newTab":
            speak("Opening new tab");
            updateHUD("✅", "Opening new tab", "status-success");
            chrome.runtime.sendMessage({ command: "newTab" });
            break;
        case "closeTab":
            speak("Closing tab");
            updateHUD("✅", "Closing tab", "status-success");
            chrome.runtime.sendMessage({ command: "closeTab" });
            break;
        case "nextTab":
            speak("Switching to next tab");
            updateHUD("✅", "Switching to next tab", "status-success");
            chrome.runtime.sendMessage({ command: "nextTab" });
            break;
        case "previousTab":
            speak("Switching to previous tab");
            updateHUD("✅", "Switching to previous tab", "status-success");
            chrome.runtime.sendMessage({ command: "previousTab" });
            break;
        case "showLinks":
            showLinks();
            speak(linkBadges.length + " links found");
            updateHUD("✅", linkBadges.length + " links found", "status-success");
            break;
        case "hideLinks":
            hideLinks();
            speak("Links hidden");
            updateHUD("✅", "Links hidden", "status-success");
            break;
        case "click": {
            let target = param;
            if (!target) {
                speak("Click what?");
                updateHUD("❌", "Click what?", "status-error");
                break;
            }
            const num = parseInt(target, 10);
            if (linkBadges.length > 0 && !isNaN(num) && num >= 1 && num <= linkBadges.length) {
                const entry = linkBadges[num - 1];
                speak("Clicking link " + num);
                updateHUD("✅", "Clicking link #" + num, "status-success");
                const origOutline = entry.link.style.outline;
                entry.link.style.outline = "3px solid yellow";
                setTimeout(() => {
                    entry.link.style.outline = origOutline;
                    entry.link.click();
                    hideLinks();
                }, 500);
            } else {
                const elements = document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"]');
                let matched = null;
                for (const el of elements) {
                    const elText = (el.innerText || "").toLowerCase();
                    const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
                    if (elText.includes(target) || ariaLabel.includes(target)) {
                        matched = el;
                        target = elText || ariaLabel || target; // get better name for speaking
                        break;
                    }
                }
                if (matched) {
                    speak("Clicking " + target);
                    updateHUD("✅", "Clicking: " + target, "status-success");
                    const origOutline = matched.style.outline;
                    matched.style.outline = "3px solid yellow";
                    setTimeout(() => {
                        matched.style.outline = origOutline;
                        matched.click();
                    }, 500);
                } else {
                    speak("No element found");
                    updateHUD("❌", "Element not found: " + target, "status-error");
                }
            }
            break;
        }
        case "type": {
            const typed = param;
            const el = document.activeElement;
            if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
                if (el.isContentEditable) {
                    el.textContent += typed;
                } else {
                    el.value = typed;
                }
                speak("Typed " + typed);
                el.dispatchEvent(new Event("input", { bubbles: true }));
                updateHUD("✅", "Typed: " + typed, "status-success");
            } else {
                speak("No input field focused");
                updateHUD("❌", "No input field focused", "status-error");
            }
            break;
        }
        case "pressEnter": {
            const el = document.activeElement;
            if (el) {
                el.dispatchEvent(new KeyboardEvent("keydown", {
                    key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true
                }));
                el.dispatchEvent(new KeyboardEvent("keyup", {
                    key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true
                }));
                speak("Pressed enter");
                updateHUD("✅", "Pressed Enter", "status-success");
            }
            break;
        }
        case "focus": {
            let labelText = param;
            if (!labelText) {
                speak("Focus what?");
                updateHUD("❌", "Focus what?", "status-error");
                break;
            }
            const inputs = document.querySelectorAll("input, textarea, select");
            let matched = null;
            for (const el of inputs) {
                const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
                const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
                let labelContent = "";
                if (el.id) {
                    const labelEl = document.querySelector(`label[for="${el.id}"]`);
                    if (labelEl) labelContent = labelEl.textContent.toLowerCase();
                }
                if (placeholder.includes(labelText) || ariaLabel.includes(labelText) || labelContent.includes(labelText)) {
                    matched = el;
                    labelText = placeholder || ariaLabel || labelContent || labelText;
                    break;
                }
            }
            if (matched) {
                matched.focus();
                speak("Focused " + labelText);
                updateHUD("✅", "Focused: " + labelText, "status-success");
            } else {
                speak("Field not found");
                updateHUD("❌", "Field not found: " + labelText, "status-error");
            }
            break;
        }
        case "clearField": {
            const el = document.activeElement;
            if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
                el.value = "";
                speak("Field cleared");
                el.dispatchEvent(new Event("input", { bubbles: true }));
                updateHUD("✅", "Field cleared", "status-success");
            } else if (el && el.isContentEditable) {
                el.textContent = "";
                speak("Field cleared");
                el.dispatchEvent(new Event("input", { bubbles: true }));
                updateHUD("✅", "Field cleared", "status-success");
            } else {
                speak("No input field focused");
                updateHUD("❌", "No input field focused", "status-error");
            }
            break;
        }
        case "open": {
            let site = param.replace(/\s/g, "");
            if (site) {
                if (!site.includes(".")) site += ".com";
                let url = site.startsWith("http") ? site : "https://" + site;
                speak("Opening " + site);
                updateHUD("✅", "Opening " + url, "status-success");
                chrome.runtime.sendMessage({ command: "openSite", url: url });
            } else {
                speak("Open what?");
                updateHUD("❌", "Open what?", "status-error");
            }
            break;
        }
        case "startTyping":
            modeState = "dictation";
            speak("Dictation mode");
            updateHUD("⌨️", "Dictating...", "status-success");
            break;
        case "stopTyping":
            modeState = "command";
            speak("Command mode");
            updateHUD("🎙️", "Commanding...", "status-success");
            break;
    }
}

async function start() {
    if (!recognition) initRecognition();
    if (!recognition || isListening) return;

    // Request mic permission first — this triggers Chrome's "Allow" prompt
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop the stream immediately — SpeechRecognition manages its own mic
        stream.getTracks().forEach(track => track.stop());
    } catch (err) {
        console.error("VoiceControl: Microphone permission denied.", err);
        setupHUD();
        updateHUD("❌", "Mic access denied — click the 🔒 in the address bar to allow", "status-error");
        return;
    }

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
        clearTimeout(activeTimeout);
        wakeWordState = "idle";
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
