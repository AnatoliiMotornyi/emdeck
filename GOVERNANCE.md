# Emdeck governance

Emdeck is an Apache-2.0 open-source project maintained by Erdos Miller. Everyone
may use the source, fork it, report bugs, discuss ideas, and propose changes.
Public visibility does not grant write or merge access to the official
repository.

## Maintainers

- [neek922](https://github.com/neek922)
- [ken-at-em](https://github.com/ken-at-em)
- [mikeyhowk](https://github.com/mikeyhowk)
- [aerdos](https://github.com/aerdos)
- [AnatoliiMotornyi](https://github.com/AnatoliiMotornyi)

These maintainers own triage, technical decisions, reviews, merges, and
releases. `.github/CODEOWNERS` lists them for all paths, including workflows and
governance files. Changes to maintainership follow the same reviewed
pull-request process.

## Change process

1. Discuss substantial new behavior in an issue or Ideas discussion before
   implementing it. Small fixes can arrive directly as pull requests.
2. Make changes in your own fork and target `dev`. This applies to maintainers
   too: neither protected branch accepts direct pushes.
3. A maintainer inspects external pull requests before approving their workflows
   to run. This authorizes the checks, not the proposed change or merge.
4. Pass the Windows, both macOS, Linux, and security/license checks. Resolve
   review conversations and update against the target branch when required.
5. Obtain at least one independent maintainer approval. The author cannot
   approve their own PR, and the latest pusher cannot approve their own push.
   New commits dismiss stale approvals.
6. A designated maintainer merges the PR. Squash small feature/fix PRs into
   `dev`. Promote `dev` to `main` with a reviewed **merge commit** to preserve
   shared history between the two long-lived branches.

The official repository contains only `main` and `dev`; working branches live in
forks. `main` is the reviewed release source, while `dev` integrates reviewed
development work. Neither branch allows force pushes or deletion. Checks and
reviews also apply to administrators; auto-merge and automatic branch deletion
remain disabled. GitHub grants repository administrators protected-branch access
in addition to the named push list; they must still satisfy the enforced checks
and reviews. Organization owners retain control over repository settings and
access. This policy does not remove their inherited administrative permissions.

## Feedback and decisions

[Discussions](https://github.com/Erdos-Miller/emdeck/discussions) hosts
questions, ideas, and announcements.
[Issues](https://github.com/Erdos-Miller/emdeck/issues) tracks reproducible bugs
and concrete feature requests. Maintainers record scope, status, and reasons for
declining or deferring work in those public threads.

Reactions inform priorities alongside reliability, security, cross-platform
behavior, and Emdeck's lightweight design. They do not promise a release date.
The [roadmap](docs/ROADMAP.md) links to current status queues. Maintainers mark
well-scoped tasks as `help wanted` or `good first issue`; a new request is not
automatically an accepted task.

Follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities through
the private process in [SECURITY.md](SECURITY.md), never through public
feedback.
