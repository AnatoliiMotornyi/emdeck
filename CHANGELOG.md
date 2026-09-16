# Changelog

## Unreleased

Pending release notes live in [`.changes/`](.changes/README.md). Add a separate
fragment for each change; do not add entries here.

## 0.1.22 — First public beta

- Lightweight file editing, Markdown previews, and independent project windows.
- Multiple terminal agents with configurable layouts and usage summaries.
- Git branch trees and action submenus, diff tabs, merge conflict tools and
  worktrees.
- Detected/custom run commands, recent commands, and Bun support.
- Dark/light themes, persistent layout, and last-project restoration.
- Organized feature architecture and typed native command boundaries.
- Open-source license, contributor/security/privacy documentation, and bundled
  dependency notices.
- Patched test dependencies, source/history secret scans, Rust advisory checks,
  and immutable CI action references.
- Four-target build/release workflows, signing integration, checksums, installer
  checks and an opt-in terminal soak test.
- Atomic saves retry brief Windows file locks while preserving external-change
  checks and unsaved editor content.
- Terminal layout and size changes keep following live output when the pane was
  at the bottom, while preserving deliberate scrollback reading.
- Windows terminals preserve launch-environment overrides, including tools added
  to `PATH` by a shell or tool manager.

**Unsigned beta:** Windows builds are unsigned; macOS builds use ad-hoc signing
without notarization. Operating-system warnings or device policy may prevent
launching them.

Test environments: Windows 11 x64 locally and Windows Server 2025 x64 in CI,
macOS 15.7.9 on Apple Silicon and Intel, and Ubuntu 24.04.5 x64. Linux downloads
are Ubuntu `.deb` packages. Other OS versions/distributions are not covered by
these results.

Auto-update, durable recovery of unsaved files, and agent reattachment after a
restart are not included. Provider usage fields depend on the installed CLI and
account. See [Validation](docs/VALIDATION.md) and the release's validation
record for completed checks and measurement scope.

## 0.1.21 — Unpublished release candidate

Installed Windows validation found that the terminal library replaced inherited
`PATH` entries with registry defaults, hiding Bun installed by the CI setup.
Publication was held for the 0.1.22 fix; the existing candidate tag was
preserved.

## 0.1.20 — Unpublished release candidate

Release validation found that resizing streaming terminal panes could leave
their views in older scrollback. Output remained intact. Publication was held
for the 0.1.21 fix; the existing candidate tag was preserved.

Earlier versions were local development builds. Their validation history remains
in `docs/VALIDATION.md`.
