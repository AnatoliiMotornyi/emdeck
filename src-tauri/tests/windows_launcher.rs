#![cfg(windows)]

use std::{
    fs::File,
    io::{Read, Seek, SeekFrom, Write},
    os::windows::process::CommandExt,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

#[test]
fn desktop_executable_does_not_allocate_a_console() {
    let mut executable = File::open(env!("CARGO_BIN_EXE_emdeck-ide")).unwrap();
    let mut dos = [0; 64];
    executable.read_exact(&mut dos).unwrap();
    assert_eq!(&dos[..2], b"MZ");
    let pe_offset = u32::from_le_bytes(dos[60..64].try_into().unwrap());
    executable.seek(SeekFrom::Start(pe_offset.into())).unwrap();
    let mut pe = [0; 94];
    executable.read_exact(&mut pe).unwrap();
    assert_eq!(&pe[..4], b"PE\0\0");
    assert!(matches!(
        u16::from_le_bytes([pe[24], pe[25]]),
        0x10b | 0x20b
    ));
    // PE signature + COFF header + Subsystem offset in both PE32/PE32+.
    assert_eq!(
        u16::from_le_bytes([pe[92], pe[93]]),
        2,
        "Emdeck must use IMAGE_SUBSYSTEM_WINDOWS_GUI even in debug builds"
    );
}

#[test]
fn desktop_reporter_keeps_redirected_stdin_and_stdout_without_a_console() {
    let directory = tempfile::Builder::new()
        .prefix("emdeck-agent-launch-test-")
        .tempdir()
        .unwrap();
    let target = directory.path().join("usage.json");
    let mut child = Command::new(env!("CARGO_BIN_EXE_emdeck-ide"))
        .arg("--agent-report")
        .arg(&target)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(0x08000000)
        .spawn()
        .unwrap();
    let input_result = child.stdin.take().unwrap().write_all(
        r#"{"model":{"display_name":"Claude café"},"context_window":{"used_percentage":25}}"#
            .as_bytes(),
    );
    let deadline = Instant::now() + Duration::from_secs(15);
    while child.try_wait().unwrap().is_none() {
        if Instant::now() >= deadline {
            child.kill().unwrap();
            child.wait().unwrap();
            panic!("Desktop reporter did not finish after stdin closed");
        }
        thread::sleep(Duration::from_millis(20));
    }
    let output = child.wait_with_output().unwrap();
    input_result.unwrap();
    assert!(output.status.success(), "{:?}", output);
    assert!(String::from_utf8_lossy(&output.stdout).contains("25% context"));
    let report: serde_json::Value = serde_json::from_reader(File::open(target).unwrap()).unwrap();
    assert_eq!(report["model"], "Claude café");
    assert_eq!(report["contextPercent"], 25.0);
}
