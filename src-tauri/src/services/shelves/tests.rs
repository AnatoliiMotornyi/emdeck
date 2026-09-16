use super::store;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, PartialEq, Debug)]
struct Sample {
    name: String,
}

/// Every test must point the store at its own temp directory. The suite runs
/// in one process across many threads, so the override is thread-local; an
/// environment variable would leak between tests running side by side.
fn isolate() -> tempfile::TempDir {
    let temp = tempfile::tempdir().unwrap();
    store::set_test_home(temp.path());
    temp
}

#[test]
fn new_shelf_dirs_are_unique_and_round_trip_json_and_blobs() {
    let _temp = isolate();
    let (first, dir) = store::new_shelf_dir().unwrap();
    let (second, _) = store::new_shelf_dir().unwrap();
    assert_ne!(first, second, "ids must not collide");

    store::write_json(
        &dir,
        &Sample {
            name: "shelf".into(),
        },
    )
    .unwrap();
    let loaded: Sample = store::read_json(&dir).unwrap();
    assert_eq!(
        loaded,
        Sample {
            name: "shelf".into()
        }
    );

    store::write_blob(&dir, "0.saved", b"body\n").unwrap();
    assert_eq!(store::read_blob(&dir, "0.saved").unwrap(), b"body\n");

    assert_eq!(store::list_dirs().unwrap().len(), 2);
    store::remove(&dir).unwrap();
    assert_eq!(store::list_dirs().unwrap().len(), 1);
}

#[test]
fn blob_names_may_not_escape_the_shelf_directory() {
    let _temp = isolate();
    let (_, dir) = store::new_shelf_dir().unwrap();
    assert!(store::write_blob(&dir, "../escape", b"x").is_err());
    assert!(store::read_blob(&dir, "../../etc/passwd").is_err());
}

#[test]
fn a_shelf_id_may_not_be_a_path() {
    let _temp = isolate();
    assert!(store::shelf_dir("").is_err());
    assert!(store::shelf_dir("../elsewhere").is_err());
    assert!(store::shelf_dir("nested/id").is_err());
    assert!(store::shelf_dir("18f3c2a1-0").is_ok());
}

fn repo() -> (tempfile::TempDir, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    // A path with spaces is deliberate: argv handling must survive it.
    let root = temp.path().join("project with spaces");
    std::fs::create_dir(&root).unwrap();
    let root = root.canonicalize().unwrap();
    let git = |args: &[&str]| crate::services::git::run(&root, args).unwrap();
    git(&["init", "-b", "main"]);
    git(&["config", "user.name", "Emdeck Test"]);
    git(&["config", "user.email", "test@example.test"]);
    git(&["config", "commit.gpgsign", "false"]);
    std::fs::write(root.join("tracked.txt"), "base\n").unwrap();
    std::fs::write(root.join("removed.txt"), "gone\n").unwrap();
    git(&["add", "."]);
    git(&["commit", "-m", "Initial"]);
    (temp, root)
}

fn status(root: &Path) -> String {
    crate::services::git::run(root, &["status", "--porcelain"]).unwrap()
}

#[test]
fn shelving_saves_the_edit_and_restores_the_committed_file() {
    let _store = isolate();
    let (_temp, root) = repo();
    std::fs::write(root.join("tracked.txt"), "edited\n").unwrap();

    let shelf = super::create(&root, "work", &["tracked.txt".to_string()]).unwrap();

    assert_eq!(shelf.entries.len(), 1);
    assert_eq!(shelf.entries[0].kind, "modified");
    assert_eq!(
        std::fs::read_to_string(root.join("tracked.txt")).unwrap(),
        "base\n",
        "the working tree must return to the committed content"
    );
    let dir = store::shelf_dir(&shelf.id).unwrap();
    assert_eq!(store::read_blob(&dir, "0.saved").unwrap(), b"edited\n");
    assert_eq!(store::read_blob(&dir, "0.base").unwrap(), b"base\n");
    assert_eq!(status(&root), "", "the tree must be clean after shelving");
}

#[test]
fn shelving_removes_an_untracked_file_and_recreates_a_deleted_one() {
    let _store = isolate();
    let (_temp, root) = repo();
    std::fs::write(root.join("fresh.txt"), "new\n").unwrap();
    std::fs::remove_file(root.join("removed.txt")).unwrap();

    let shelf = super::create(
        &root,
        "mixed",
        &["fresh.txt".to_string(), "removed.txt".to_string()],
    )
    .unwrap();

    let kinds: Vec<&str> = shelf.entries.iter().map(|e| e.kind.as_str()).collect();
    assert_eq!(kinds, vec!["added", "deleted"]);
    assert!(!root.join("fresh.txt").exists(), "added files are removed");
    assert_eq!(
        std::fs::read_to_string(root.join("removed.txt")).unwrap(),
        "gone\n",
        "deleted files come back"
    );
    assert_eq!(status(&root), "");
}

#[test]
fn shelving_clears_a_staged_entry_so_the_tree_is_really_clean() {
    let _store = isolate();
    let (_temp, root) = repo();
    std::fs::write(root.join("tracked.txt"), "staged\n").unwrap();
    crate::services::git::run(&root, &["add", "tracked.txt"]).unwrap();

    super::create(&root, "staged", &["tracked.txt".to_string()]).unwrap();

    assert_eq!(
        status(&root),
        "",
        "a staged file must not remain in the index after shelving"
    );
}

#[test]
fn shelving_rejects_paths_outside_the_project_and_unchanged_files() {
    let _store = isolate();
    let (_temp, root) = repo();
    assert!(super::create(&root, "escape", &["../outside.txt".to_string()]).is_err());
    assert!(
        super::create(&root, "empty", &[]).is_err(),
        "an empty shelf is a mistake, not a feature"
    );
}

#[test]
fn unshelving_restores_every_kind_and_drops_the_shelf() {
    let _store = isolate();
    let (_temp, root) = repo();
    std::fs::write(root.join("tracked.txt"), "edited\n").unwrap();
    std::fs::write(root.join("fresh.txt"), "new\n").unwrap();
    std::fs::remove_file(root.join("removed.txt")).unwrap();
    let shelf = super::create(
        &root,
        "all",
        &[
            "tracked.txt".to_string(),
            "fresh.txt".to_string(),
            "removed.txt".to_string(),
        ],
    )
    .unwrap();

    let report = super::apply(&root, &shelf.id, false).unwrap();

    assert!(report.conflicts.is_empty(), "{:?}", report.conflicts);
    assert_eq!(report.applied.len(), 3);
    assert_eq!(
        std::fs::read_to_string(root.join("tracked.txt")).unwrap(),
        "edited\n"
    );
    assert_eq!(
        std::fs::read_to_string(root.join("fresh.txt")).unwrap(),
        "new\n"
    );
    assert!(!root.join("removed.txt").exists());
    assert!(
        super::list(&root).unwrap().is_empty(),
        "a clean unshelve consumes the shelf"
    );
}

#[test]
fn a_file_changed_after_shelving_is_reported_instead_of_overwritten() {
    let _store = isolate();
    let (_temp, root) = repo();
    std::fs::write(root.join("tracked.txt"), "edited\n").unwrap();
    let shelf = super::create(&root, "drift", &["tracked.txt".to_string()]).unwrap();
    std::fs::write(root.join("tracked.txt"), "someone else\n").unwrap();

    let report = super::apply(&root, &shelf.id, false).unwrap();

    assert_eq!(report.applied.len(), 0);
    assert_eq!(report.conflicts.len(), 1);
    assert_eq!(report.conflicts[0].path, "tracked.txt");
    assert_eq!(
        std::fs::read_to_string(root.join("tracked.txt")).unwrap(),
        "someone else\n",
        "the other change must survive"
    );
    assert_eq!(
        super::list(&root).unwrap().len(),
        1,
        "a conflicted shelf is kept"
    );

    let forced = super::apply(&root, &shelf.id, true).unwrap();
    assert_eq!(forced.applied, vec!["tracked.txt".to_string()]);
    assert_eq!(
        std::fs::read_to_string(root.join("tracked.txt")).unwrap(),
        "edited\n"
    );
}

#[test]
fn shelves_are_listed_newest_first_and_scoped_to_their_project() {
    let _store = isolate();
    let (_temp, root) = repo();
    let (_other_temp, other) = repo();
    std::fs::write(root.join("tracked.txt"), "one\n").unwrap();
    let first = super::create(&root, "first", &["tracked.txt".to_string()]).unwrap();
    std::fs::write(root.join("tracked.txt"), "two\n").unwrap();
    let second = super::create(&root, "second", &["tracked.txt".to_string()]).unwrap();
    std::fs::write(other.join("tracked.txt"), "elsewhere\n").unwrap();
    super::create(&other, "other project", &["tracked.txt".to_string()]).unwrap();

    let listed = super::list(&root).unwrap();

    assert_eq!(listed.len(), 2, "other projects must not leak in");
    assert_eq!(listed[0].id, second.id);
    assert_eq!(listed[1].id, first.id);

    super::delete(&root, &first.id).unwrap();
    assert_eq!(super::list(&root).unwrap().len(), 1);
}

/// The TypeScript contracts in `src/shared/contracts/workspace.ts` are mirrored
/// by hand, so a renamed field would break the UI silently at runtime. Pin the
/// wire names here, where a rename fails the build instead.
#[test]
fn the_wire_format_matches_the_typescript_contract() {
    let _store = isolate();
    let (_temp, root) = repo();
    std::fs::write(root.join("tracked.txt"), "edited\n").unwrap();
    let shelf = super::create(&root, "wire", &["tracked.txt".to_string()]).unwrap();

    let encoded = serde_json::to_value(&shelf).unwrap();
    let keys: Vec<&str> = encoded
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    assert_eq!(keys, vec!["createdAt", "entries", "id", "name", "root"]);
    let entry = &encoded["entries"][0];
    let entry_keys: Vec<&str> = entry
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    assert_eq!(entry_keys, vec!["kind", "originalPath", "path"]);
    assert_eq!(entry["kind"], "modified");

    let report = super::apply(&root, &shelf.id, false).unwrap();
    let encoded = serde_json::to_value(&report).unwrap();
    let keys: Vec<&str> = encoded
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    assert_eq!(keys, vec!["applied", "conflicts"]);
}

#[test]
fn a_shelf_belonging_to_another_project_cannot_be_applied_or_deleted() {
    let _store = isolate();
    let (_temp, root) = repo();
    let (_other_temp, other) = repo();
    std::fs::write(other.join("tracked.txt"), "elsewhere\n").unwrap();
    let foreign = super::create(&other, "other", &["tracked.txt".to_string()]).unwrap();

    assert!(super::apply(&root, &foreign.id, false).is_err());
    assert!(super::delete(&root, &foreign.id).is_err());
}
