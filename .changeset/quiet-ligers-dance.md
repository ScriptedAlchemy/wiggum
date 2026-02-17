---
"@wiggum/rsbuild-plugin-wiggum": patch
---

Improve the injected browser widget manager API so `window.WiggumChatWidget.open()`, `close()`, and `isOpen()` now reflect real runtime widget state instead of placeholder behavior. `open()` now also initializes the widget manager when called before DOM-ready auto-init, and toggle transitions use stable state polling to avoid close/open race oscillation. This release also removes noisy inspector debug logging, softens missing-OpenCode diagnostics to a clearer ENOENT fallback message, and documents the browser API surface in the plugin README.
