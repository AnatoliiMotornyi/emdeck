pub mod store;

#[cfg(test)]
mod tests;

use crate::services::git;
use crate::services::workspace::{err, resolve, Result};
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ShelfEntry {
    pub path: String,
    pub original_path: Option<String>,
    /// "modified" | "added" | "deleted"
    pub kind: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Shelf {
    pub id: String,
    pub name: String,
    pub root: String,
    pub created_at: String,
    pub entries: Vec<ShelfEntry>,
}

fn timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}

/// `git show` is the only source of a file's committed bytes, so reverting a
/// modification is impossible without it. Reading is all we do here.
fn baseline(root: &Path, path: &str) -> Result<Option<Vec<u8>>> {
    let output = git::command(root, &["show", &format!("HEAD:{path}")])?;
    Ok(output.status.success().then_some(output.stdout))
}

pub fn create(root: &Path, name: &str, paths: &[String]) -> Result<Shelf> {
    if paths.is_empty() {
        return Err("Select at least one change to shelve.".into());
    }
    git::run(root, &["rev-parse", "--show-toplevel"])?;

    let mut entries = vec![];
    let mut blobs: Vec<(String, Vec<u8>)> = vec![];
    for (index, path) in paths.iter().enumerate() {
        let absolute = resolve(root, path, true)?;
        let base = baseline(root, path)?;
        let current = std::fs::read(&absolute).ok();
        let kind = match (&base, &current) {
            (Some(_), Some(_)) => "modified",
            (None, Some(_)) => "added",
            (Some(_), None) => "deleted",
            (None, None) => return Err(format!("{path} has nothing to shelve.")),
        };
        if let Some(bytes) = &current {
            blobs.push((format!("{index}.saved"), bytes.clone()));
        }
        if let Some(bytes) = &base {
            blobs.push((format!("{index}.base"), bytes.clone()));
        }
        entries.push(ShelfEntry {
            path: path.clone(),
            original_path: None,
            kind: kind.into(),
        });
    }

    // Metadata and blobs land before the working tree changes: a crash here
    // must never destroy work that exists nowhere else.
    let (id, dir) = store::new_shelf_dir()?;
    for (blob, bytes) in &blobs {
        store::write_blob(&dir, blob, bytes)?;
    }
    let shelf = Shelf {
        id,
        name: if name.trim().is_empty() {
            format!("Shelf {}", timestamp())
        } else {
            name.trim().to_owned()
        },
        root: root.to_string_lossy().into_owned(),
        created_at: timestamp(),
        entries,
    };
    store::write_json(&dir, &shelf)?;

    for (index, entry) in shelf.entries.iter().enumerate() {
        let absolute = resolve(root, &entry.path, true)?;
        if entry.kind == "added" {
            std::fs::remove_file(&absolute).map_err(err)?;
        } else {
            let base = store::read_blob(&dir, &format!("{index}.base"))?;
            if let Some(parent) = absolute.parent() {
                std::fs::create_dir_all(parent).map_err(err)?;
            }
            std::fs::write(&absolute, base).map_err(err)?;
        }
    }

    // Restoring the file is not enough: a staged entry would still report
    // "changes to be committed" and the tree would not be clean.
    let mut reset: Vec<&str> = vec!["reset", "-q", "--"];
    reset.extend(shelf.entries.iter().map(|entry| entry.path.as_str()));
    git::run(root, &reset)?;

    Ok(shelf)
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ShelfConflict {
    pub path: String,
    pub reason: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UnshelveReport {
    pub applied: Vec<String>,
    pub conflicts: Vec<ShelfConflict>,
}

fn belongs(shelf: &Shelf, root: &Path) -> bool {
    Path::new(&shelf.root) == root
}

/// `created_at` is milliseconds and two shelves made back to back can share
/// one, so ordering keys off the nanosecond stamp the id already carries.
fn ordering_key(shelf: &Shelf) -> u128 {
    shelf
        .id
        .split('-')
        .next()
        .and_then(|stamp| u128::from_str_radix(stamp, 16).ok())
        .unwrap_or_default()
}

pub fn list(root: &Path) -> Result<Vec<Shelf>> {
    let mut found: Vec<Shelf> = store::list_dirs()?
        .iter()
        .filter_map(|dir| store::read_json::<Shelf>(dir).ok())
        .filter(|shelf| belongs(shelf, root))
        .collect();
    found.sort_by_key(|shelf| std::cmp::Reverse(ordering_key(shelf)));
    Ok(found)
}

fn load(root: &Path, id: &str) -> Result<(Shelf, std::path::PathBuf)> {
    let dir = store::shelf_dir(id)?;
    let shelf: Shelf = store::read_json(&dir)?;
    if !belongs(&shelf, root) {
        return Err("That shelf belongs to another project.".into());
    }
    Ok((shelf, dir))
}

pub fn apply(root: &Path, id: &str, force: bool) -> Result<UnshelveReport> {
    let (shelf, dir) = load(root, id)?;
    let mut applied = vec![];
    let mut conflicts = vec![];
    for (index, entry) in shelf.entries.iter().enumerate() {
        // Re-validate: the metadata is a file on disk and could have been edited.
        let absolute = resolve(root, &entry.path, true)?;
        let current = std::fs::read(&absolute).ok();
        let expected = store::read_blob(&dir, &format!("{index}.base")).ok();
        let matches = match entry.kind.as_str() {
            "added" => current.is_none(),
            _ => current == expected,
        };
        if !matches && !force {
            conflicts.push(ShelfConflict {
                path: entry.path.clone(),
                reason: "The file changed after it was shelved.".into(),
            });
            continue;
        }
        if entry.kind == "deleted" {
            if absolute.exists() {
                std::fs::remove_file(&absolute).map_err(err)?;
            }
        } else {
            let saved = store::read_blob(&dir, &format!("{index}.saved"))?;
            if let Some(parent) = absolute.parent() {
                std::fs::create_dir_all(parent).map_err(err)?;
            }
            std::fs::write(&absolute, saved).map_err(err)?;
        }
        applied.push(entry.path.clone());
    }
    // Keep anything that did not land, so nothing is silently lost.
    if conflicts.is_empty() {
        store::remove(&dir)?;
    }
    Ok(UnshelveReport { applied, conflicts })
}

pub fn delete(root: &Path, id: &str) -> Result<()> {
    let (_, dir) = load(root, id)?;
    store::remove(&dir)
}
