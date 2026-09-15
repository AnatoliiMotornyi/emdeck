use crate::services::{git, git_branches, workspace};
use serde::{Deserialize, Serialize};
use std::{
    collections::{hash_map::DefaultHasher, BTreeMap, BTreeSet},
    fs,
    hash::{Hash, Hasher},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};
use workspace::{err, Result};

#[derive(Deserialize)]
pub struct Request {
    pub paths: Vec<String>,
    pub revision: String,
}

#[derive(Serialize, Debug)]
pub struct File {
    pub path: String,
    pub effect: &'static str,
}

#[derive(Serialize, Debug)]
pub struct Plan {
    pub paths: Vec<String>,
    pub revision: String,
    pub files: Vec<File>,
}

struct Prepared {
    plan: Plan,
    head: Option<String>,
}

// Check every ancestor, including absent parents of a deleted file. Git must
// never traverse a link or receive a directory path that expands our selection.
fn file_path(root: &Path, relative: &str) -> Result<PathBuf> {
    if relative.is_empty()
        || relative.contains('\0')
        || relative.split('/').any(|part| {
            part.is_empty() || part == "." || part == ".." || part.eq_ignore_ascii_case(".git")
        })
        || Path::new(relative)
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err("Invalid Git file path.".into());
    }
    #[cfg(windows)]
    if relative.contains(['\\', ':']) {
        return Err("Invalid Git file path.".into());
    }
    let mut path = root.to_path_buf();
    for part in Path::new(relative).components() {
        path.push(part);
        match fs::symlink_metadata(&path) {
            Ok(metadata) => {
                let linked = metadata.file_type().is_symlink();
                #[cfg(windows)]
                let linked = {
                    use std::os::windows::fs::MetadataExt;
                    linked || metadata.file_attributes() & 0x400 != 0
                };
                if linked || (!metadata.is_file() && !metadata.is_dir()) {
                    return Err(format!(
                        "Use Git in a terminal to discard linked files: {relative}"
                    ));
                }
                if path
                    .canonicalize()
                    .map_err(err)?
                    .strip_prefix(root)
                    .is_err()
                {
                    return Err("Path is outside the open project.".into());
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(err(error)),
        }
    }
    if path.is_dir() {
        return Err(format!(
            "Use Git in a terminal to discard directories or submodules: {relative}"
        ));
    }
    Ok(path)
}

fn entries(raw: &str) -> Result<BTreeMap<&str, &str>> {
    raw.split('\0')
        .filter(|record| !record.is_empty())
        .map(|record| {
            let (header, path) = record.split_once('\t').ok_or("Invalid Git file entry.")?;
            let mode = header
                .split_whitespace()
                .next()
                .ok_or("Missing Git file mode.")?;
            Ok((path, mode))
        })
        .collect()
}

fn fingerprint(path: &Path, hash: &mut DefaultHasher) -> Result<()> {
    match fs::File::open(path) {
        Ok(mut file) => {
            let metadata = file.metadata().map_err(err)?;
            true.hash(hash);
            metadata.len().hash(hash);
            metadata.permissions().readonly().hash(hash);
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                metadata.permissions().mode().hash(hash);
            }
            metadata.modified().map_err(err)?.hash(hash);
            let mut buffer = [0; 65536];
            loop {
                let count = file.read(&mut buffer).map_err(err)?;
                if count == 0 {
                    break;
                }
                hash.write(&buffer[..count]);
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false.hash(hash),
        Err(error) => return Err(err(error)),
    }
    Ok(())
}

fn prepare(root: &Path, paths: &[String]) -> Result<Prepared> {
    if paths.is_empty() || paths.len() > 10000 {
        return Err("Select between 1 and 10,000 changed files.".into());
    }
    let top = git::run(root, &["rev-parse", "--show-toplevel"])?;
    if Path::new(top.trim()).canonicalize().map_err(err)? != root {
        return Err("Open the repository root to discard changes.".into());
    }
    if git_branches::operation(root).is_some() {
        return Err("Finish or abort the current Git operation before discarding changes.".into());
    }
    if git::run(root, &["config", "--bool", "core.sparseCheckout"])
        .is_ok_and(|v| v.trim() == "true")
    {
        return Err("Use Git in a terminal to discard changes in a sparse checkout.".into());
    }
    let head = match git::run(root, &["rev-parse", "--verify", "HEAD"]) {
        Ok(value) => Some(value.trim().to_owned()),
        Err(error) => {
            let branch = git::run(root, &["symbolic-ref", "HEAD"])?;
            // Only a genuinely unborn branch may use the empty-tree behavior.
            let exists = git::command(root, &["show-ref", "--verify", "--quiet", branch.trim()])?;
            if exists.status.code() != Some(1) {
                return Err(error);
            }
            None
        }
    };
    let status_output = git::command(
        root,
        &["status", "--porcelain=v1", "-z", "--untracked-files=normal"],
    )?;
    if !status_output.status.success() {
        return Err(String::from_utf8_lossy(&status_output.stderr).into());
    }
    let status = String::from_utf8(status_output.stdout)
        .map_err(|_| "Use Git in a terminal for non-UTF-8 paths.")?;
    let changes = git::parse_status(status.as_bytes());
    if changes.iter().any(|change| change.conflict) {
        return Err("Resolve merge conflicts before discarding changes.".into());
    }
    let index = git::run(root, &["ls-files", "--stage", "-z"])?;
    let tree = match &head {
        Some(head) => git::run(root, &["ls-tree", "-r", "-z", head])?,
        None => String::new(),
    };
    let index_entries = entries(&index)?;
    let tree_entries = entries(&tree)?;
    let mut selected = BTreeSet::new();
    let mut requested = BTreeSet::new();
    for path in paths {
        if !requested.insert(path) {
            return Err("Duplicate discard selection.".into());
        }
        let change = changes
            .iter()
            .find(|change| change.path == *path && change.index != "?")
            .ok_or("The selection changed. Refresh Source Control and try again.")?;
        selected.insert(path.clone());
        // Undo both ends of a rename, but never restore the source of a copy.
        if change.index == "R" || change.working == "R" {
            if let Some(original) = &change.original_path {
                selected.insert(original.clone());
            }
        }
    }
    let mut hash = DefaultHasher::new();
    head.hash(&mut hash);
    git::run(root, &["symbolic-ref", "HEAD"])
        .unwrap_or_default()
        .hash(&mut hash);
    status.hash(&mut hash);
    index.hash(&mut hash);
    let mut files = vec![];
    for path in selected {
        let absolute = file_path(root, &path)?;
        // A staged deletion can have a new, even ignored, file at the same path.
        // It is no longer in the index and must not be overwritten by restore.
        if tree_entries.contains_key(path.as_str())
            && !index_entries.contains_key(path.as_str())
            && absolute.exists()
        {
            return Err(format!(
                "An untracked file occupies {path}. Move it before discarding changes."
            ));
        }
        if changes.iter().any(|change| {
            change.index == "?"
                && (path == change.path
                    || path.starts_with(&format!("{}/", change.path.trim_end_matches('/'))))
        }) {
            return Err(format!(
                "An untracked file occupies {path}. Move it before discarding changes."
            ));
        }
        let modes = [
            index_entries.get(path.as_str()),
            tree_entries.get(path.as_str()),
        ];
        if modes.iter().all(Option::is_none)
            || modes
                .into_iter()
                .flatten()
                .any(|mode| !["100644", "100755"].contains(mode))
        {
            return Err(format!(
                "Use Git in a terminal to discard linked files or submodules: {path}"
            ));
        }
        path.hash(&mut hash);
        fingerprint(&absolute, &mut hash)?;
        files.push(File {
            effect: if tree_entries.contains_key(path.as_str()) {
                "restore"
            } else {
                "remove"
            },
            path,
        });
    }
    Ok(Prepared {
        head,
        plan: Plan {
            paths: paths.to_vec(),
            files,
            revision: format!("{:x}", hash.finish()),
        },
    })
}

pub fn preview(root: &Path, paths: &[String]) -> Result<Plan> {
    let _operation = git_branches::acquire(root)?;
    Ok(prepare(root, paths)?.plan)
}

pub fn apply(root: &Path, request: &Request) -> Result<()> {
    let _operation = git_branches::acquire(root)?;
    let prepared = prepare(root, &request.paths)?;
    if prepared.plan.revision != request.revision {
        return Err("Files or Git state changed while the confirmation was open. Review the changes and try again.".into());
    }
    // NUL-delimited literal paths also support spaces, newlines, glob characters
    // and selections larger than Windows' command-line limit. Never use git clean.
    let mut pathspec = tempfile::NamedTempFile::new().map_err(err)?;
    for file in &prepared.plan.files {
        pathspec.write_all(file.path.as_bytes()).map_err(err)?;
        pathspec.write_all(&[0]).map_err(err)?;
    }
    pathspec.flush().map_err(err)?;
    let argument = format!("--pathspec-from-file={}", pathspec.path().to_string_lossy());
    if let Some(head) = prepared.head {
        git::run(
            root,
            &[
                "--literal-pathspecs",
                "restore",
                "--source",
                &head,
                "--staged",
                "--worktree",
                "--no-recurse-submodules",
                &argument,
                "--pathspec-file-nul",
            ],
        )?;
    } else {
        git::run(
            root,
            &[
                "--literal-pathspecs",
                "rm",
                "--force",
                &argument,
                "--pathspec-file-nul",
            ],
        )?;
    }
    Ok(())
}

#[cfg(test)]
#[path = "git_discard_tests.rs"]
mod tests;
