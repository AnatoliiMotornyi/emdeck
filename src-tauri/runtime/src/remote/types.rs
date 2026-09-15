use crate::{error, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::net::{IpAddr, SocketAddr};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "operation", rename_all = "lowercase", deny_unknown_fields)]
pub enum Management {
    Status,
    Enable { address: String, port: u16 },
    Disable,
    Invite,
    Revoke { id: String },
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub enabled: bool,
    pub address: Option<String>,
    pub port: Option<u16>,
    pub error: Option<String>,
    pub devices: Vec<DeviceInfo>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub paired_at: u64,
}

#[derive(Clone, Serialize, Deserialize)]
pub(super) struct Device {
    pub info: DeviceInfo,
    pub digest: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Invite {
    pub version: u32,
    pub address: SocketAddr,
    pub certificate: Vec<u8>,
    pub secret: String,
    pub expires: u64,
}
impl Invite {
    pub fn encode(&self) -> Result<String> {
        Ok(format!(
            "emdeck-pair:{}",
            URL_SAFE_NO_PAD.encode(serde_json::to_vec(self).map_err(error)?)
        ))
    }
    pub fn decode(value: &str) -> Result<Self> {
        if value.len() > 12_000 {
            return Err("Pairing code is too large.".into());
        }
        let bytes = URL_SAFE_NO_PAD
            .decode(
                value
                    .trim()
                    .strip_prefix("emdeck-pair:")
                    .ok_or("Use a pairing code created on the other computer.")?,
            )
            .map_err(|_| "Invalid pairing code.")?;
        let invite: Self = serde_json::from_slice(&bytes).map_err(|_| "Invalid pairing code.")?;
        validate_address(invite.address)?;
        if invite.version != 1 || invite.certificate.len() > 4096 || invite.secret.len() != 64 {
            return Err("Unsupported pairing code.".into());
        }
        if invite.expires <= crate::terminal::now() {
            return Err("Pairing code expired. Create a new code on the other computer.".into());
        }
        Ok(invite)
    }
}

pub(super) fn validate_address(address: SocketAddr) -> Result<()> {
    let tailscale = match address.ip() {
        IpAddr::V4(ip) => {
            let b = ip.octets();
            b[0] == 100 && (64..=127).contains(&b[1])
        }
        IpAddr::V6(_) => false,
    };
    if !tailscale || address.port() == 0 {
        return Err("Enter this computer's Tailscale IPv4 address (100.64.0.0–100.127.255.255) and a nonzero port.".into());
    }
    Ok(())
}
pub(super) fn secret() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}
pub(super) fn digest(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
pub(super) fn matches(value: &str, expected: &str) -> bool {
    let actual = digest(value);
    let mut difference = actual.len() ^ expected.len();
    for (a, b) in actual.bytes().zip(expected.bytes()) {
        difference |= (a ^ b) as usize;
    }
    difference == 0
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "operation", rename_all = "lowercase", deny_unknown_fields)]
pub(super) enum Payload {
    Pair {
        secret: String,
        name: String,
    },
    Call {
        device: String,
        token: String,
        action: crate::protocol::Action,
    },
}
#[derive(Serialize, Deserialize)]
pub(super) struct Request {
    pub version: u32,
    pub id: String,
    pub payload: Payload,
}
