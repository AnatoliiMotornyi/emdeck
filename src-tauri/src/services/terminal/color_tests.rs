use super::test_support::HeadlessTerminal;
use std::process::Command;

#[test]
fn terminal_colors_ignore_launcher_flags() {
    // Isolate launcher flags in a child process, never in the test runner or user settings.
    if std::env::var_os("EMDECK_COLOR_TEST_CHILD").is_none() {
        let directory = tempfile::tempdir().unwrap();
        let mut child = Command::new(std::env::current_exe().unwrap());
        child
            .args([
                "--exact",
                "services::terminal::color_tests::terminal_colors_ignore_launcher_flags",
                "--nocapture",
            ])
            .current_dir(directory.path())
            .env("EMDECK_COLOR_TEST_CHILD", "1")
            .env("EMDECK_COLOR_FIXTURE", "preserved")
            .env("NO_COLOR", "1")
            .env("FORCE_COLOR", "0")
            .env("CLICOLOR", "0")
            .env("CLICOLOR_FORCE", "0")
            .env("NODE_DISABLE_COLORS", "1")
            .env("TERM", "dumb")
            .env("COLORTERM", "")
            .env("HOME", directory.path());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            child.creation_flags(0x08000000);
        }
        let output = child.output().unwrap();
        assert!(
            output.status.success(),
            "{} {}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        return;
    }

    let directory = tempfile::tempdir().unwrap();
    std::fs::write(
        directory.path().join("terminal-colors.mjs"),
        include_str!("../../../../tests/fixtures/terminal-colors.mjs"),
    )
    .unwrap();
    for monochrome in [false, true] {
        let command = if !monochrome {
            "node terminal-colors.mjs"
        } else if cfg!(windows) {
            "$env:NO_COLOR='1'; node terminal-colors.mjs --expect-no-color"
        } else {
            "NO_COLOR=1 node terminal-colors.mjs --expect-no-color"
        };
        let mut terminal = HeadlessTerminal::spawn(directory.path(), command);
        let output = terminal.finish();
        let output = String::from_utf8_lossy(&output);
        if monochrome {
            assert!(output.contains("EMDECK_MONOCHROME_OK"), "{output}");
        } else {
            assert!(output.contains("EMDECK_COLOR_OK"), "{output}");
            assert!(output.contains("TRUECOLOR_OK"), "{output}");
            assert!(output.contains("\x1b[31m"), "{output}");
        }
    }
}
