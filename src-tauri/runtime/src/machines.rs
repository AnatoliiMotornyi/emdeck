//! Durable client-side machine metadata, independent of the GUI/WebView profile.
use crate::{error, private, remote, ssh, storage, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::Path,
    time::{Duration, Instant},
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum Target {
    Local,
    Direct {
        credential: String,
    },
    Ssh {
        host: String,
        port: Option<u16>,
        binary: String,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub target: Target,
    // Reconnection consent stays in the originating WebView, not in shared storage.
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Serialize, Deserialize)]
struct Entry {
    profile: Profile,
    #[serde(default)]
    recovered: bool,
}

#[derive(Serialize, Deserialize)]
struct Registry {
    version: u32,
    entries: Vec<Entry>,
    removed: Vec<String>,
}

impl Default for Registry {
    fn default() -> Self {
        Self {
            version: 1,
            entries: vec![],
            removed: vec![],
        }
    }
}

fn validate(profile: &Profile) -> Result<()> {
    if profile.id.is_empty()
        || profile.id.len() > 128
        || profile.id == "local"
        || profile.id.chars().any(char::is_control)
        || profile.name.trim().is_empty()
        || profile.name.chars().count() > 120
        || profile.name.chars().any(char::is_control)
    {
        return Err("Invalid saved machine name or identity.".into());
    }
    match &profile.target {
        Target::Local => return Err("The local machine is not a remote profile.".into()),
        Target::Direct { credential } => {
            uuid::Uuid::parse_str(credential).map_err(error)?;
        }
        Target::Ssh { host, port, binary } => {
            ssh::args(&ssh::Target {
                host: host.clone(),
                port: *port,
                binary: binary.clone(),
            })?;
        }
    }
    Ok(())
}

fn same_machine(left: &Profile, right: &Profile) -> bool {
    left.id == right.id
        || matches!((&left.target, &right.target),
            (Target::Direct { credential: a }, Target::Direct { credential: b }) if a == b)
}

fn transaction<T>(home: &Path, change: impl FnOnce(&mut Registry) -> Result<T>) -> Result<T> {
    fs::create_dir_all(home).map_err(error)?;
    private::protect(home)?;
    let lock_path = home.join("machines.lock");
    if lock_path.exists() {
        private::protect(&lock_path)?;
    }
    let lock = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(&lock_path)
        .map_err(error)?;
    private::protect(&lock_path)?;
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        match lock.try_lock() {
            Ok(()) => break,
            Err(std::fs::TryLockError::WouldBlock) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(10))
            }
            Err(e) => return Err(error(e)),
        }
    }
    let path = home.join("machines.json");
    let mut registry = match fs::symlink_metadata(&path) {
        Ok(_) => {
            private::protect(&path)?;
            let value: Registry = storage::read_json(&path, 512 * 1024).map_err(|_| {
                "Saved machine settings cannot be read; the file was left untouched."
            })?;
            if value.version != 1 || value.entries.len() > 64 || value.removed.len() > 1024 {
                return Err(
                    "Unsupported saved machine settings; the file was left untouched.".into(),
                );
            }
            for entry in &value.entries {
                validate(&entry.profile)?;
            }
            value
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Registry::default(),
        Err(e) => return Err(error(e)),
    };
    let before = serde_json::to_vec(&registry).map_err(error)?;
    let result = change(&mut registry)?;
    if registry.entries.len() > 64 || registry.removed.len() > 1024 {
        return Err("Saved machine settings are full. No changes were written.".into());
    }
    if before != serde_json::to_vec(&registry).map_err(error)? {
        storage::write_json(&path, &registry)?;
    }
    Ok(result)
}

/// Merge legacy WebView entries and recover pairings without connecting to any host.
pub fn load(home: &Path, legacy: Vec<Profile>) -> Result<Vec<Profile>> {
    if legacy.len() > 64 {
        return Err("Too many legacy machine profiles.".into());
    }
    transaction(home, |registry| {
        let pairings = remote::saved_machines(home)?;
        for mut profile in legacy {
            if validate(&profile).is_err() || registry.removed.contains(&profile.id) {
                continue;
            }
            if let Target::Direct { credential } = &profile.target {
                if !pairings.iter().any(|pair| &pair.credential == credential) {
                    continue;
                }
            }
            profile.enabled = false;
            if let Some(entry) = registry
                .entries
                .iter_mut()
                .find(|entry| same_machine(&entry.profile, &profile))
            {
                if entry.recovered {
                    *entry = Entry {
                        profile,
                        recovered: false,
                    };
                }
            } else {
                registry.entries.push(Entry {
                    profile,
                    recovered: false,
                });
            }
        }
        for pairing in pairings {
            let target = Target::Direct {
                credential: pairing.credential.clone(),
            };
            if !registry
                .entries
                .iter()
                .any(|entry| entry.profile.target == target)
            {
                registry.entries.push(Entry {
                    profile: Profile {
                        id: pairing.credential,
                        name: pairing.address,
                        target,
                        enabled: false,
                    },
                    recovered: true,
                });
            }
        }
        Ok(registry
            .entries
            .iter()
            .map(|entry| entry.profile.clone())
            .collect())
    })
}

pub fn save(home: &Path, mut profile: Profile) -> Result<()> {
    validate(&profile)?;
    profile.enabled = false;
    transaction(home, |registry| {
        if let Target::Direct { credential } = &profile.target {
            remote::Credential::load(home, credential)?;
        }
        registry.removed.retain(|id| id != &profile.id);
        if let Some(entry) = registry
            .entries
            .iter_mut()
            .find(|entry| same_machine(&entry.profile, &profile))
        {
            *entry = Entry {
                profile,
                recovered: false,
            };
        } else {
            registry.entries.push(Entry {
                profile,
                recovered: false,
            });
        }
        Ok(())
    })
}

pub fn remove(home: &Path, id: &str) -> Result<()> {
    if id.is_empty() || id.len() > 128 || id == "local" {
        return Err("Invalid saved machine identity.".into());
    }
    transaction(home, |registry| {
        if let Some(entry) = registry.entries.iter().find(|entry| entry.profile.id == id) {
            if let Target::Direct { credential } = &entry.profile.target {
                remote::forget(home, credential)?;
            }
        }
        registry.entries.retain(|entry| entry.profile.id != id);
        if !registry.removed.iter().any(|removed| removed == id) {
            registry.removed.push(id.to_owned());
        }
        Ok(())
    })
}

#[cfg(test)]
#[path = "machines_tests.rs"]
mod tests;
