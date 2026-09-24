use crate::services::workspace::{err, resolve, Result};
use std::{fs, io::Write, path::Path};

const DIR: &str = ".emdeck";
const FILE: &str = "settings.json";
const IGNORE: &str = "*\n";
const MAX_CONFIG_SIZE: u64 = 1024 * 1024;

// A cloned project can commit `.emdeck` or its files as symlinks, so every path
// is resolved through the same containment check as ordinary project files.
fn file() -> String {
    format!("{DIR}/{FILE}")
}

/// Returns `None` when the project has never stored settings.
pub fn read(root: &Path) -> Result<Option<String>> {
    if !root.join(DIR).join(FILE).exists() {
        return Ok(None);
    }
    let path = resolve(root, &file(), false)?;
    let metadata = fs::metadata(&path).map_err(err)?;
    if metadata.len() > MAX_CONFIG_SIZE {
        return Err("Project configuration exceeds the 1 MB limit.".into());
    }
    let bytes = fs::read(&path).map_err(err)?;
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| "Project configuration is not UTF-8 text.".into())
}

pub fn write(root: &Path, content: &str) -> Result<()> {
    if content.len() as u64 > MAX_CONFIG_SIZE {
        return Err("Project configuration exceeds the 1 MB limit.".into());
    }
    let dir = resolve(root, DIR, true)?;
    fs::create_dir_all(&dir).map_err(err)?;
    let path = resolve(root, &file(), true)?;
    seed_ignore(&dir)?;
    persist(&path, content)
}

/// A `*` pattern ignores every file in the folder including this one, so the
/// directory never reaches `git status` and no tracked file is modified.
fn seed_ignore(dir: &Path) -> Result<()> {
    let path = dir.join(".gitignore");
    // symlink_metadata sees a dangling link too, so the write never follows one.
    if fs::symlink_metadata(&path).is_ok() {
        return Ok(());
    }
    fs::write(&path, IGNORE).map_err(err)
}

fn persist(path: &Path, content: &str) -> Result<()> {
    let parent = path.parent().ok_or("Invalid parent")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(err)?;
    temp.write_all(content.as_bytes()).map_err(err)?;
    temp.as_file().sync_all().map_err(err)?;
    for attempt in 0..6 {
        match temp.persist(path) {
            Ok(_) => return Ok(()),
            // Windows briefly denies replacement while a scanner holds the file.
            Err(failure) if cfg!(windows) && attempt < 5 => {
                temp = failure.file;
                std::thread::sleep(std::time::Duration::from_millis(30));
            }
            Err(failure) => return Err(err(failure)),
        }
    }
    Err("Could not save the project configuration.".into())
}

#[cfg(test)]
#[path = "project_config_tests.rs"]
mod tests;
