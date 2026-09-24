# Contributing to Emdeck

Emdeck is a lightweight workspace for editing files and working with terminal
agents. Keep changes focused, explicit, and inexpensive while idle.

## Choose a starting point

- Found a bug? Use the
  [bug report](https://github.com/Erdos-Miller/emdeck/issues/new?template=bug.yml).
- Have a concrete request? Use the
  [feature form](https://github.com/Erdos-Miller/emdeck/issues/new?template=feature.yml).
- Want to explore an idea or ask for help? Start in
  [Discussions](https://github.com/Erdos-Miller/emdeck/discussions).
- Want a first contribution? Look for
  [help wanted](https://github.com/Erdos-Miller/emdeck/issues?q=is%3Aopen%20label%3A%22help%20wanted%22)
  or
  [good first issue](https://github.com/Erdos-Miller/emdeck/issues?q=is%3Aopen%20label%3A%22good%20first%20issue%22).

Search for existing reports before opening a new one. Discuss substantial
changes first so maintainers can agree on scope. Follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Development

Install Node.js 22.12 or newer within Node 22, Bun 1.3.6, stable Rust, Git, and
the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
bun install --frozen-lockfile
bun run desktop
```

`bun run dev` runs the browser demo using sample files and simulated agents.
Read [AGENTS.md](AGENTS.md) and [Architecture](docs/ARCHITECTURE.md) before
changing ownership or lifecycle behavior. All requirements for building and
contributing are documented in this repository.

## Pull requests

The official repository keeps two protected branches: `main` for reviewed
release-ready source and `dev` for development. Contributors and maintainers
work in forks and target `dev`; do not create extra branches in the official
repository or push directly to either protected branch.

1. Fork this repository and start from its current `dev` branch.
2. Make a focused change on a working branch in your fork. Link the related
   issue.
3. Run the checks below and open a pull request targeting
   `Erdos-Miller/emdeck:dev`.
4. A maintainer approves external workflows to run after inspecting the changes.
5. Address feedback and obtain an independent maintainer approval. New commits
   require fresh approval; all required platform and security checks must pass.
6. A designated maintainer merges the PR. Being a contributor does not grant
   repository write access.

Maintainers promote `dev` to `main` through a separate reviewed PR, using a
**merge commit** to preserve branch ancestry. CI runs on pushes and PRs for both
branches. See [Governance](GOVERNANCE.md) for maintainers and enforcement.

Explain the problem and resulting behavior, and include a screenshot for visible
changes. Add behavior tests for new functionality; use isolated test
repositories and shells. Do not include credentials, private source, agent
transcripts, or screenshots of real projects.

Agent-assisted contributions are welcome. Review generated code, understand its
behavior and dependencies, and take responsibility for the final change. Do not
include a private agent transcript as evidence.

For user-facing changes, add a uniquely named Markdown release-note fragment in
[`.changes/`](.changes/README.md), such as `.changes/terminal-scrollback.md`. Do
not edit the shared `CHANGELOG.md` or another PR's fragment. Preview pending
notes with `bun run changelog:preview`; validation runs in `bun run check`.
Documentation-only, test-only and internal refactors may omit a fragment with an
explanation in the PR. Maintainers combine notes only during release
preparation.

```sh
bun run verify
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
```

For browser tests outside Windows, install Chromium once with
`bunx playwright install chromium`. Linux CI also installs browser dependencies.
Changes to dependencies must regenerate license notices and pass the security
checks in [Release process](docs/RELEASE.md). Keep the Bun and Cargo lockfiles
committed. Never bypass checks to merge a release.

Routine dependency updates are made on `dev`. Automatic Dependabot version pull
requests are disabled to avoid extra branches; vulnerability alerts and the
scheduled security audit remain available.

## Issues and conduct

Include Emdeck version, operating system/architecture, steps to reproduce, and
expected versus actual behavior. Reproduce using a small public or synthetic
project. Follow [Security policy](SECURITY.md) for private vulnerability
reports.

The [feedback and roadmap guide](docs/ROADMAP.md) explains status labels and how
requests are prioritized. Maintainers do not promise response times during the
beta and do not close reports automatically because of age.
