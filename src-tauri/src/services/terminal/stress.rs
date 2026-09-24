use super::{test_support::CursorQueries, TerminalEvent, Terminals};
use std::time::{Duration, Instant};

#[test]
#[ignore = "Opt-in six-shell soak; set EMDECK_SOAK_SECONDS, defaults to two hours"]
fn six_terminals_stream_resize_and_shutdown() {
    let seconds = std::env::var("EMDECK_SOAK_SECONDS")
        .unwrap_or_else(|_| "7200".into())
        .parse::<u64>()
        .expect("EMDECK_SOAK_SECONDS must be an integer");
    assert!((5..=10800).contains(&seconds));
    let root = tempfile::tempdir().unwrap();
    let terminals = Terminals::default();
    let (tx, rx) = std::sync::mpsc::channel();
    let command = if cfg!(windows) {
        "while ($true) { [Console]::WriteLine('emdeck synthetic terminal output'); Start-Sleep -Milliseconds 50 }"
    } else {
        "while :; do printf 'emdeck synthetic terminal output\\n'; sleep 0.05; done"
    };
    let ids: Vec<_> = (0..6)
        .map(|index| {
            let sender = tx.clone();
            terminals
                .spawn(root.path(), "", command, 80, 24, move |event| {
                    sender.send((index, event)).is_ok()
                })
                .unwrap()
        })
        .collect();
    let start = Instant::now();
    let mut resized = Instant::now();
    let mut report = Instant::now();
    let mut byte_counts = [0_u64; 6];
    let mut queries: Vec<_> = (0..6).map(|_| CursorQueries::default()).collect();
    while start.elapsed() < Duration::from_secs(seconds) {
        if let Ok((index, event)) = rx.recv_timeout(Duration::from_secs(2)) {
            match event {
                TerminalEvent::Data { data } => {
                    byte_counts[index] += data.len() as u64;
                    for _ in 0..queries[index].consume(&data) {
                        let _ = terminals.write(&ids[index], "\x1b[1;1R");
                    }
                }
                TerminalEvent::Exit { code } => {
                    panic!("Terminal {index} exited during soak: {code:?}")
                }
                TerminalEvent::Usage { .. } | TerminalEvent::Command { .. } => {
                    panic!("Synthetic shells must not create agent probes")
                }
            }
        }
        if resized.elapsed() > Duration::from_secs(2) {
            for id in &ids {
                terminals
                    .resize(id, 80 + (start.elapsed().as_secs() % 40) as u16, 30)
                    .unwrap();
            }
            resized = Instant::now();
        }
        if report.elapsed() > Duration::from_secs(60) {
            println!(
                "Soak {} seconds; bytes per pane: {byte_counts:?}",
                start.elapsed().as_secs()
            );
            report = Instant::now();
        }
    }
    terminals.close_all();
    assert!(terminals.sessions.lock().unwrap().is_empty());
    assert!(byte_counts.iter().all(|bytes| *bytes > 100));
    let deadline = Instant::now() + Duration::from_secs(30);
    let mut exited = [false; 6];
    while exited.iter().any(|value| !value) && Instant::now() < deadline {
        if let Ok((index, TerminalEvent::Exit { .. })) = rx.recv_timeout(Duration::from_secs(1)) {
            exited[index] = true;
        }
    }
    assert!(
        exited.iter().all(|value| *value),
        "A shell did not exit: {exited:?}"
    );
    println!("Six-terminal soak passed after {seconds}s; bytes per pane: {byte_counts:?}");
}
