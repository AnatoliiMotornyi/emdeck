use super::{tls, types::*};
use crate::{error, private, protocol::Action, storage, Result};
use serde::{Deserialize, Serialize};
use std::{
    net::SocketAddr,
    path::{Path, PathBuf},
};

#[derive(Serialize, Deserialize)]
pub struct Credential {
    address: SocketAddr,
    certificate: Vec<u8>,
    device: String,
    token: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedMachine {
    pub credential: String,
    pub address: String,
}
#[derive(Deserialize)]
struct Grant {
    device: String,
    token: String,
}

fn directory(home: &Path) -> Result<PathBuf> {
    std::fs::create_dir_all(home).map_err(error)?;
    private::protect(home)?;
    let directory = home.join("paired-machines");
    std::fs::create_dir_all(&directory).map_err(error)?;
    private::protect(&directory)?;
    Ok(directory)
}
fn path(home: &Path, id: &str) -> Result<PathBuf> {
    let id = uuid::Uuid::parse_str(id).map_err(|_| "Invalid paired machine identity.")?;
    Ok(directory(home)?.join(format!("{id}.json")))
}
pub fn pair(home: &Path, code: &str, name: &str) -> Result<PairedMachine> {
    let invite = Invite::decode(code)?;
    // Prepare private storage before consuming the one-use invitation.
    directory(home)?;
    let response = tls::exchange(
        invite.address,
        &invite.certificate,
        Payload::Pair {
            secret: invite.secret,
            name: name.into(),
        },
    )?;
    let grant: Grant = serde_json::from_value(response).map_err(error)?;
    uuid::Uuid::parse_str(&grant.device).map_err(|_| "Invalid remote device identity.")?;
    if grant.token.len() != 64 {
        return Err("Invalid remote device credential.".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let credential = Credential {
        address: invite.address,
        certificate: invite.certificate,
        device: grant.device,
        token: grant.token,
    };
    storage::write_json(&path(home, &id)?, &credential)
        .map_err(|_| "Pairing succeeded but saving credentials failed. Revoke this device on the host and pair again.")?;
    Ok(PairedMachine {
        credential: id,
        address: invite.address.to_string(),
    })
}
impl Credential {
    pub fn load(home: &Path, id: &str) -> Result<Self> {
        let path = path(home, id)?;
        private::protect(&path)?;
        let value: Self = storage::read_json(&path, 16 * 1024)?;
        validate_address(value.address)?;
        if value.certificate.len() > 4096 || value.token.len() != 64 {
            return Err("Invalid saved pairing. Pair this machine again.".into());
        }
        Ok(value)
    }
    pub fn call(&self, action: Action) -> Result<serde_json::Value> {
        tls::exchange(
            self.address,
            &self.certificate,
            Payload::Call {
                device: self.device.clone(),
                token: self.token.clone(),
                action,
            },
        )
    }
}
pub fn forget(home: &Path, id: &str) -> Result<()> {
    match std::fs::remove_file(path(home, id)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(error(e)),
    }
}
