---
"@wiggum/rsbuild-plugin-wiggum": patch
---

Improve the injected browser widget manager API so `window.WiggumChatWidget.open()`, `close()`, and `isOpen()` now reflect real runtime widget state instead of placeholder behavior. This release also removes noisy inspector debug logging and documents the browser API surface in the plugin README.
