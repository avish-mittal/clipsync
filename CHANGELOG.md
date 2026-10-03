# Changelog

All notable changes to the ClipSync project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-10-03 (v1.1 Update)

### Added
- **Auto-Copy to System Clipboard**:
  - Clean, minimal toggle switch labelled `"Auto-copy incoming text"` added to the top navigation bar.
  - Automatically copies incoming text, code snippets, or URLs received over WebSocket directly into the operating system clipboard using the asynchronous Web Clipboard API (`navigator.clipboard.writeText`).
  - Tactile visual feedback: emerald green glowing flash on the toggle container and a `"Copied!"` toast notification for 1.5 seconds upon successful copy.
  - Preference persistence across browser reloads and sessions via `localStorage` (key: `clipsync_autocopy`).
  - Resilient error handling with `.catch` to prevent any runtime exceptions if the tab lacks focus or clipboard write permissions are restricted.
- **Docker Support**:
  - Multi-stage `Dockerfile` based on `node:18-alpine` for containerized deployments.
  - `docker-compose.yml` for single-command orchestration (`docker compose up -d`).

### Changed
- Updated brand version indicator in the dashboard top bar to `v1.1`.
- Enhanced responsive CSS layout for the top bar and action buttons on narrow and mobile screens.
- Server `/api/v1/info` endpoint now reports version `1.1.0`.

---

## [1.0.0] - 2026-10-03

### Initial Release
- Real-time cross-device clipboard synchronization with native WebSockets.
- Ephemeral file drag-and-drop & download engine.
- In-memory FIFO ring buffer with disk persistence fallback.
- QR code generator modal for instant mobile device pairing over local Wi-Fi.
- Strict developer dark-mode UI with linear/raycast aesthetics.
