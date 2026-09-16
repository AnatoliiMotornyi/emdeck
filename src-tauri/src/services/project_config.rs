use crate::services::workspace::{err, Result};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

const DIR: &str = ".emdeck";
const FILE: &str = "settings.json";
const IGNORE: &str = "*\n";
const MAX_CONFIG_SIZE: u64 = 1024 * 1024;

fn folder(root: &Path) -> PathBuf {
    root.join(DIR)
}

/// Returns `None` when the project has never stored settings.
pub fn read(root: &Path) -> Result<Option<String>> {
    let path = folder(root).join(FILE);
    let Ok(metadata) = fs::metadata(&path) else {
        return Ok(None);
    };
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
    let dir = folder(root);
    fs::create_dir_all(&dir).map_err(err)?;
    seed_ignore(&dir)?;
    persist(&dir.join(FILE), content)
}

/// A `*` pattern ignores every file in the folder including this one, so the
/// directory never reaches `git status` and no tracked file is modified.
fn seed_ignore(dir: &Path) -> Result<()> {
    let path = dir.join(".gitignore");
    if path.exists() {
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
