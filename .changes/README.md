# Pending release notes

Add one uniquely named Markdown file per change, for example
`37-release-note-fragments.md` or `terminal-scrollback.md`. Use lowercase
letters, numbers and hyphens. Different PRs must use different filenames. Do not
edit another PR's note or append entries to `CHANGELOG.md`.

Write one or more short bullets describing the resulting behavior. Indent
continuation lines with two spaces. Use absolute URLs for links so they work
both here and in the generated changelog. For example:

```md
- Keep the terminal's historical line visible when resizing its pane. Manual
  scrolling takes precedence over pending layout restoration.
```

Documentation-only, test-only and internal refactors can omit a fragment;
explain that choice in the PR's release-impact section. A dev-to-main promotion
carries the existing fragments and does not need a duplicate note.

`bun run changelog:check` validates filenames, bullet formatting and the fixed
Unreleased notice. It runs as part of `bun run check` in CI.
`bun run changelog:preview` prints all pending notes without modifying anything.

Only release preparation combines the fragments into a versioned changelog
section, in filename order, and removes the consumed files. The command previews
by default and requires `--write` to change files. It refuses to overwrite an
existing release. See
[the release process](../docs/RELEASE.md#prepare-release-notes).

`legacy-unreleased.md` contains the notes migrated from the old shared section.
Leave that file unchanged until release preparation consumes it.
