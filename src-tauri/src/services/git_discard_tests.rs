use super::*;

fn repository() -> (tempfile::TempDir, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    git::run(&root, &["init", "--initial-branch=main"]).unwrap();
    for (key, value) in [
        ("user.name", "Emdeck Test"),
        ("user.email", "test@example.invalid"),
        ("commit.gpgsign", "false"),
        ("core.autocrlf", "false"),
    ] {
        git::run(&root, &["config", key, value]).unwrap();
    }
    (temp, root)
}

fn commit(root: &Path) {
    git::run(root, &["add", "--all"]).unwrap();
    git::run(root, &["commit", "-m", "Fixture"]).unwrap();
}

fn request(root: &Path, paths: &[&str]) -> Request {
    let plan = preview(
        root,
        &paths
            .iter()
            .map(|path| (*path).to_owned())
            .collect::<Vec<_>>(),
    )
    .unwrap();
    Request {
        paths: plan.paths,
        revision: plan.revision,
    }
}

#[test]
fn discards_both_versions_of_one_file_without_touching_other_changes_or_head() {
    let (_temp, root) = repository();
    fs::write(root.join("notes.ts"), "original\n").unwrap();
    fs::write(root.join("other.ts"), "other original\n").unwrap();
    commit(&root);
    let head = git::run(&root, &["rev-parse", "HEAD"]).unwrap();
    fs::write(root.join("notes.ts"), "staged\n").unwrap();
    fs::write(root.join("other.ts"), "other staged\n").unwrap();
    git::run(&root, &["add", "--all"]).unwrap();
    fs::write(root.join("notes.ts"), "working\n").unwrap();
    fs::write(root.join("untracked.txt"), "keep\n").unwrap();
    apply(&root, &request(&root, &["notes.ts"])).unwrap();
    assert_eq!(
        fs::read_to_string(root.join("notes.ts")).unwrap(),
        "original\n"
    );
    assert_eq!(
        git::run(&root, &["show", ":notes.ts"]).unwrap(),
        "original\n"
    );
    assert_eq!(
        git::run(&root, &["show", ":other.ts"]).unwrap(),
        "other staged\n"
    );
    assert_eq!(
        fs::read_to_string(root.join("untracked.txt")).unwrap(),
        "keep\n"
    );
    assert_eq!(git::run(&root, &["rev-parse", "HEAD"]).unwrap(), head);
}

#[test]
fn bulk_discard_restores_deleted_directories_and_renames_and_removes_staged_additions() {
    let (_temp, root) = repository();
    fs::create_dir(root.join("nested")).unwrap();
    fs::write(root.join("nested/deleted.txt"), "restore me\n").unwrap();
    fs::write(root.join("old name.txt"), "rename me\n").unwrap();
    fs::write(root.join("notes[1].txt"), "literal\n").unwrap();
    fs::write(root.join("notes1.txt"), "keep this change\n").unwrap();
    commit(&root);
    git::run(&root, &["mv", "old name.txt", "new café.txt"]).unwrap();
    git::run(&root, &["rm", "nested/deleted.txt"]).unwrap();
    fs::write(root.join("added.txt"), "new file\n").unwrap();
    git::run(&root, &["add", "added.txt"]).unwrap();
    fs::write(root.join("notes[1].txt"), "discard\n").unwrap();
    fs::write(root.join("notes1.txt"), "keep\n").unwrap();
    let paths = [
        "new café.txt",
        "nested/deleted.txt",
        "added.txt",
        "notes[1].txt",
    ];
    let plan = preview(&root, &paths.map(str::to_owned)).unwrap();
    assert!(plan
        .files
        .iter()
        .any(|file| file.path == "old name.txt" && file.effect == "restore"));
    assert!(plan
        .files
        .iter()
        .any(|file| file.path == "added.txt" && file.effect == "remove"));
    apply(
        &root,
        &Request {
            paths: plan.paths,
            revision: plan.revision,
        },
    )
    .unwrap();
    assert_eq!(
        fs::read_to_string(root.join("nested/deleted.txt")).unwrap(),
        "restore me\n"
    );
    assert_eq!(
        fs::read_to_string(root.join("old name.txt")).unwrap(),
        "rename me\n"
    );
    assert!(!root.join("new café.txt").exists());
    assert!(!root.join("added.txt").exists());
    assert_eq!(
        fs::read_to_string(root.join("notes[1].txt")).unwrap(),
        "literal\n"
    );
    assert_eq!(
        fs::read_to_string(root.join("notes1.txt")).unwrap(),
        "keep\n"
    );
    assert!(git::run(&root, &["diff", "--cached", "--name-only"])
        .unwrap()
        .is_empty());
}

#[test]
fn discards_added_files_before_first_commit_but_never_untracked_files() {
    let (_temp, root) = repository();
    fs::write(root.join("added.txt"), "added\n").unwrap();
    fs::write(root.join("untracked.txt"), "keep\n").unwrap();
    git::run(&root, &["add", "added.txt"]).unwrap();
    apply(&root, &request(&root, &["added.txt"])).unwrap();
    assert!(!root.join("added.txt").exists());
    assert!(root.join("untracked.txt").exists());
    assert!(preview(&root, &["untracked.txt".into()]).is_err());
}

#[test]
fn rejects_changed_files_index_or_branch_after_preview_before_any_file_is_discarded() {
    let (_temp, root) = repository();
    fs::write(root.join("a.txt"), "original\n").unwrap();
    fs::write(root.join("b.txt"), "original\n").unwrap();
    commit(&root);
    fs::write(root.join("a.txt"), "edit\n").unwrap();
    fs::write(root.join("b.txt"), "edit\n").unwrap();
    let disk = request(&root, &["a.txt", "b.txt"]);
    fs::write(root.join("b.txt"), "agent edit after preview\n").unwrap();
    assert!(apply(&root, &disk).unwrap_err().contains("changed"));
    assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "edit\n");
    let index = request(&root, &["a.txt", "b.txt"]);
    git::run(&root, &["add", "b.txt"]).unwrap();
    assert!(apply(&root, &index).unwrap_err().contains("changed"));
    let branch = request(&root, &["a.txt", "b.txt"]);
    git::run(&root, &["switch", "-c", "other"]).unwrap();
    assert!(apply(&root, &branch).unwrap_err().contains("changed"));
    assert_eq!(
        fs::read_to_string(root.join("b.txt")).unwrap(),
        "agent edit after preview\n"
    );
}

#[test]
fn rejects_new_untracked_file_at_a_staged_deletion() {
    let (_temp, root) = repository();
    fs::write(root.join("recreated.txt"), "original\n").unwrap();
    commit(&root);
    git::run(&root, &["rm", "recreated.txt"]).unwrap();
    fs::write(root.join("recreated.txt"), "new untracked content\n").unwrap();
    assert!(preview(&root, &["recreated.txt".into()])
        .unwrap_err()
        .contains("untracked"));
    assert_eq!(
        fs::read_to_string(root.join("recreated.txt")).unwrap(),
        "new untracked content\n"
    );
    // Ignored replacements do not appear as ?? in porcelain status either.
    fs::write(root.join(".gitignore"), "recreated.txt\n").unwrap();
    assert!(preview(&root, &["recreated.txt".into()])
        .unwrap_err()
        .contains("untracked"));
    assert_eq!(
        fs::read_to_string(root.join("recreated.txt")).unwrap(),
        "new untracked content\n"
    );
}

#[test]
fn discards_intent_to_add_and_does_not_follow_symlink_index_entries() {
    let (_temp, root) = repository();
    fs::write(root.join("original.txt"), "original\n").unwrap();
    commit(&root);
    fs::write(root.join("intent.txt"), "new\n").unwrap();
    git::run(&root, &["add", "--intent-to-add", "intent.txt"]).unwrap();
    apply(&root, &request(&root, &["intent.txt"])).unwrap();
    assert!(!root.join("intent.txt").exists());
    let blob = git::run(&root, &["rev-parse", "HEAD:original.txt"]).unwrap();
    git::run(
        &root,
        &[
            "update-index",
            "--add",
            "--cacheinfo",
            &format!("120000,{},link.txt", blob.trim()),
        ],
    )
    .unwrap();
    assert!(preview(&root, &["link.txt".into()])
        .unwrap_err()
        .contains("linked files"));
}

#[test]
fn restores_binary_files_larger_than_the_editor_limit() {
    let (_temp, root) = repository();
    let bytes = vec![0; 6 * 1024 * 1024];
    fs::write(root.join("binary.bin"), &bytes).unwrap();
    commit(&root);
    fs::write(root.join("binary.bin"), b"\0changed").unwrap();
    apply(&root, &request(&root, &["binary.bin"])).unwrap();
    assert_eq!(fs::read(root.join("binary.bin")).unwrap(), bytes);
}

#[test]
fn rejects_invalid_paths_submodules_and_in_progress_operations() {
    let (_temp, root) = repository();
    fs::write(root.join("file.txt"), "original\n").unwrap();
    commit(&root);
    fs::write(root.join("file.txt"), "edit\n").unwrap();
    for path in [
        "../outside",
        ".git/config",
        "file.txt/..",
        ".",
        "",
        "file.txt\0",
    ] {
        assert!(file_path(&root, path).is_err(), "{path}");
        assert!(preview(&root, &[path.to_owned()]).is_err(), "{path}");
    }
    assert!(preview(&root, &[]).is_err());
    assert!(preview(&root, &["file.txt".into(), "file.txt".into()]).is_err());
    let head = git::run(&root, &["rev-parse", "HEAD"]).unwrap();
    git::run(
        &root,
        &[
            "update-index",
            "--add",
            "--cacheinfo",
            &format!("160000,{},module", head.trim()),
        ],
    )
    .unwrap();
    assert!(preview(&root, &["module".into()])
        .unwrap_err()
        .contains("submodules"));
    let stale = request(&root, &["file.txt"]);
    fs::write(root.join(".git/MERGE_HEAD"), head).unwrap();
    assert!(apply(&root, &stale)
        .unwrap_err()
        .contains("current Git operation"));
    assert_eq!(fs::read_to_string(root.join("file.txt")).unwrap(), "edit\n");
}

#[test]
fn discard_in_a_linked_worktree_does_not_change_the_main_checkout() {
    let (_temp, root) = repository();
    fs::write(root.join("file.txt"), "original\n").unwrap();
    commit(&root);
    let worktree = tempfile::tempdir().unwrap();
    let path = worktree.path().canonicalize().unwrap();
    git::run(
        &root,
        &[
            "worktree",
            "add",
            "-b",
            "linked",
            worktree.path().to_str().unwrap(),
        ],
    )
    .unwrap();
    fs::write(root.join("file.txt"), "main edits\n").unwrap();
    fs::write(path.join("file.txt"), "linked edits\n").unwrap();
    apply(&path, &request(&path, &["file.txt"])).unwrap();
    assert_eq!(
        fs::read_to_string(path.join("file.txt")).unwrap(),
        "original\n"
    );
    assert_eq!(
        fs::read_to_string(root.join("file.txt")).unwrap(),
        "main edits\n"
    );
}

#[cfg(unix)]
#[test]
fn refuses_symlinks_and_parent_links_without_following_them() {
    let (_temp, root) = repository();
    let outside = tempfile::tempdir().unwrap();
    fs::create_dir(root.join("nested")).unwrap();
    fs::write(root.join("nested/file.txt"), "original\n").unwrap();
    commit(&root);
    fs::write(outside.path().join("file.txt"), "private\n").unwrap();
    fs::remove_file(root.join("nested/file.txt")).unwrap();
    fs::remove_dir(root.join("nested")).unwrap();
    std::os::unix::fs::symlink(outside.path(), root.join("nested")).unwrap();
    assert!(preview(&root, &["nested/file.txt".into()]).is_err());
    assert_eq!(
        fs::read_to_string(outside.path().join("file.txt")).unwrap(),
        "private\n"
    );
}
