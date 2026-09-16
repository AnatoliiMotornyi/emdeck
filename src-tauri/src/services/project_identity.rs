use super::workspace::{err, Result};
use std::path::{Path, PathBuf};

pub(crate) fn canonical_folder(path: &Path) -> Result<PathBuf> {
    let root = path.canonicalize().map_err(err)?;
    if !root.is_dir() {
        return Err("Select a project folder.".into());
    }
    Ok(root)
}

pub(crate) fn same_folder(a: &Path, b: &Path) -> bool {
    a == b || same_file::is_same_file(a, b).unwrap_or(false)
}

// Arguments are paths, never shell commands. Relative paths belong to the
// launching process's working directory, not the existing IDE's directory.
pub(crate) fn launch_folder(args: &[String], cwd: &Path) -> Result<Option<PathBuf>> {
    let arguments = args.iter().skip(1).filter(|arg| !arg.starts_with("-psn_"));
    let arguments: Vec<_> = arguments.collect();
    let path = match arguments.as_slice() {
        [] => return Ok(None),
        [flag, path] if flag.as_str() == "--project" || flag.as_str() == "--" => path.as_str(),
        [path] if !path.starts_with('-') => path.as_str(),
        _ => return Err("Open Emdeck with one folder, or use --project <folder>.".into()),
    };
    if path.is_empty() {
        return Err("Select a project folder.".into());
    }
    canonical_folder(&cwd.join(path)).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn launch_arguments_are_single_paths_relative_to_the_calling_process() {
        let temp = tempfile::tempdir().unwrap();
        let folder = temp.path().join("project with spaces");
        std::fs::create_dir(&folder).unwrap();
        for args in [
            vec!["emdeck", "project with spaces"],
            vec!["emdeck", "--project", "project with spaces"],
            vec!["emdeck", "--", "project with spaces"],
        ] {
            assert_eq!(
                launch_folder(
                    &args.into_iter().map(str::to_string).collect::<Vec<_>>(),
                    temp.path()
                )
                .unwrap(),
                Some(folder.canonicalize().unwrap())
            );
        }
        assert_eq!(
            launch_folder(&["emdeck".into()], temp.path()).unwrap(),
            None
        );
        assert!(launch_folder(&["emdeck".into(), "--project".into()], temp.path()).is_err());
        assert!(launch_folder(&["emdeck".into(), "missing".into()], temp.path()).is_err());
        assert!(launch_folder(&["emdeck".into(), "a".into(), "b".into()], temp.path()).is_err());
    }
}
