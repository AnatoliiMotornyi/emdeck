use super::test_support::HeadlessTerminal;
use std::os::windows::process::CommandExt;
use std::{fs, path::PathBuf, process::Command};

#[test]
fn inherits_launch_path() {
    // Change only a child test process's environment: other parallel tests and
    // the developer's registry/PATH remain untouched.
    if std::env::var_os("EMDECK_PATH_TEST_CHILD").is_none() {
        let fixture = tempfile::tempdir().unwrap();
        let bin = fixture.path().join("bin");
        let work = fixture.path().join("work");
        fs::create_dir(&bin).unwrap();
        fs::create_dir(&work).unwrap();
        let system = PathBuf::from(std::env::var_os("SystemRoot").unwrap());
        fs::copy(
            system.join("System32/cmd.exe"),
            bin.join("emdeck-path-regression-fixture.exe"),
        )
        .unwrap();
        let inherited = std::env::var_os("PATH").unwrap();
        let path =
            std::env::join_paths(std::iter::once(bin).chain(std::env::split_paths(&inherited)))
                .unwrap();
        let result = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "services::terminal::environment_tests::inherits_launch_path",
                "--nocapture",
            ])
            .current_dir(&work)
            .creation_flags(0x08000000) // CREATE_NO_WINDOW for this background test helper.
            .env("EMDECK_PATH_TEST_CHILD", "1")
            .env("PATH", path)
            .env("TEMP", &work)
            .env("EMDECK_EXPECTED_TEMP", &work)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "Inherited PATH regression failed: {} {}",
            String::from_utf8_lossy(&result.stdout),
            String::from_utf8_lossy(&result.stderr)
        );
        return;
    }

    let mut terminal = HeadlessTerminal::spawn(
        &std::env::current_dir().unwrap(),
        "emdeck-path-regression-fixture.exe /D /C echo EMDECK_LAUNCH_PATH_OK; if ($env:TEMP -ne $env:EMDECK_EXPECTED_TEMP) { exit 3 }; exit $LASTEXITCODE",
    );
    let output = terminal.finish();
    assert!(String::from_utf8_lossy(&output).contains("EMDECK_LAUNCH_PATH_OK"));
}
