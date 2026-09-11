use crate::services::workspace::{err, Result};
use serde::{de::DeserializeOwned, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const METADATA: &str = "shelf.json";
const MAX_METADATA: u64 = 4 * 1024 * 1024;

// Tests run in parallel threads inside one process, so an environment variable
// cannot isolate them. A thread-local override can, and it stays out of the
// shipped binary.
#[cfg(test)]
thread_local! {
    static TEST_HOME: std::cell::RefCell<Option<PathBuf>> =
        const { std::cell::RefCell::new(None) };
}

#[cfg(test)]
pub fn set_test_home(path: &Path) {
    TEST_HOME.with(|home| *home.borrow_mut() = Some(path.to_owned()));
}

/// Mirrors the session storage layout so both per-user stores live side by side.
pub fn home() -> Result<PathBuf> {
    #[cfg(test)]
    if let Some(path) = TEST_HOME.with(|home| home.borrow().clone()) {
        return Ok(path);
    }
    #[cfg(windows)]
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .map(|p| p.join("Emdeck"));
    #[cfg(not(windows))]
    let base = std::env::var_os("XDG_STATE_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|p| PathBuf::from(p).join(".local/state")))
        .map(|p| p.join("emdeck"));
    base.map(|p| p.join("shelves"))
        .ok_or_else(|| "Cannot locate per-user shelf storage.".to_owned())
}

pub fn shelf_dir(id: &str) -> Result<PathBuf> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("Unknown shelf.".into());
    }
    Ok(home()?.join(id))
}

/// Nanosecond ids collide only if two shelves are created within the same tick;
/// the suffix loop makes that impossible rather than merely unlikely.
pub fn new_shelf_dir() -> Result<(String, PathBuf)> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(err)?
        .as_nanos();
    let root = home()?;
    fs::create_dir_all(&root).map_err(err)?;
    for suffix in 0..64 {
        let id = format!("{stamp:x}-{suffix}");
        let path = root.join(&id);
        match fs::create_dir(&path) {
            Ok(()) => return Ok((id, path)),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(err(e)),
        }
    }
    Err("Could not allocate a shelf directory.".into())
}

fn blob_path(dir: &Path, name: &str) -> Result<PathBuf> {
    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
    {
        return Err("Invalid shelf blob name.".into());
    }
    Ok(dir.join("blobs").join(name))
}

/// The same temp-file-then-rename discipline the workspace saver uses, so a
/// torn write can never leave a half-written snapshot behind.
fn persist(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().ok_or("Invalid parent")?;
    fs::create_dir_all(parent).map_err(err)?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(err)?;
    temp.write_all(bytes).map_err(err)?;
    temp.as_file().sync_all().map_err(err)?;
    temp.persist(path).map_err(err)?;
    Ok(())
}

pub fn write_blob(dir: &Path, name: &str, bytes: &[u8]) -> Result<()> {
    persist(&blob_path(dir, name)?, bytes)
}

pub fn read_blob(dir: &Path, name: &str) -> Result<Vec<u8>> {
    fs::read(blob_path(dir, name)?).map_err(err)
}

pub fn write_json<T: Serialize>(dir: &Path, value: &T) -> Result<()> {
    let bytes = serde_json::to_vec_pretty(value).map_err(err)?;
    persist(&dir.join(METADATA), &bytes)
}

pub fn read_json<T: DeserializeOwned>(dir: &Path) -> Result<T> {
    let path = dir.join(METADATA);
    if fs::metadata(&path).map_err(err)?.len() > MAX_METADATA {
        return Err("Shelf metadata is too large.".into());
    }
    serde_json::from_slice(&fs::read(&path).map_err(err)?).map_err(err)
}

pub fn list_dirs() -> Result<Vec<PathBuf>> {
    let root = home()?;
    if !root.exists() {
        return Ok(vec![]);
    }
    let mut found = vec![];
    for entry in fs::read_dir(&root).map_err(err)? {
        let entry = entry.map_err(err)?;
        if entry.file_type().map_err(err)?.is_dir() {
            found.push(entry.path());
        }
    }
    Ok(found)
}

pub fn remove(dir: &Path) -> Result<()> {
    // Verify the prefix before a recursive removal, per the contributor rules.
    let root = home()?;
    if !dir.starts_with(&root) || dir == root {
        return Err("Refusing to remove a path outside the shelf store.".into());
    }
    fs::remove_dir_all(dir).map_err(err)
}
