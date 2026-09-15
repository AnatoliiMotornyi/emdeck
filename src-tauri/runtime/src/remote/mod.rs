//! Opt-in TLS transport for devices connected through Tailscale.
mod client;
mod host;
mod tls;
mod types;

pub use client::{forget, pair, Credential, PairedMachine};
pub use host::Host;
pub use types::{Management, Status};

#[cfg(test)]
mod tests;
