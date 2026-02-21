/**
 * content.js — VoiceControl Browser
 * Content Script (injected into all pages)
 */

let recognition = null;
let isListening = false;
let hudElement = null;
let hudTextElement = null;
let commandsOverlay = null; // Reference to the sliding overlay
let fadeTimeout = null;

// Settings with defaults
let currentWakeWord = "hey browser";
let currentLang = "en-US";
let currentScrollAmount = 400;
let currentHudPosition = "bottom-right";
let currentHudOpacity = 0.88;

// Fetch initial settings
chrome.storage.sync.get(['wakeWord', 'language', 'scrollAmount', 'hudPosition', 'hudOpacity'], (result) => {
    if (result.wakeWord) currentWakeWord = result.wakeWord;
    if (result.language) currentLang = result.language;
    if (result.scrollAmount) currentScrollAmount = parseInt(result.scrollAmount, 10);
    if (result.hudPosition) currentHudPosition = result.hudPosition;
    if (result.hudOpacity) currentHudOpacity = parseFloat(result.hudOpacity);
});

// Listen for live setting changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        if (changes.wakeWord) currentWakeWord = changes.wakeWord.newValue;
        if (changes.language) currentLang = changes.language.newValue;
        if (changes.scrollAmount) currentScrollAmount = parseInt(changes.scrollAmount.newValue, 10);
        if (changes.hudPosition) {
            currentHudPosition = changes.hudPosition.newValue;
            applyHudStyles(); // update immediately if visible
        }
        if (changes.hudOpacity) {
            currentHudOpacity = parseFloat(changes.hudOpacity.newValue);
            applyHudStyles(); // update immediately if visible
        }
    }
});

// ===== Element Registry & Observer =====
let interactiveElements = [];
let registryDebounce = null;

function buildElementRegistry() {
    // Standard interactives + ARIA roles
    const selectors = [
        'a', 'button', 'input', 'select', 'textarea',
        '[aria-label]', '[aria-labelledby]',
        '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="tab"]',
        '[aria-placeholder]'
    ].join(', ');

    const nodes = document.querySelectorAll(selectors);
    interactiveElements = [];

    nodes.forEach(node => {
        // Skip hidden or unclickable nodes
        if (node.offsetParent === null || node.disabled || node.style.display === 'none' || node.style.visibility === 'hidden') return;

        let name = "";

        // 1. Check aria-labelledby
        const labelledBy = node.getAttribute('aria-labelledby');
        if (labelledBy) {
            const labelNode = document.getElementById(labelledBy);
            if (labelNode) name = labelNode.innerText || labelNode.textContent;
        }

        // 2. Check aria-label
        if (!name) name = node.getAttribute('aria-label');

        // 3. Check placeholder/aria-placeholder
        if (!name) name = node.getAttribute('placeholder') || node.getAttribute('aria-placeholder');

        // 4. Check title attribute
        if (!name) name = node.title;

        // 5. Check inner text or value
        if (!name) name = node.innerText || node.value || node.textContent;

        if (name && typeof name === 'string') {
            const cleanName = name.replace(/[\n\r]+/g, ' ').trim().toLowerCase();
            if (cleanName) {
                interactiveElements.push({
                    name: cleanName,
                    element: node
                });
            }
        }
    });
}

function initObserver() {
    buildElementRegistry(); // Build initial

    const observer = new MutationObserver((mutations) => {
        // Debounce rebuilds to prevent lagging on heavy mutations
        clearTimeout(registryDebounce);
        registryDebounce = setTimeout(() => {
            buildElementRegistry();
        }, 250);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label', 'aria-labelledby', 'role', 'class', 'style']
    });
}

// Ensure observer starts when script loads
if (document.readyState === "complete" || document.readyState === "interactive") {
    initObserver();
} else {
    document.addEventListener("DOMContentLoaded", initObserver);
}
// =======================================
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
    recognition.lang = currentLang;

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
        if (event.error === 'aborted' || event.error === 'audio-capture') {
            // These are normal during restarts or brief mic pauses, simply ignore
            console.debug("VoiceControl: Ignored non-fatal error:", event.error);
            return;
        }

        if (event.error === 'no-speech') {
            console.warn("VoiceControl Error: No speech detected.");
            updateHUD("🎙️", "Listening...", "status-listening");
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
        console.log("VoiceControl: Recognition ended.");
        if (isListening) {
            // Auto-restart — Chrome kills recognition after silence/timeouts
            setTimeout(() => {
                if (isListening) {
                    try {
                        console.log("VoiceControl: Auto-restarting recognition...");
                        initRecognition();
                        if (recognition) recognition.start();
                    } catch (err) {
                        console.error("VoiceControl: Failed to restart:", err);
                    }
                }
            }, 300);
        } else {
            removeHUD();
        }
    };
}

async function start() {
    if (!recognition) initRecognition();
    if (!recognition || isListening) return;

    // Request mic permission first — this triggers Chrome's "Allow" prompt
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
    } catch (err) {
        console.error("VoiceControl: Microphone permission denied.", err);
        setupHUD();
        updateHUD("❌", "Mic access denied", "status-error");
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
        isListening = false;
        recognition.stop();
        console.log("VoiceControl: Listening stopped.");
        removeHUD();
    } catch (err) {
        console.error("VoiceControl: Error stopping recognition", err);
    }
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

    applyHudStyles();

    // Trigger reflow for transition
    void hudElement.offsetWidth;
    hudElement.classList.add("visible");
}

function applyHudStyles() {
    if (!hudElement) return;

    // Reset base positions
    hudElement.style.top = 'auto';
    hudElement.style.bottom = 'auto';
    hudElement.style.left = 'auto';
    hudElement.style.right = 'auto';

    const offset = '24px';
    if (currentHudPosition === 'top-left') {
        hudElement.style.top = offset;
        hudElement.style.left = offset;
    } else if (currentHudPosition === 'top-right') {
        hudElement.style.top = offset;
        hudElement.style.right = offset;
    } else if (currentHudPosition === 'bottom-left') {
        hudElement.style.bottom = offset;
        hudElement.style.left = offset;
    } else {
        // default bottom-right
        hudElement.style.bottom = offset;
        hudElement.style.right = offset;
    }

    // Apply Opacity custom property (read by css)
    hudElement.style.setProperty('--vc-hud-opacity', currentHudOpacity);
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

// ===== Commands Overlay =====
function showCommandsOverlay() {
    if (document.getElementById("vc-commands-overlay")) return;

    commandsOverlay = document.createElement("div");
    commandsOverlay.id = "vc-commands-overlay";

    commandsOverlay.innerHTML = `
        <div class="vc-overlay-content">
            <button id="vc-close-overlay" aria-label="Close Commands">✕</button>
            <h1>🎙️ Voice Commands</h1>
            <p>Say <strong>"hide commands"</strong> or press <strong>Escape</strong> to close this menu.</p>
            
            <div class="vc-command-category">
                <h2>Navigation</h2>
                <ul>
                    <li><span>go to [website]</span> — Navigate to a URL</li>
                    <li><span>go back</span> / <span>go forward</span> — Navigate history</li>
                    <li><span>reload</span> / <span>refresh</span> — Reload page</li>
                </ul>
            </div>

            <div class="vc-command-category">
                <h2>Scrolling</h2>
                <ul>
                    <li><span>scroll down</span> / <span>scroll up</span> — Scroll by configured amount</li>
                    <li><span>scroll to top</span> / <span>go to top</span> — Scroll to page start</li>
                    <li><span>scroll to bottom</span> / <span>go to bottom</span> — Scroll to page end</li>
                </ul>
            </div>

            <div class="vc-command-category">
                <h2>Interaction & Forms</h2>
                <ul>
                    <li><span>click [name]</span> — Click a link, button, or element by name</li>
                    <li><span>focus [name]</span> — Focus on a text input or element by name</li>
                </ul>
            </div>
            
            <div class="vc-command-category">
                <h2>System</h2>
                <ul>
                    <li><span>show commands</span> / <span>show help</span> — Show this menu</li>
                    <li><span>hide commands</span> / <span>close help</span> — Hide this menu</li>
                </ul>
            </div>
        </div>
    `;

    document.body.appendChild(commandsOverlay);

    // Escape key listener to close it
    document.addEventListener("keydown", handleOverlayEscape);

    // Click listener on close button
    document.getElementById("vc-close-overlay").addEventListener("click", hideCommandsOverlay);

    // Trigger animation
    void commandsOverlay.offsetWidth;
    commandsOverlay.classList.add("visible");
}

function hideCommandsOverlay() {
    if (commandsOverlay) {
        commandsOverlay.classList.remove("visible");
        document.removeEventListener("keydown", handleOverlayEscape);

        setTimeout(() => {
            if (commandsOverlay && commandsOverlay.parentNode) {
                commandsOverlay.parentNode.removeChild(commandsOverlay);
            }
            commandsOverlay = null;
        }, 300); // Wait for transition
    }
}

function handleOverlayEscape(e) {
    if (e.key === "Escape") {
        hideCommandsOverlay();
    }
}
// ==========================

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

    if (!text.includes(currentWakeWord)) {
        console.log(`VoiceControl: Wake word '${currentWakeWord}' not detected in:`, transcript);
        return; // Ignore speech that doesn't include the wake word
    }

    // Extract the actual command after the wake word
    const commandText = text.substring(text.indexOf(currentWakeWord) + currentWakeWord.length).trim();

    if (commandText === "show commands" || commandText === "show help" || commandText === "options") {
        recognized = true;
        updateHUD("✅", "Showing commands", "status-success");
        showCommandsOverlay();
    } else if (commandText === "hide commands" || commandText === "close commands" || commandText === "close help") {
        recognized = true;
        updateHUD("✅", "Hiding commands", "status-success");
        hideCommandsOverlay();
    } else if (commandText.includes("go to ")) {
        let urlPart = commandText.split("go to ")[1].trim().replace(/\s/g, "");
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
    } else if (commandText.includes("scroll down")) {
        recognized = true;
        updateHUD("✅", "Scrolled down", "status-success");
        window.scrollBy({ top: currentScrollAmount, behavior: 'smooth' });
    } else if (commandText.includes("scroll up")) {
        recognized = true;
        updateHUD("✅", "Scrolled up", "status-success");
        window.scrollBy({ top: -currentScrollAmount, behavior: 'smooth' });
    } else if (commandText.includes("scroll to top") || commandText.includes("go to top")) {
        recognized = true;
        updateHUD("✅", "Scrolled to top", "status-success");
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (commandText.includes("scroll to bottom") || commandText.includes("go to bottom")) {
        recognized = true;
        updateHUD("✅", "Scrolled to bottom", "status-success");
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } else if (commandText.includes("go back")) {
        recognized = true;
        updateHUD("✅", "Going back", "status-success");
        setTimeout(() => window.history.back(), 800);
    } else if (commandText.includes("go forward")) {
        recognized = true;
        updateHUD("✅", "Going forward", "status-success");
        setTimeout(() => window.history.forward(), 800);
    } else if (commandText.includes("reload") || commandText.includes("refresh")) {
        recognized = true;
        updateHUD("✅", "Reloading", "status-success");
        setTimeout(() => window.location.reload(), 800);
    } else if (commandText.startsWith("click ") || commandText.startsWith("focus ")) {
        // Handle Interactions
        const isFocus = commandText.startsWith("focus ");
        const targetName = commandText.substring(isFocus ? 6 : 6).trim(); // Remove "click " or "focus "

        // Try exact match first, then fuzzy includes
        let bestMatch = interactiveElements.find(el => el.name === targetName);
        if (!bestMatch) {
            bestMatch = interactiveElements.find(el => el.name.includes(targetName) || targetName.includes(el.name));
        }

        if (bestMatch) {
            recognized = true;
            const targetEl = bestMatch.element;

            // Visual feedback
            const prevOutline = targetEl.style.outline;
            targetEl.style.outline = "4px solid #3b82f6";

            // Ensure element is visible before interacting
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

            setTimeout(() => {
                targetEl.style.outline = prevOutline;

                if (isFocus) {
                    updateHUD("🎯", `Focused: ${targetName}`, "status-success");
                    targetEl.focus();
                } else {
                    updateHUD("👆", `Clicked: ${targetName}`, "status-success");
                    targetEl.click();
                }
            }, 500); // Wait for scroll and show outline before clicking
        }
    }

    if (!recognized) {
        console.log("VoiceControl: Command not recognized:", commandText);
        updateHUD("❌", "Not recognized: " + commandText, "status-error");
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
