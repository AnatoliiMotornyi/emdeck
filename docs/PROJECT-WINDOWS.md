# Project windows

Emdeck opens each folder in one window. Choosing an already-open folder brings
that window forward, restores it if minimized, and keeps its edits and terminals
intact. Different folders can have separate windows. Replacing the current
project with an already-open folder focuses its window and preserves the source
workspace as well.

Launching Emdeck again shows the most recently focused window. To select a
specific folder from a shell, pass one folder argument or `--project`:

```powershell
& 'C:\path\to\emdeck-ide.exe' --project 'C:\projects\example'
```

```sh
emdeck-ide --project ~/projects/example
```

Relative paths are resolved from the launching shell's working directory. Folder
links and alternate path spellings point to the same window. Closing a project
window releases its folder so it can be opened again. Older running versions
without this routing support need to be closed normally before the updated
version can manage all project windows.

## Windows acceptance test

The following builds a separate test edition. Its identifier and profile are
isolated from the ordinary IDE; do not ship this build. First build the
frontend, then run:

```sh
bun run build
bun run tauri build --debug --no-bundle --config scripts/release/window-test.conf.json
node scripts/release/windows-projects.mjs src-tauri/target/debug/emdeck-ide.exe
```

The script requires the test product metadata before launching, then confirms
the native app identifier before interacting. It uses only temporary project
folders and its own WebView profile. It checks repeated opens, path aliases,
simultaneous requests, second-process forwarding, minimized-window restoration,
draft and terminal preservation, and close/reopen behavior. Only test-owned
windows are destroyed during cleanup. Build without this test configuration for
the normal app.
