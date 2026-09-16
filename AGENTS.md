# Emdeck contributor instructions

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing module
ownership. Emdeck's contribution rules and dependency boundaries are defined in
this repository.

- Use Node 22 and Bun 1.3.6. Commit `bun.lock`; do not create another JS
  lockfile.
- Add user-facing release notes in a unique `.changes/<slug>.md` fragment, not
  the shared `CHANGELOG.md`. Only release preparation updates the changelog; see
  `.changes/README.md` and `docs/RELEASE.md`.
- Keep repository branches limited to `main` and `dev`. Develop on `dev` and
  promote to `main` through the required checks and independent review. Publish
  changes through a fork PR targeting `dev`; direct pushes to either protected
  branch are disabled. Use a merge commit for `dev` → `main` promotion.
- Keep domain services independent of React, Tauri and browser storage. Receive
  IO through typed ports. Compose features in `src/app`, never through sibling
  feature imports. Contracts belong in `src/shared/contracts`.
- Use separate type imports, named JSX handlers, arrow functions in services,
  and the checked-in Prettier/ESLint rules. Do not add `eslint-disable`
  comments.
- Respect the code-size budgets: components/hooks 500, services 700, tests 900
  physical lines. No grandfathering or baseline increases. Extract cohesive
  units.
- Keep native commands thin. Window identity and project authorization remain on
  the native side. Native services must not import command or window-state
  modules.
- Preserve `dev.relay.ide`, `relay:` storage keys, window labels and the preview
  root unless a change includes an explicit data migration.
- Preserve editor undo history and running terminal sessions across theme,
  layout, visibility and rename changes. Never add background indexing or start
  agents/run commands simply because a project was opened.
- Before finishing, run `bun run verify`,
  `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, and
  `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings`.
  Add tests for new services and user-visible behavior. Browser tests run
  against a fixed build.
- For React changes, run the pinned React Doctor audit documented in the
  architecture guide and review findings; do not silently suppress them.
- Use argv-based child processes. On Windows, do not pass `.cmd` shims to
  `spawn`/`execFile`; invoke the actual executable or its JS entry point. Launch
  background helpers hidden. Verify resolved paths before recursive removal.
- Tests may use isolated temporary files, Git repositories and shells. Never use
  the user's open projects, credentials or real remotes as fixtures.
- Do not commit, push, send messages or publish unless the user asks for that
  action.
