# Release process and readiness

The first public beta candidate is **0.1.22**. This document distinguishes
implemented release tooling from validation that still needs a real runner or
signing account. A compiled binary alone is not release approval.

## Repository and licensing

The public home is `Erdos-Miller/emdeck`, under Apache-2.0, copyright Erdos
Miller. `LICENSE` is the canonical license text; `NOTICE` records the project
attribution. Keep `package.json` private to prevent accidental npm publication;
that flag does not make the GitHub repository private.

Before the first push, run redacted source secret scanning and review staged
files. The repository excludes build outputs, local profiles, `.env` files,
private keys, signing certificates, logs and scratch data. Source/history scans
are complementary; ignore rules do not make previously committed secrets safe.
Keep internal repository material and real-user screenshots out of public docs.

Enable Issues, private vulnerability reporting, dependency alerts, secret
scanning/push protection, and branch protection on the default branch. Require
all four `Check <platform>` checks plus `security / Security and licenses`,
reject force pushes/deletion, require resolved review conversations, and review
pull requests before merging. GitHub organization policy and account permissions
may restrict these settings.

## Local verification

```sh
bun install --frozen-lockfile
bun run release:tools
bun run security:check
bun run security:rust
bun run licenses:generate
bun run release:check
bun run workflows:check
bun run verify
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
```

Audit tools are downloaded from official releases into `.tmp`, pinned by version
and SHA-256. The bundled installer supports Windows/Linux x64; other hosts can
use the Linux security CI job. No scanners run inside Emdeck. Generated notices
must be committed whenever the locked dependency graph changes. See
[Dependency review](DEPENDENCIES.md) for exact upstream maintenance
acknowledgments; no security vulnerability is waived.

## Prepare release notes

Ordinary PRs add independent [release-note fragments](../.changes/README.md). Do
not prepend entries to `CHANGELOG.md`: its Unreleased section stays fixed so
concurrent contributions do not edit the same lines. Existing pending entries
were migrated into `legacy-unreleased.md`; new PRs leave that fragment
unchanged.

When preparing a release on `dev`:

1. Review `bun run changelog:preview` and update fragment wording as needed.
2. Set the new version consistently in `package.json`, `src-tauri/Cargo.toml`,
   `src-tauri/tauri.conf.json` and the Cargo lockfile.
3. Preview and then write the release section (replace `0.1.23` with the
   version):

   ```sh
   bun run changelog:release 0.1.23
   bun run changelog:release 0.1.23 --write
   bun run release:check
   ```

4. Review and commit the changelog, consumed-fragment deletions and version
   files together through the normal PR process. Promote `dev` to `main` with a
   merge commit, and create the version tag on the reviewed release commit.

The release command defaults to a preview, orders fragments by filename, keeps
earlier releases intact, and refuses an existing version. It writes the full
changelog before deleting the exact fragments included in it; it never commits,
tags or publishes. Repeating it for the same version fails without changing
files. CI checks fragment format and the fixed Unreleased notice. Draft release
metadata rejects a tag with unconsumed fragments so notes cannot be omitted from
a published release. Preview packages and ordinary development checks still
allow pending fragments.

During this transition, older open PRs may still edit Unreleased. Move their new
notes into a unique fragment and retain the fixed notice when resolving those
conflicts. Future PRs then avoid this shared changelog edit entirely.

## Workflows

- **Check Emdeck:** formatting, architecture, release metadata, tests, native
  compilation, and browser workflows on Windows x64, macOS Apple Silicon, macOS
  Intel and Ubuntu x64. Calls the security/license workflow.
- **Security and licenses:** JavaScript/Rust audits, source/history secret
  scans, notice regeneration/drift checks, and workflow linting. Also runs
  weekly to catch newly disclosed advisories.
- **Package Emdeck:** manual preview builds or reusable signed packaging.
  Windows CI installs into a disposable runner, checks native launch/close,
  bundled licenses, real WebView file saving/Markdown/six terminals,
  external-change protection, worktrees, Bun commands, same-version
  reinstall/data retention, and uninstall. macOS mounts each DMG, copies the
  app, checks its notices/signature and launches/quits it. Ubuntu installs the
  `.deb`, opens a native window under Xvfb, requests a normal close and removes
  the package. This is not proof of upgrade compatibility with every historical
  version.
- **Draft release:** manually select an existing version tag to run checks, then
  packaging, then create a draft GitHub prerelease with installers,
  source-commit manifests, notices and SHA-256 checksums. The tag must match
  package/Cargo/Tauri versions and the changelog. Failed target builds prevent
  creation of a partial draft.

Push the version tag, then manually run Draft release for that tag. The signing
input defaults to true; choose `signed=false` for an explicitly approved
unsigned beta. Tag pushes alone do not publish or build a release. The release
notes label unsigned builds, and the workflow never silently downgrades signed
builds. Review the complete draft and actual platform validation before
publishing it. Normal repository checks cannot create releases.

```sh
gh workflow run release.yml --ref main -f tag=v0.1.22 -f signed=false
```

## Signing setup

Repository secrets are configured through GitHub settings or secure CLI input,
never committed or pasted into issues:

| Platform | Secrets                                                                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows  | `WINDOWS_CERTIFICATE` (base64 PFX), `WINDOWS_CERTIFICATE_PASSWORD`                                                                                             |
| macOS    | `APPLE_CERTIFICATE` (base64 certificate), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific), `APPLE_TEAM_ID` |

The Windows path supports a code-signing certificate with an exportable key.
Certificates requiring hardware/cloud signing need the issuer's signing
integration instead; do not export a hardware-protected key. The script imports
into the disposable runner, timestamps SHA-256 signatures, deletes the temporary
PFX and removes the imported signing certificate. Windows verifies signatures on
the installer and installed executable.

Tauri handles macOS certificate import, signing and notarization. CI verifies
the signature, Gatekeeper assessment and notarization staple. Unsigned preview
Mac builds use explicit ad-hoc signing. Acquiring paid certificates/accounts is
outside repository automation. See the official
[Windows](https://v2.tauri.app/distribute/sign/windows/) and
[macOS](https://v2.tauri.app/distribute/sign/macos/) guides.

## Per-release acceptance checklist

Complete this checklist for each release and attach its results to the GitHub
release. The tagged source is built before these final results exist; do not
infer that an unchecked template item is a failed test. Actual results belong in
[Validation](VALIDATION.md) and the release's validation record.

- [ ] All four remote platform checks and packaging jobs pass on the release
      commit.
- [ ] Clean installs launch and close on supported real/virtual operating
      systems.
- [ ] Previous-version profile compatibility and installer data retention are
      checked. Record the exact versions and distinguish profile migration from
      an in-place installer upgrade; never imply that all historical versions
      were tested.
- [ ] File saves, external-change conflicts, Git worktrees and commands behave
      correctly in the installed app.
- [ ] Multiple native terminals survive resizing/layout changes and terminate on
      closing.
- [ ] Multi-hour terminal soak completes; desktop CPU/memory observations are
      attached.
- [x] The first beta is explicitly approved and labeled unsigned. Future
      releases must confirm signing/notarization or repeat that decision.
- [x] Linux beta uses the Ubuntu `.deb` with system-managed WebKitGTK libraries.
      AppImage distribution is deferred until its bundled system libraries have
      their notices/source information reviewed.
- [ ] Release notes list remaining limitations and exact tested platform
      versions.

The opt-in `bun run test:soak` runs six synthetic native shells for two hours,
streaming output, resizing PTYs and checking shutdown. It uses temporary files
and no provider account. For a short smoke run set `EMDECK_SOAK_SECONDS=15`.
This test does not measure WebView rendering or provider-agent behavior.

The Windows package job also runs `scripts/release/windows-desktop.mjs` against
the installed executable. It uses a unique test profile and synthetic project,
with a loopback CDP port enabled only for that subprocess, following
[Playwright's WebView2 testing guide](https://playwright.dev/docs/webview2). No
debugging port is configured in the shipped application. WebView2 150 and later
ignore environment overrides in an elevated process, so disposable GitHub
Windows runners temporarily apply and remove an executable-specific HKLM test
policy. Developer machines use process environment settings only. The optional
**Review Windows installer** workflow repeats these checks against a selected
Package Emdeck artifact without rebuilding it.

On Windows,
`scripts/release/measure-windows.ps1 -AppProcessId <pid> -Seconds 7200` samples
an existing Emdeck instance and its currently attached descendants. Record idle
and six-terminal sessions separately, with machine specifications. CPU is
expressed as a percentage of one logical core; summed working sets may
double-count shared pages. Detached processes can fall outside the measured
tree. Do not advertise performance numbers without the workload and these
limitations.

Unsaved buffers are protected during normal closes and external changes, but
there is no durable recovery after a crash. Agent sessions are not reattached
after restart. Auto-update, extensions, and debugger support remain future work.
See [Validation](VALIDATION.md) for completed checks rather than treating this
checklist as evidence that a test ran.
