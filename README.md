# Vault.html

Using a 30-million-line C++ browser engine with a massive attack surface just to encrypt a string? **Yes.**

Leveraging unstable, modern browser APIs that might be deprecated next year just to get a native-like experience? **Yes.**

Spinning up a multi-process, GPU-accelerated rendering engine just to display a monospaced font? **Absolutely.**

### What is this?
**Vault** is a single-file, offline, zero-dependency, self-modifying encrypted notepad. It is a "Quine" of sorts: when you save, it takes its own source code, injects your encrypted data into a `<script>` tag, and overwrites the file on your disk.

It replaces your heavy, Electron-based password manager with a single HTML file that lives locally.

### Features

*   **Crypto that tries hard:** AES-GCM 256 encryption derived via PBKDF2 (SHA-256) with 200,000 iterations. Unique salt and IV per save.
*   **Native-ish Feel:** Uses the **File System Access API** (Chrome/Edge/Opera). You press `Ctrl+S`, and it saves to disk. The browser will ask you to confirm write access because it doesn't trust you, but at least it stops creating `vault (42).html` in your Downloads folder.
*   **Fallback for the weak:** On browsers that care about "security standards" or "not giving websites disk access" (Firefox, Safari), it gracefully degrades to downloading a new `.html` file every time you save.
*   **Self-Contained:** No external CSS, no fonts, no JS libraries, no tracking pixels. Just you, the DOM, and `window.crypto`.
*   **Visual Feedback:** SVG icons that animate to tell you if you succeeded or failed. Because UX matters, even in a 10kb tool.

### Usage

1.  **Download** the `vault.html` file.
2.  **Open** it in a Chromium-based browser (Brave, Chrome, Edge) for the best experience.
3.  **Type** your secrets.
4.  **Click the Link Icon** (🔗) to grant the browser write-access to the file handle.
5.  **Save** (Ctrl+S).
6.  **Close.**
7.  **Re-open.** It prompts for your password.
    *   *If you lose your password, your data is gone. The math doesn't care about your feelings.*

### "Link" vs "Save"

*   **Link (🔗):** Uses the File System Access API to bind the current tab to the actual file on your hard drive. It stores the file handle in IndexedDB so you don't have to re-select the file every time you reload the page.
*   **Save (💾):**
    *   *If Linked:* Writes directly to disk.
    *   *If Not Linked:* Triggers a "Download" of a new file named `vault-[uuid].html`.

### Browser Support

| Browser | Experience |
| :--- | :--- |
| **Chrome / Edge / Brave** | **God Tier.** Supports direct file writing. Feels like a real app. |
| **Firefox / Safari** | **Peasant Tier.** No FS Access API. You will download a new file every time you save. |
| **Mobile** | **Survival Mode.** Uses `navigator.share` or downloads. Good luck. |

### Disclaimer
**Zero Warranty.** This code runs entirely in your browser. There is no cloud. I cannot see your data. However, if you store your life savings here and get hacked because you installed a sketchy browser extension that reads the DOM, that is a *you* problem, not a crypto problem. Audit the code yourself—it's right there.