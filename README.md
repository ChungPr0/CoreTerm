# CoreTerm

[![Release](https://img.shields.io/github/v/release/ChungPr0/CoreTerm?label=release)](https://github.com/ChungPr0/CoreTerm/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/ChungPr0/CoreTerm/release.yml?branch=main)](https://github.com/ChungPr0/CoreTerm/actions/workflows/release.yml)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-0078D4)](https://github.com/ChungPr0/CoreTerm/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-emerald)](LICENSE)

Lightweight multi-tab Windows Terminal, SSH Manager, Dual-Pane SFTP Client, and Remote File Editor built with **Tauri 2** and **Rust**.

## Features

- **Multi-Shell Workspace** — Run `PowerShell`, `pwsh`, `CMD`, `Git Bash`, `WSL`, or custom shells in tabs; launch elevated **Administrator** tabs inside an unprivileged window via a dedicated UAC ConPTY pipe relay; restore previous sessions on startup.
- **SSH & Port Forwarding** — Organize hosts by groups and tags, verify `known_hosts` fingerprints with host-key change warnings, auto-reconnect dropped sessions, and manage `Local (-L)`, `Remote (-R)`, and `Dynamic SOCKS5 (-D)` tunnels with pre-connect port conflict detection.
- **Dual-Pane SFTP** — Open SFTP as a dedicated tab or split pane synced with an active SSH terminal; drag-and-drop recursive transfers with queue control (`Pause`, `Resume`, `Cancel`), configurable conflict policies (`Ask`, `Overwrite`, `Resume`, `Rename`, `Skip`), and POSIX `chmod`.
- **Built-in Code Editor** — Edit local and remote SFTP text files directly in tabs (CodeMirror 6) with syntax highlighting, regex find/replace, go-to-line, `LF`/`CRLF` conversion, and read-only lock.
- **Key Vault & Native Security** — Generate (`Ed25519`, `RSA-4096`) or import SSH keys, store passwords/passphrases in **Windows Credential Manager**, zeroize secrets in memory, enforce strict CSP and filesystem path guards, and verify in-app updates with `SHA-256`.
- **Windows Integration & i18n** — Optional **"Open in CoreTerm"** Explorer context menu, launch-at-startup support, customizable keybindings, and full **English / Tiếng Việt** UI.

## Installation

Download pre-built **Windows 10/11 (x64)** binaries from [**GitHub Releases**](https://github.com/ChungPr0/CoreTerm/releases):

| Package | File | Description |
| :--- | :--- | :--- |
| **Installer (NSIS)** | `CoreTerm_<version>_x64-setup.exe` | Standard setup with auto-update support |
| **Installer (MSI)** | `CoreTerm_<version>_x64_en-US.msi` | Windows Installer package for system deployment |
| **Portable** | `CoreTerm_x64_portable.exe` | Single standalone executable, no installation required |

> **System Requirements**: Windows 10 (1809+) or Windows 11 x64 with **Microsoft Edge WebView2 Runtime** and Windows **OpenSSH Client (`ssh.exe`)** enabled (both pre-installed on modern Windows).

## Default Shortcuts

All shortcuts can be customized in **Settings → Shortcuts**.

| Action | Shortcut |
| :--- | :--- |
| Command Palette (Quick Jump) | `Ctrl+Shift+K` |
| Toggle Host Sidebar | `Ctrl+Shift+B` |
| New Local Shell Tab | `Ctrl+Shift+T` (`Ctrl+Click` `+` for Admin) |
| Duplicate / Close Tab | `Ctrl+Shift+D` / `Ctrl+Shift+W` |
| Switch Next / Previous Tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Toggle Split SFTP Panel | `Ctrl+Shift+E` |
| Find in Terminal / Editor | `Ctrl+Shift+F` / `Ctrl+F` |
| Settings / Fullscreen | `Ctrl+,` / `F11` |

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Desktop & Core** | Tauri 2, Rust (2021), Tokio, SQLite (`rusqlite`), `windows-sys` (ConPTY, Job Objects, Named Pipes, Registry) |
| **SSH, SFTP & Crypto** | Windows OpenSSH (`ssh.exe`), `russh` & `russh-sftp`, `ssh-key`, Windows Keyring, `zeroize` |
| **Frontend** | React 18, TypeScript, Zustand, Tailwind CSS, Vite |
| **Terminal & Editor** | `xterm.js` (WebGL renderer), CodeMirror 6 |

## Development

**Prerequisites**: [Node.js 20+](https://nodejs.org/) and [Rust stable](https://rustup.rs/) (MSVC toolchain on Windows).

```powershell
# Install dependencies
npm ci

# Start development build (Vite + Tauri)
npm run tauri dev

# Run frontend & backend test suites
npm run test
cd src-tauri; cargo clippy --all-targets -- -D warnings; cargo test

# Build release binaries & installers
npm run tauri build
```

## License

[MIT](LICENSE) © ChungPr0
