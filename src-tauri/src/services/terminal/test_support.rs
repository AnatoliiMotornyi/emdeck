use super::{TerminalEvent, Terminals};
use std::{
    path::Path,
    sync::mpsc::{self, Receiver},
    time::{Duration, Instant},
};

// Cold Windows CI shells can take more than 15 seconds to start. Bound the whole
// exchange, rather than resetting an idle timeout on every repaint or reply.
const PTY_DEADLINE: Duration = Duration::from_secs(60);

#[derive(Default)]
pub(super) struct CursorQueries {
    matched: usize,
}

impl CursorQueries {
    pub(super) fn consume(&mut self, data: &[u8]) -> usize {
        let query = b"\x1b[6n";
        let mut count = 0;
        for &byte in data {
            if byte == query[self.matched] {
                self.matched += 1;
                if self.matched == query.len() {
                    count += 1;
                    self.matched = 0;
                }
            } else {
                self.matched = usize::from(byte == query[0]);
            }
        }
        count
    }
}

fn receive_before(
    events: &Receiver<TerminalEvent>,
    deadline: Instant,
) -> Result<TerminalEvent, String> {
    let remaining = deadline
        .checked_duration_since(Instant::now())
        .filter(|duration| !duration.is_zero())
        .ok_or("PTY deadline exceeded")?;
    events
        .recv_timeout(remaining)
        .map_err(|error| error.to_string())
}

pub(super) struct HeadlessTerminal {
    pub terminals: Terminals,
    pub id: String,
    events: Receiver<TerminalEvent>,
    deadline: Instant,
    queries: CursorQueries,
    output: Vec<u8>,
    exit: Option<Option<u32>>,
}

impl HeadlessTerminal {
    pub fn spawn(cwd: &Path, command: &str) -> Self {
        let (sender, events) = mpsc::channel();
        let mut terminal = Self {
            terminals: Terminals::default(),
            id: String::new(),
            events,
            deadline: Instant::now() + PTY_DEADLINE,
            queries: CursorQueries::default(),
            output: Vec::new(),
            exit: None,
        };
        terminal.id = terminal
            .terminals
            .spawn(cwd, "", command, 100, 30, move |event| {
                sender.send(event).is_ok()
            })
            .unwrap();
        terminal
    }

    fn receive(&mut self) {
        let event = receive_before(&self.events, self.deadline).unwrap_or_else(|error| {
            panic!(
                "PTY did not finish within {PTY_DEADLINE:?}: {error}; output={:?}",
                String::from_utf8_lossy(&self.output)
            )
        });
        match event {
            TerminalEvent::Data { data } => {
                // Only answer new queries, including queries split across reads.
                // Searching all prior output sends unsolicited input on every chunk.
                for _ in 0..self.queries.consume(&data) {
                    let _ = self.terminals.write(&self.id, "\x1b[1;1R");
                }
                self.output.extend(data);
            }
            TerminalEvent::Exit { code } => self.exit = Some(code),
            TerminalEvent::Usage { .. } | TerminalEvent::Command { .. } => {
                panic!("Plain test shells must not create agent probes")
            }
        }
    }

    pub fn wait_for_output(&mut self, expected: &str) {
        while !String::from_utf8_lossy(&self.output).contains(expected) {
            assert!(
                self.exit.is_none(),
                "PTY exited before {expected:?}; output={:?}",
                String::from_utf8_lossy(&self.output)
            );
            self.receive();
        }
    }

    pub fn finish(&mut self) -> Vec<u8> {
        while self.exit.is_none() {
            self.receive();
        }
        assert_eq!(
            self.exit,
            Some(Some(0)),
            "{}",
            String::from_utf8_lossy(&self.output)
        );
        assert!(self.terminals.sessions.lock().unwrap().is_empty());
        std::mem::take(&mut self.output)
    }
}

impl Drop for HeadlessTerminal {
    fn drop(&mut self) {
        // Also close the fixture shell when a timeout or assertion unwinds the test.
        self.terminals.close_all();
    }
}

#[test]
fn replies_once_per_cursor_query_across_every_chunk_boundary() {
    let output = b"\x1b[6n\x1b[?9001h\x1b]0;PowerShell\x07\x1b[6nready";
    for split in 0..=output.len() {
        let mut queries = CursorQueries::default();
        assert_eq!(
            queries.consume(&output[..split]) + queries.consume(&output[split..]),
            2
        );
        assert_eq!(queries.consume(b"more output\r\n\x1b[?25h"), 0);
    }
    let mut queries = CursorQueries::default();
    let replies: usize = output.chunks(1).map(|chunk| queries.consume(chunk)).sum();
    assert_eq!(replies, 2);
    assert_eq!(queries.consume(b"\x1b\x1b[6n\x1b[5n\x1b[6x"), 1);
}

#[test]
fn queued_output_does_not_extend_an_expired_deadline() {
    let (sender, events) = mpsc::channel();
    sender
        .send(TerminalEvent::Data {
            data: b"repainting".to_vec(),
        })
        .unwrap();
    assert!(receive_before(&events, Instant::now()).is_err());
    assert!(events.try_recv().is_ok());
}

#[test]
fn a_failed_test_closes_its_waiting_shell() {
    let directory = tempfile::tempdir().unwrap();
    let command = if cfg!(windows) {
        "[Console]::WriteLine('EMDECK_WAITING'); [Console]::ReadLine() | Out-Null"
    } else {
        "printf 'EMDECK_WAITING\\n'; IFS= read -r line"
    };
    let mut terminal = HeadlessTerminal::spawn(directory.path(), command);
    terminal.wait_for_output("EMDECK_WAITING");
    let sessions = terminal.terminals.sessions.clone();
    let events = std::mem::replace(&mut terminal.events, mpsc::channel().1);
    terminal.deadline = Instant::now();
    let failure = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
        // Force the timeout path without waiting 60 seconds or using a real project.
        terminal.finish();
    }));
    assert!(failure.is_err());
    assert!(sessions.lock().unwrap().is_empty());
    let deadline = Instant::now() + PTY_DEADLINE;
    loop {
        match receive_before(&events, deadline).expect("Timed-out fixture shell was not killed") {
            TerminalEvent::Exit { .. } => break,
            TerminalEvent::Data { .. } => {}
            _ => panic!("A fixture shell emitted agent metadata"),
        }
    }
}
