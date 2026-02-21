# 🎙️ VoiceControl Browser Extension

[![Status: Active](https://img.shields.io/badge/Status-Active-brightgreen.svg)]()
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue.svg)]()
[![Voice Tech](https://img.shields.io/badge/API-SpeechRecognition-blue.svg)]()

**VoiceControl** is a powerful, accessibility-focused Chrome Extension that allows you to navigate the web, scroll pages, and click on elements entirely through voice commands. Built on top of the modern Web Speech API, it features a hands-free continuous listening mode activated by a customizable "Wake Word".

---

## ✨ Features

- **🗣️ Continuous Listening & Wake Word:** The extension listens quietly in the background. It only acts when you trigger it with your specific Wake Word (default: `"hey browser"`).
- **🧭 Web Navigation:** Easily navigate to websites, go back/forward in history, or refresh the page with just your voice.
- **↕️ Hands-free Scrolling:** Scroll up, down, or instantly jump to the top or bottom of any page.
- **🖱️ Smart Element Interaction:** Say `"click [button name]"` to automatically find and click links, buttons, or inputs on the page, equipped with fuzzy-matching technology for when you don't say the exact name perfectly.
- **⚙️ Customizable Settings:** Configure your wake word, recognition language, scroll distance, and HUD appearance through a clean, built-in options page.
- **👀 Visual HUD:** Get real-time feedback with a minimally invasive Heads-Up Display (HUD) showing microphone status and command recognition results.

---

## 🚀 Installation

### Loading Unpacked Extension
Since this extension is in active development, you can load it directly into Chrome:

1. Clone or download this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **"Developer mode"** using the toggle switch in the top right corner.
4. Click the **"Load unpacked"** button in the top left.
5. Select the folder containing the extension files.
6. The VoiceControl extension will now appear in your extensions list and toolbar. Pin it for easy access!

---

## 🎯 How to Use (Commands)

VoiceControl requires two steps to execute a command:
1. First, say your **Wake Word**. By default, this is `"hey browser"`.
2. Immediately follow it with one of the recognized **Commands**.

*Example: "hey browser, scroll down"*

### Navigation & Scrolling
| Command | Action |
| --- | --- |
| `go to [website]` | Navigates to a specific site. E.g., *"hey browser go to netflix"* |
| `scroll down` | Scrolls the page down by the configured amount. |
| `scroll up` | Scrolls the page up by the configured amount. |
| `scroll to top` | Scrolls instantly to the very top of the page. |
| `scroll to bottom` | Scrolls instantly to the very bottom of the page. |
| `go back` | Navigates "back" in your browser tab history. |
| `go forward` | Navigates "forward" in your browser tab history. |
| `reload` / `refresh` | Reloads the current page. |

### Clicking & Interacting
| Command | Action |
| --- | --- |
| `click [name]` | Finds an element (button, link) matching `[name]` and clicks it. E.g., *"hey browser click sign in"* |
| `focus [name]` | Finds an input/search bar matching `[name]` and brings it into focus. E.g., *"hey browser focus search"* |

### Extension Help
| Command | Action |
| --- | --- |
| `show commands` | Opens an on-screen overlay listing all available commands. |
| `hide commands` | Closes the on-screen command overlay. |

---

## 🛠️ Configuration

You can customize VoiceControl to fit your workflow by right-clicking the extension icon and selecting **"Options"** (or clicking the gear icon in the extension popup).

* **Wake Word:** Change `"hey browser"` to any phrase you prefer.
* **Language:** Set the Speech Recognition language dialect (e.g., `en-US`, `en-GB`, `fr-FR`).
* **Scroll Amount:** Adjust how far the page jumps when using scroll commands (default: 400px).
* **HUD Position:** Move the visual status indicator to any corner of your screen.
* **HUD Opacity:** Adjust the transparency of the HUD so it stays out of your way.

---

## 🔒 Permissions & Privacy

VoiceControl runs locally in your browser. 
* **Microphone (`audioCapture`):** Required to hear your commands through the Web Speech API. Chrome's speech recognition engine handles processing.
* **Storage:** Used solely config preferences (like your custom wake word).
* **ActiveTab & Scripting:** Required to execute scrolling, clicking, and DOM inspection commands directly on the web pages you visit.

Your voice data is processed by Chrome's built-in speech recognition layer and is not stored or transmitted to any third-party analytics servers by this extension. 
