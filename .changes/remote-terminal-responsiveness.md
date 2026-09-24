- Improve remote terminal responsiveness by reusing authenticated TLS
  connections, disabling packet coalescing delays and batching queued keyboard
  input. Older session servers remain compatible; update both machines to enable
  connection reuse.
- Fix terminal launch menu actions being dismissed before they run on macOS. Add
  WebKit regression coverage for terminal creation and menu navigation.
