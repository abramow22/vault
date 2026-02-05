# Vault.html

A single-file, offline, zero-dependency, self-modifying encrypted notepad.

When you save, Vault takes its own source code, injects your encrypted data into a `<script>` tag, and writes the result back to disk. Your notes and the app that protects them are the same file.

### Why?

Because sometimes you just need a place to put sensitive text that doesn't involve trusting a cloud service, installing an Electron app, or managing a database. One HTML file, one password, no dependencies.

### Features

- **AES-GCM 256** encryption derived via PBKDF2 (SHA-256) with 200,000 iterations. Unique salt and IV generated on every save.
- **Direct file writing** via the File System Access API on supported browsers. Press `Ctrl+S` and it saves to disk — no download dialogs, no `vault (42).html` in your Downloads folder.
- **Graceful degradation.** On browsers without FS Access API support, it falls back to downloading a new `.html` file.
- **Completely self-contained.** No external CSS, fonts, scripts, or network requests. Just the DOM and `window.crypto`.

### Usage

1. Download `vault.html` and open it in your browser.
2. Type your content and set a master password when prompted.
3. Click the **Link** icon (🔗) to grant the browser write access to the file on disk.
4. **Save** with `Ctrl+S`.
5. Close and reopen the file anytime — it will prompt for your password to decrypt.

### Link vs Save

| Action | What it does |
| :--- | :--- |
| **Link (🔗)** | Binds the tab to the actual file on disk using the File System Access API. The file handle is stored in IndexedDB so it persists across reloads. |
| **Save (💾)** | If linked, writes directly to the file. If not linked, triggers a download of a new `.html` file. |

### Browser Support

| Browser | Experience |
| :--- | :--- |
| **Chrome / Edge / Brave** | Full support. Direct file writing via FS Access API. |
| **Firefox / Safari** | Functional, but no FS Access API. Each save downloads a new file. |
| **Mobile** | Uses `navigator.share` where available, otherwise downloads. Workable, not ideal. |

### Security Model

Vault is designed to protect **data at rest on your local machine**. Here is what it does and does not defend against:

**Protects against:**
- Someone opening the HTML file without your password
- Casual inspection of the file contents

**Does not protect against:**
- Browser extensions with DOM access (they can read your decrypted text while the vault is open)
- A compromised browser or operating system
- Shoulder surfing, memory forensics, or keyloggers
- You forgetting your password

**There is no password recovery.** The encryption is real. If you lose your password, your data is gone. Keep backups of both the file and your password somewhere safe.

### Known Limitations

- **No auto-lock.** The vault stays decrypted until you manually lock it or close the tab.
- **No backup mechanism.** You are responsible for keeping copies of your vault file.
- **File corruption = data loss.** If the HTML file is truncated or corrupted, there is no recovery. Treat it like any other important local file.
- **Not a password manager.** Vault is an encrypted notepad. It does not handle autofill, per-entry organization, TOTP, or any of the things a dedicated password manager does. If you need those, use one.

### Technical Notes

- The file is self-modifying in the style of a quine: on save, it parses its own original HTML, injects the new encrypted payload, and writes the full document back out.
- File size grows proportionally with your content, plus a small fixed overhead for the application shell.
- All cryptographic operations use the [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API). Nothing is hand-rolled.

### Disclaimer

This tool runs entirely in your browser. There is no server, no telemetry, and no way for anyone — including me — to access your data. That also means there is no safety net. Audit the source if you'd like; it's right there in the file.

The math doesn't care about your feelings. Keep backups.

### License

[MIT](LICENSE)