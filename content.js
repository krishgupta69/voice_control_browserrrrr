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
        try { recognition.abort(); } catch (e) {}
        recognition = null;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
        console.log("VoiceControl: Recognition session started.");
        setupHUD();
        updateHUD("🎙️", "Listening...", "status-listening");
    };

    recognition.onresult = (event) => {
        try {
            const lastResultIndex = event.results.length - 1;
            if (!event.results[lastResultIndex].isFinal) return;
            const finalTranscript = event.results[lastResultIndex][0].transcript.trim();
            if (!finalTranscript) return;
            console.log("VoiceControl Heard:", finalTranscript);
            parseCommand(finalTranscript);
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
    } else if (text.includes("new tab")) {
        recognized = true;
        updateHUD("✅", "Opening new tab", "status-success");
        chrome.runtime.sendMessage({ command: "newTab" });
    } else if (text.includes("close tab")) {
        recognized = true;
        updateHUD("✅", "Closing tab", "status-success");
        chrome.runtime.sendMessage({ command: "closeTab" });
    } else if (text.includes("next tab")) {
        recognized = true;
        updateHUD("✅", "Switching to next tab", "status-success");
        chrome.runtime.sendMessage({ command: "nextTab" });
    } else if (text.includes("previous tab")) {
        recognized = true;
        updateHUD("✅", "Switching to previous tab", "status-success");
        chrome.runtime.sendMessage({ command: "previousTab" });
    } else if (text.includes("show links")) {
        recognized = true;
        showLinks();
        updateHUD("✅", linkBadges.length + " links found", "status-success");
    } else if (text.includes("hide links")) {
        recognized = true;
        hideLinks();
        updateHUD("✅", "Links hidden", "status-success");
    } else if (text.includes("click ")) {
        const target = text.split("click ")[1].trim();
        if (target) {
            recognized = true;

            // If link badges are active and target is a number, click the nth link
            const num = parseInt(target, 10);
            if (linkBadges.length > 0 && !isNaN(num) && num >= 1 && num <= linkBadges.length) {
                const entry = linkBadges[num - 1];
                updateHUD("✅", "Clicking link #" + num, "status-success");
                const origOutline = entry.link.style.outline;
                entry.link.style.outline = "3px solid yellow";
                setTimeout(() => {
                    entry.link.style.outline = origOutline;
                    entry.link.click();
                    hideLinks();
                }, 500);
            } else {
                // Fallback: fuzzy text match on interactive elements
                const elements = document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"]');
                let matched = null;
                for (const el of elements) {
                    const elText = (el.innerText || "").toLowerCase();
                    const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
                    if (elText.includes(target) || ariaLabel.includes(target)) {
                        matched = el;
                        break;
                    }
                }
                if (matched) {
                    updateHUD("✅", "Clicking: " + target, "status-success");
                    const origOutline = matched.style.outline;
                    matched.style.outline = "3px solid yellow";
                    setTimeout(() => {
                        matched.style.outline = origOutline;
                        matched.click();
                    }, 500);
                } else {
                    updateHUD("❌", "Element not found: " + target, "status-error");
                }
            }
        }
    } else if (text.includes("type ")) {
        const typed = transcript.substring(transcript.toLowerCase().indexOf("type ") + 5);
        const el = document.activeElement;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
            recognized = true;
            if (el.isContentEditable) {
                el.textContent += typed;
            } else {
                el.value = typed;
            }
            el.dispatchEvent(new Event("input", { bubbles: true }));
            updateHUD("✅", "Typed: " + typed, "status-success");
        } else {
            recognized = true;
            updateHUD("❌", "No input field focused", "status-error");
        }
    } else if (text.includes("press enter")) {
        recognized = true;
        const el = document.activeElement;
        if (el) {
            el.dispatchEvent(new KeyboardEvent("keydown", {
                key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true
            }));
            el.dispatchEvent(new KeyboardEvent("keyup", {
                key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true
            }));
            updateHUD("✅", "Pressed Enter", "status-success");
        }
    } else if (text.includes("focus ")) {
        const labelText = text.split("focus ")[1].trim();
        if (labelText) {
            recognized = true;
            const inputs = document.querySelectorAll("input, textarea, select");
            let matched = null;
            for (const el of inputs) {
                const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
                const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
                // Check associated <label> via the "for" attribute
                let labelContent = "";
                if (el.id) {
                    const labelEl = document.querySelector(`label[for="${el.id}"]`);
                    if (labelEl) labelContent = labelEl.textContent.toLowerCase();
                }
                if (placeholder.includes(labelText) || ariaLabel.includes(labelText) || labelContent.includes(labelText)) {
                    matched = el;
                    break;
                }
            }
            if (matched) {
                matched.focus();
                updateHUD("✅", "Focused: " + labelText, "status-success");
            } else {
                updateHUD("❌", "Field not found: " + labelText, "status-error");
            }
        }
    } else if (text.includes("clear field")) {
        recognized = true;
        const el = document.activeElement;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
            el.value = "";
            el.dispatchEvent(new Event("input", { bubbles: true }));
            updateHUD("✅", "Field cleared", "status-success");
        } else if (el && el.isContentEditable) {
            el.textContent = "";
            el.dispatchEvent(new Event("input", { bubbles: true }));
            updateHUD("✅", "Field cleared", "status-success");
        } else {
            updateHUD("❌", "No input field focused", "status-error");
        }
    } else if (text.includes("open ")) {
        let site = text.split("open ")[1].trim().replace(/\s/g, "");
        if (site) {
            if (!site.includes(".")) {
                site += ".com";
            }
            let url = site.startsWith("http") ? site : "https://" + site;
            recognized = true;
            updateHUD("✅", "Opening " + url, "status-success");
            chrome.runtime.sendMessage({ command: "openSite", url: url });
        }
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
