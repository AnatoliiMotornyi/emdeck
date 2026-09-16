use super::*;
use crate::services::git::snapshot;

fn init() -> (tempfile::TempDir, PathBuf, String) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("project with spaces");
    std::fs::create_dir(&root).unwrap();
    let root = root.canonicalize().unwrap();
    run(&root, &["init", "-b", "main"]).unwrap();
    run(&root, &["config", "user.name", "Emdeck Test"]).unwrap();
    run(&root, &["config", "user.email", "test@example.test"]).unwrap();
    run(&root, &["config", "commit.gpgsign", "false"]).unwrap();
    write_commit(&root, "file.txt", "base\n", "Initial");
    let remote = temp
        .path()
        .join("remote.git")
        .to_string_lossy()
        .replace("\\\\?\\", "")
        .replace('\\', "/");
    run(&root, &["init", "--bare", &remote]).unwrap();
    run(&root, &["remote", "add", "origin", &remote]).unwrap();
    run(&root, &["push", "-u", "origin", "main"]).unwrap();
    (temp, root, remote)
}
fn write_commit(root: &Path, file: &str, content: &str, message: &str) {
    std::fs::write(root.join(file), content).unwrap();
    run(root, &["add", "--", file]).unwrap();
    run(root, &["commit", "-m", message]).unwrap();
}
fn request(root: &Path, action: &str, reference: &str) -> BranchRequest {
    BranchRequest {
        action: action.into(),
        reference: reference.into(),
        expected_current: current(root).unwrap(),
        name: String::new(),
        remote: String::new(),
    }
}
fn apply(root: &Path, name: &str, reference: &str) -> Result<String> {
    action(root, &request(root, name, reference))
}
fn oid(root: &Path, reference: &str) -> String {
    run(root, &["rev-parse", reference]).unwrap()
}

#[test]
fn fetch_indicators_and_update_another_branch_without_checkout() {
    let (_temp, root, remote) = init();
    run(&root, &["switch", "-c", "remote-change"]).unwrap();
    write_commit(&root, "remote.txt", "incoming\n", "Incoming");
    let tip = oid(&root, "HEAD");
    // Publish via URL so the cached origin/main remains at its old value.
    run(&root, &["push", &remote, "HEAD:refs/heads/main"]).unwrap();
    run(&root, &["switch", "main"]).unwrap();
    let details = branches(&root).unwrap();
    assert_eq!(
        details.iter().find(|b| b.name == "main").unwrap().behind,
        Some(0)
    );
    apply(&root, "fetch", "").unwrap();
    let details = branches(&root).unwrap();
    let main = details
        .iter()
        .find(|b| b.reference == "refs/heads/main")
        .unwrap();
    assert_eq!(main.behind, Some(1));
    assert_eq!(main.ahead, Some(0));
    assert_eq!(main.upstream.as_deref(), Some("refs/remotes/origin/main"));
    run(&root, &["switch", "-c", "agent/task"]).unwrap();
    std::fs::write(root.join("keep.txt"), "unsaved on disk").unwrap();
    apply(&root, "update", "refs/heads/main").unwrap();
    assert_eq!(current(&root).unwrap(), "agent/task");
    assert_eq!(oid(&root, "refs/heads/main"), tip);
    assert_eq!(
        std::fs::read_to_string(root.join("keep.txt")).unwrap(),
        "unsaved on disk"
    );
    assert!(!root.join("remote.txt").exists());
}

#[test]
fn sync_refreshes_both_branches_and_merges_without_leaving_the_current_one() {
    let (_temp, root, remote) = init();
    run(&root, &["switch", "-c", "agent/task"]).unwrap();
    write_commit(&root, "task.txt", "task\n", "Task");
    run(&root, &["push", "-u", "origin", "agent/task"]).unwrap();
    // Both branches move on the remote while the local caches stay stale, so a
    // single sync has something to do at every stage.
    let peer = oid(&root, "HEAD").trim().to_owned();
    write_commit(&root, "peer.txt", "peer\n", "Peer commit");
    let peer_tip = oid(&root, "HEAD");
    run(&root, &["push", &remote, "HEAD:refs/heads/agent/task"]).unwrap();
    run(&root, &["reset", "--hard", &peer]).unwrap();
    run(&root, &["switch", "main"]).unwrap();
    let base = oid(&root, "HEAD").trim().to_owned();
    write_commit(&root, "shared.txt", "shared\n", "Shared work");
    let main_tip = oid(&root, "HEAD");
    run(&root, &["push", &remote, "HEAD:refs/heads/main"]).unwrap();
    run(&root, &["reset", "--hard", &base]).unwrap();
    run(&root, &["switch", "agent/task"]).unwrap();

    apply(&root, "sync", "refs/heads/main").unwrap();

    assert_eq!(current(&root).unwrap(), "agent/task");
    assert_eq!(oid(&root, "refs/heads/main"), main_tip);
    assert!(root.join("shared.txt").exists(), "main was merged in");
    assert!(root.join("peer.txt").exists(), "own upstream was pulled");
    assert!(root.join("task.txt").exists(), "own commits are preserved");
    let details = branches(&root).unwrap();
    let task = details
        .iter()
        .find(|b| b.reference == "refs/heads/agent/task")
        .unwrap();
    assert_eq!(task.behind, Some(0));
    assert_ne!(oid(&root, "HEAD"), peer_tip, "the merge created a commit");

    // Repeating the operation is safe and reports that nothing was missing.
    assert!(apply(&root, "sync", "refs/heads/main")
        .unwrap()
        .contains("up to date"));
    assert!(apply(&root, "sync", "refs/heads/agent/task")
        .unwrap_err()
        .contains("already the current branch"));
    std::fs::write(root.join("task.txt"), "edited\n").unwrap();
    let refused = apply(&root, "sync", "refs/heads/main").unwrap_err();
    assert!(refused.contains("Commit or stash"), "{refused}");
    assert_eq!(oid(&root, "refs/heads/main"), main_tip, "nothing moved");
}

#[test]
fn update_refuses_divergence_and_dirty_current_branch() {
    let (_temp, root, remote) = init();
    run(&root, &["switch", "-c", "remote-change"]).unwrap();
    write_commit(&root, "remote.txt", "incoming", "Incoming");
    run(&root, &["push", &remote, "HEAD:refs/heads/main"]).unwrap();
    run(&root, &["switch", "main"]).unwrap();
    std::fs::write(root.join("file.txt"), "keep dirty").unwrap();
    assert!(apply(&root, "update", "refs/heads/main")
        .unwrap_err()
        .contains("Commit or stash"));
    assert_eq!(
        std::fs::read_to_string(root.join("file.txt")).unwrap(),
        "keep dirty"
    );
    write_commit(&root, "file.txt", "local", "Local");
    let before = oid(&root, "HEAD");
    assert!(apply(&root, "update", "refs/heads/main")
        .unwrap_err()
        .contains("diverged"));
    assert_eq!(oid(&root, "HEAD"), before);
    let detail = branches(&root)
        .unwrap()
        .into_iter()
        .find(|b| b.name == "main")
        .unwrap();
    assert_eq!((detail.ahead, detail.behind), (Some(1), Some(1)));
    run(&root, &["update-ref", "-d", "refs/remotes/origin/main"]).unwrap();
    let detail = branches(&root)
        .unwrap()
        .into_iter()
        .find(|b| b.name == "main")
        .unwrap();
    assert!(detail.gone);
    assert_eq!((detail.ahead, detail.behind), (None, None));
}

#[test]
fn push_has_explicit_destination_and_never_forces_or_mirrors() {
    let (_temp, root, remote) = init();
    run(&root, &["switch", "-c", "agent/task"]).unwrap();
    write_commit(&root, "agent.txt", "change", "Agent commit");
    run(&root, &["branch", "must-stay-local"]).unwrap();
    run(&root, &["config", "remote.origin.mirror", "true"]).unwrap();
    let mut push = request(&root, "push", "refs/heads/agent/task");
    push.remote = "origin".into();
    push.name = "review/task".into();
    action(&root, &push).unwrap();
    let published = run(&root, &["ls-remote", &remote]).unwrap();
    assert!(published.contains("refs/heads/review/task"));
    assert!(!published.contains("must-stay-local"));
    assert!(!published.contains("refs/heads/agent/task"));
    assert!(published.contains("refs/heads/main"));
    assert_eq!(
        run(&root, &["rev-parse", "--symbolic-full-name", "@{upstream}"])
            .unwrap()
            .trim(),
        "refs/remotes/origin/review/task"
    );
    run(&root, &["switch", "main"]).unwrap();
    write_commit(&root, "different.txt", "different", "Diverged");
    push.expected_current = "main".into();
    push.reference = "refs/heads/main".into();
    assert!(action(&root, &push).is_err());
    assert_eq!(run(&root, &["ls-remote", &remote]).unwrap(), published);
    push.name = "--delete".into();
    assert!(action(&root, &push).is_err());
}

#[test]
fn branch_creation_rename_tracking_and_comparison_keep_namespaces() {
    let (_temp, root, _) = init();
    run(&root, &["branch", "origin/main"]).unwrap();
    write_commit(&root, "file.txt", "local main", "Local main");
    let compare = compare(&root, "refs/remotes/origin/main", "refs/heads/main", false).unwrap();
    assert_eq!((compare.left_count, compare.right_count), (0, 1));
    assert!(compare.diff.contains("+local main"));
    assert_eq!(compare.right[0].subject, "Local main");
    let mut create = request(&root, "create-from", "refs/remotes/origin/main");
    create.name = "dima/feature/task".into();
    action(&root, &create).unwrap();
    assert_eq!(oid(&root, "HEAD"), oid(&root, "refs/heads/origin/main"));
    let mut rename = request(&root, "rename", "refs/heads/dima/feature/task");
    rename.name = "dima/renamed/task".into();
    action(&root, &rename).unwrap();
    assert_eq!(current(&root).unwrap(), "dima/renamed/task");
    let mut track = request(&root, "track", "refs/heads/dima/renamed/task");
    track.name = "refs/remotes/origin/main".into();
    action(&root, &track).unwrap();
    assert_eq!(
        run(&root, &["rev-parse", "--symbolic-full-name", "@{upstream}"])
            .unwrap()
            .trim(),
        "refs/remotes/origin/main"
    );
    track.name.clear();
    action(&root, &track).unwrap();
    assert!(run(&root, &["rev-parse", "@{upstream}"]).is_err());
    std::fs::write(root.join("file.txt"), "working version").unwrap();
    assert!(compare_working(&root).contains("+working version"));
    assert!(super::compare(&root, "--help", "HEAD", false).is_err());
    let mut stale = request(&root, "delete", "refs/heads/origin/main");
    stale.expected_current = "main".into();
    assert!(action(&root, &stale)
        .unwrap_err()
        .contains("current branch changed"));
}
fn compare_working(root: &Path) -> String {
    super::compare(root, "refs/remotes/origin/main", "HEAD", true)
        .unwrap()
        .diff
}

#[test]
fn worktree_and_operation_guards_protect_branches() {
    let (temp, root, _) = init();
    run(
        &root,
        &[
            "branch",
            "--track",
            "agent/task",
            "refs/remotes/origin/main",
        ],
    )
    .unwrap();
    let destination = temp
        .path()
        .join("agent worktree")
        .to_string_lossy()
        .replace("\\\\?\\", "")
        .replace('\\', "/");
    run(&root, &["worktree", "add", &destination, "agent/task"]).unwrap();
    for op in ["update", "delete", "rename"] {
        let mut req = request(&root, op, "refs/heads/agent/task");
        req.name = "renamed".into();
        assert!(action(&root, &req).unwrap_err().contains("checked out"));
    }
    let guard = acquire(&root).unwrap();
    assert!(apply(&root, "fetch", "")
        .unwrap_err()
        .contains("Another Git operation"));
    drop(guard);
    assert!(apply(&root, "delete", "refs/remotes/origin/main").is_err());
}

#[test]
fn rebase_direction_conflict_continue_and_abort() {
    let (_temp, root, _) = init();
    run(&root, &["switch", "-c", "feature"]).unwrap();
    write_commit(&root, "feature.txt", "feature", "Feature");
    run(&root, &["switch", "main"]).unwrap();
    write_commit(&root, "main.txt", "main", "Main");
    apply(&root, "checkout-rebase", "refs/heads/feature").unwrap();
    assert_eq!(current(&root).unwrap(), "feature");
    assert!(command(
        &root,
        &["merge-base", "--is-ancestor", "refs/heads/main", "HEAD"]
    )
    .unwrap()
    .status
    .success());
    write_commit(&root, "file.txt", "feature conflict\n", "Conflict feature");
    run(&root, &["switch", "main"]).unwrap();
    write_commit(&root, "file.txt", "main conflict\n", "Conflict main");
    let before = oid(&root, "HEAD");
    assert!(apply(&root, "rebase", "refs/heads/feature").is_err());
    assert_eq!(
        snapshot(&root).unwrap().operation.as_deref(),
        Some("rebase")
    );
    assert!(snapshot(&root).unwrap().changes.iter().any(|c| c.conflict));
    apply(&root, "abort", "").unwrap();
    assert_eq!(oid(&root, "HEAD"), before);
    assert!(apply(&root, "merge", "refs/heads/feature").is_err());
    assert_eq!(operation(&root).as_deref(), Some("merge"));
    std::fs::write(root.join("file.txt"), "resolved\n").unwrap();
    run(&root, &["add", "file.txt"]).unwrap();
    apply(&root, "continue", "").unwrap();
    assert!(operation(&root).is_none());
    assert!(snapshot(&root).unwrap().changes.is_empty());
}

#[test]
fn checkout_update_and_resolved_rebase_continue() {
    let (_temp, root, remote) = init();
    run(&root, &["switch", "-c", "remote-tip"]).unwrap();
    write_commit(&root, "remote.txt", "new", "Incoming");
    run(&root, &["push", &remote, "HEAD:refs/heads/main"]).unwrap();
    apply(&root, "checkout-update", "refs/heads/main").unwrap();
    assert_eq!(current(&root).unwrap(), "main");
    assert!(root.join("remote.txt").exists());
    assert!(apply(&root, "checkout-update", "refs/heads/remote-tip").is_err());
    assert_eq!(current(&root).unwrap(), "main");
    run(&root, &["switch", "-c", "feature"]).unwrap();
    write_commit(&root, "file.txt", "feature\n", "Feature");
    run(&root, &["switch", "main"]).unwrap();
    write_commit(&root, "file.txt", "main\n", "Main");
    assert!(apply(&root, "checkout-rebase", "refs/heads/feature").is_err());
    assert_eq!(operation(&root).as_deref(), Some("rebase"));
    std::fs::write(root.join("file.txt"), "resolved\n").unwrap();
    run(&root, &["add", "file.txt"]).unwrap();
    apply(&root, "continue", "").unwrap();
    assert!(operation(&root).is_none());
    assert_eq!(current(&root).unwrap(), "feature");
    assert!(command(
        &root,
        &["merge-base", "--is-ancestor", "refs/heads/main", "HEAD"]
    )
    .unwrap()
    .status
    .success());
}
