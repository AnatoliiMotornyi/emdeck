use crate::services::project_identity::{canonical_folder, same_folder};
use crate::services::workspace::{err, Result};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{atomic::AtomicU64, Mutex},
};
#[derive(Default)]
pub(crate) struct Projects {
    pub(crate) roots: Mutex<HashMap<String, HashSet<PathBuf>>>,
    pub(crate) active: Mutex<HashMap<String, PathBuf>>,
    pub(crate) initial: Mutex<HashMap<String, String>>,
    pub(crate) next_window: AtomicU64,
    // Serializes lookup + focus/create/replace without holding `active` across
    // native window operations. Window events must not take this lock.
    pub(crate) routing: Mutex<()>,
    pub(crate) last_focused: Mutex<Option<String>>,
}
impl Projects {
    pub(crate) fn authorize(&self, window: &str, root: PathBuf) -> Result<Option<String>> {
        if let Some(owner) = self.activate(window, &root)? {
            return Ok(Some(owner));
        }
        self.roots
            .lock()
            .map_err(err)?
            .entry(window.into())
            .or_default()
            .insert(root);
        Ok(None)
    }
    pub(crate) fn activate(&self, window: &str, root: &Path) -> Result<Option<String>> {
        let mut active = self.active.lock().map_err(err)?;
        let root = canonical_folder(root)?;
        if let Some((owner, _)) = active
            .iter()
            .find(|(label, path)| label.as_str() != window && same_folder(path, &root))
        {
            return Ok(Some(owner.clone()));
        }
        active.insert(window.into(), root);
        Ok(None)
    }
    pub(crate) fn owner(&self, root: &Path) -> Result<Option<String>> {
        Ok(self
            .active
            .lock()
            .map_err(err)?
            .iter()
            .find(|(_, path)| same_folder(path, root))
            .map(|(label, _)| label.clone()))
    }
    pub(crate) fn focused(&self, label: &str) {
        if let Ok(mut current) = self.last_focused.lock() {
            *current = Some(label.into());
        }
    }
    pub(crate) fn root(&self, window: &str, root: &str) -> Result<PathBuf> {
        let path = PathBuf::from(root).canonicalize().map_err(err)?;
        if !self
            .roots
            .lock()
            .map_err(err)?
            .get(window)
            .is_some_and(|roots| roots.contains(&path))
        {
            return Err("Open this project before accessing it.".into());
        }
        Ok(path)
    }
    pub(crate) fn forget(&self, window: &str) {
        if let Ok(mut current) = self.last_focused.lock() {
            if current.as_deref() == Some(window) {
                *current = None;
            }
        }
        if let Ok(mut active) = self.active.lock() {
            active.remove(window);
        }
        if let Ok(mut roots) = self.roots.lock() {
            roots.remove(window);
        }
        if let Ok(mut initial) = self.initial.lock() {
            initial.remove(window);
        }
    }
}
#[cfg(test)]
mod window_tests {
    use super::*;
    #[test]
    fn project_access_and_cleanup_are_scoped_to_the_opening_window() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let a = first.path().canonicalize().unwrap();
        let b = second.path().canonicalize().unwrap();
        let projects = Projects::default();
        projects.authorize("main", a.clone()).unwrap();
        projects.authorize("workspace-1", b.clone()).unwrap();
        assert!(projects.root("main", &a.to_string_lossy()).is_ok());
        assert!(projects.root("main", &b.to_string_lossy()).is_err());
        assert!(projects.root("workspace-1", &a.to_string_lossy()).is_err());
        assert_eq!(projects.active.lock().unwrap().get("main"), Some(&a));
        assert_eq!(
            projects.authorize("main", b.clone()).unwrap(),
            Some("workspace-1".into())
        );
        assert_eq!(projects.active.lock().unwrap().get("main"), Some(&a));
        projects.forget("workspace-1");
        assert_eq!(projects.authorize("main", b.clone()).unwrap(), None);
        assert_eq!(projects.active.lock().unwrap().get("main"), Some(&b));
        projects.forget("main");
        assert!(!projects.active.lock().unwrap().contains_key("main"));
        assert!(projects.root("main", &a.to_string_lossy()).is_err());
        assert!(projects.root("workspace-1", &b.to_string_lossy()).is_err());
    }

    #[test]
    fn aliases_and_concurrent_requests_claim_a_folder_once() {
        let folder = tempfile::tempdir().unwrap();
        let projects = std::sync::Arc::new(Projects::default());
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(8));
        let root = folder.path().canonicalize().unwrap();
        let threads: Vec<_> = (0..8)
            .map(|i| {
                let projects = projects.clone();
                let barrier = barrier.clone();
                let alias = root.join(".");
                std::thread::spawn(move || {
                    barrier.wait();
                    projects.activate(&format!("window-{i}"), &alias).unwrap()
                })
            })
            .collect();
        let results: Vec<_> = threads
            .into_iter()
            .map(|thread| thread.join().unwrap())
            .collect();
        assert_eq!(results.iter().filter(|owner| owner.is_none()).count(), 1);
        let owner = projects.owner(&root).unwrap().unwrap();
        assert!(results.iter().flatten().all(|label| label == &owner));
        assert_eq!(projects.active.lock().unwrap().len(), 1);
        projects.focused(&owner);
        projects.forget(&owner);
        assert!(projects.last_focused.lock().unwrap().is_none());
        assert_eq!(projects.activate("reopened", &root).unwrap(), None);
    }

    #[cfg(windows)]
    #[test]
    fn windows_folder_case_and_extended_paths_share_one_owner() {
        let folder = tempfile::tempdir().unwrap();
        let projects = Projects::default();
        projects.activate("main", folder.path()).unwrap();
        let upper = PathBuf::from(folder.path().to_string_lossy().to_uppercase());
        assert_eq!(
            projects.activate("other", &upper).unwrap(),
            Some("main".into())
        );
        assert!(projects.root("other", &upper.to_string_lossy()).is_err());
        assert_eq!(
            projects
                .owner(&folder.path().canonicalize().unwrap())
                .unwrap(),
            Some("main".into())
        );
    }

    #[cfg(unix)]
    #[test]
    fn directory_symlinks_share_the_owner_but_distinct_folders_do_not() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("project");
        let alias = temp.path().join("alias");
        let other = temp.path().join("other");
        std::fs::create_dir(&root).unwrap();
        std::fs::create_dir(&other).unwrap();
        std::os::unix::fs::symlink(&root, &alias).unwrap();
        let projects = Projects::default();
        projects.activate("main", &root).unwrap();
        assert_eq!(
            projects.activate("alias", &alias).unwrap(),
            Some("main".into())
        );
        assert_eq!(projects.activate("other", &other).unwrap(), None);
    }
}
