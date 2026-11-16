# CoreTerm

A lightweight, multi-tab Windows Terminal & SSH Connection Manager built with **Tauri 2**, **Rust**, **React**, **TypeScript**, and **xterm.js** (WebGL-accelerated).

## Features

- **Multi-Tab Workspace**: Local PowerShell tabs (standard & elevated Admin UAC relay) alongside SSH connections with drag-and-drop tab reordering and quick jump (`Ctrl+Shift+K`).
- **Connection & Group Management**: Custom connection groups, drag-and-drop host organization, tag filtering, startup commands, and optional auto-reconnect.
- **SSH Key Vault & Keyring**: Generate (`Ed25519`, `RSA-4096`) or import SSH keys, copy public keys, and store passwords/passphrases securely in Windows Keyring / DPAPI.
- **Port Forwarding**: Local (`-L`), Remote (`-R`), and Dynamic SOCKS (`-D`) tunnels with pre-connect port conflict detection and shared tunnel tracking across tabs.
- **Bilingual UI**: Vietnamese & English localization.

## Download

Pre-built binaries for **Windows x64** are available on the **Releases** page:

- **Portable**: `CoreTerm_x64_portable.exe` — standalone executable, run directly from any folder.
- **Installer (NSIS)**: `CoreTerm_<version>_x64-setup.exe`
- **Installer (MSI)**: `CoreTerm_<version>_x64_en-US.msi`

> **Note**: Windows requires **Microsoft Edge WebView2 Runtime** and the built-in **OpenSSH Client (`ssh.exe`)**, both included on modern Windows 10/11 systems.

## License

MIT © 2026 [ChungPr0](LICENSE)
