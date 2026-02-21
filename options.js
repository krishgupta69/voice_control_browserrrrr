/**
 * options.js — VoiceControl Browser
 * Options Page Controller
 */

document.addEventListener("DOMContentLoaded", () => {
    // UI Elements
    const wakeWordInput = document.getElementById("wakeWord");
    const languageSelect = document.getElementById("language");
    const ttsEnabledCheckbox = document.getElementById("ttsEnabled");
    const scrollAmountSlider = document.getElementById("scrollAmount");
    const scrollAmountVal = document.getElementById("scrollAmountVal");
    const hudPositionSelect = document.getElementById("hudPosition");
    const hudOpacitySlider = document.getElementById("hudOpacity");
    const hudOpacityVal = document.getElementById("hudOpacityVal");
    const saveStatus = document.getElementById("save-status");

    let statusTimeout;

    // Default settings
    const defaultSettings = {
        wakeWord: "hey browser",
        language: "en-US",
        ttsEnabled: true,
        scrollAmount: 400,
        hudPosition: "bottom-right",
        hudOpacity: 0.88
    };

    // Load settings
    chrome.storage.sync.get(defaultSettings, (items) => {
        wakeWordInput.value = items.wakeWord;
        languageSelect.value = items.language;
        ttsEnabledCheckbox.checked = items.ttsEnabled;

        scrollAmountSlider.value = items.scrollAmount;
        scrollAmountVal.textContent = items.scrollAmount;

        hudPositionSelect.value = items.hudPosition;

        hudOpacitySlider.value = items.hudOpacity;
        hudOpacityVal.textContent = items.hudOpacity;
    });

    // Save settings function
    const saveSettings = () => {
        const settings = {
            wakeWord: wakeWordInput.value.trim().toLowerCase() || "hey browser",
            language: languageSelect.value,
            ttsEnabled: ttsEnabledCheckbox.checked,
            scrollAmount: parseInt(scrollAmountSlider.value, 10),
            hudPosition: hudPositionSelect.value,
            hudOpacity: parseFloat(hudOpacitySlider.value)
        };

        chrome.storage.sync.set(settings, () => {
            // Show saved status
            saveStatus.classList.add("show");
            clearTimeout(statusTimeout);
            statusTimeout = setTimeout(() => {
                saveStatus.classList.remove("show");
            }, 2000);
        });
    };

    // Listeners for live value updates and auto-saving
    wakeWordInput.addEventListener("change", saveSettings);
    languageSelect.addEventListener("change", saveSettings);
    ttsEnabledCheckbox.addEventListener("change", saveSettings);

    scrollAmountSlider.addEventListener("input", (e) => {
        scrollAmountVal.textContent = e.target.value;
    });
    scrollAmountSlider.addEventListener("change", saveSettings);

    hudPositionSelect.addEventListener("change", saveSettings);

    hudOpacitySlider.addEventListener("input", (e) => {
        hudOpacityVal.textContent = e.target.value;
    });
    hudOpacitySlider.addEventListener("change", saveSettings);

});
