use crate::services::git::{command, run, Commit};
use crate::services::workspace::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::{
    collections::HashSet,
    path::PathBuf,
    sync::{Mutex, OnceLock},
};

static OPERATIONS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
pub struct OperationGuard(PathBuf);
impl Drop for OperationGuard {
    fn drop(&mut self) {
        if let Ok(mut active) = OPERATIONS.get().unwrap().lock() {
            active.remove(&self.0);
        }
    }
}
pub fn acquire(root: &Path) -> Result<OperationGuard> {
    let common = run(root, &["rev-parse", "--git-common-dir"])?;
    let common = root
        .join(common.trim())
        .canonicalize()
        .map_err(crate::services::workspace::err)?;
    let mut active = OPERATIONS
        .get_or_init(|| Mutex::new(HashSet::new()))
        .lock()
        .map_err(crate::services::workspace::err)?;
    if !active.insert(common.clone()) {
        return Err(
            "Another Git operation is running in this repository. Try again when it finishes."
                .into(),
        );
    }
    Ok(OperationGuard(common))
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub reference: String,
    pub name: String,
    pub upstream: Option<String>,
    pub remote: Option<String>,
    pub remote_ref: Option<String>,
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
    pub gone: bool,
    pub worktree: Option<String>,
}

fn optional(value: &str) -> Option<String> {
    (!value.is_empty()).then(|| value.to_owned())
}

pub fn branches(root: &Path) -> Result<Vec<Branch>> {
    let refs = run(root, &["for-each-ref", "--format=%(refname)%00%(symref)%00%(upstream)%00%(upstream:track,nobracket)%00%(upstream:remotename)%00%(upstream:remoteref)%00%(worktreepath)%00", "refs/heads/", "refs/remotes/"])?;
    let fields: Vec<_> = refs.split('\0').collect();
    // Only the separator before each ref contains Git's record newline; paths may contain newlines.
    Ok(fields
        .as_chunks::<7>()
        .0
        .iter()
        .filter_map(|fields| {
            if !fields[1].is_empty() {
                return None;
            }
            let reference = fields[0].trim_start_matches(['\r', '\n']);
            let name = reference
                .strip_prefix("refs/heads/")
                .or_else(|| reference.strip_prefix("refs/remotes/"))?;
            let known = !fields[2].is_empty() && fields[3] != "gone";
            let count = |prefix: &str| {
                fields[3]
                    .split(", ")
                    .find_map(|part| part.strip_prefix(prefix).and_then(|n| n.parse().ok()))
                    .unwrap_or(0)
            };
            Some(Branch {
                reference: reference.into(),
                name: name.into(),
                upstream: optional(fields[2]),
                remote: optional(fields[4]),
                remote_ref: optional(fields[5]),
                ahead: known.then(|| count("ahead ")),
                behind: known.then(|| count("behind ")),
                gone: fields[3] == "gone",
                worktree: optional(fields[6]),
            })
        })
        .collect())
}

pub fn operation(root: &Path) -> Option<String> {
    let directory = run(root, &["rev-parse", "--absolute-git-dir"]).ok()?;
    let directory = Path::new(directory.trim());
    [
        ("rebase-merge", "rebase"),
        ("rebase-apply", "rebase"),
        ("MERGE_HEAD", "merge"),
        ("CHERRY_PICK_HEAD", "cherry-pick"),
        ("REVERT_HEAD", "revert"),
    ]
    .into_iter()
    .find_map(|(file, name)| directory.join(file).exists().then(|| name.to_owned()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchRequest {
    pub action: String,
    #[serde(default)]
    pub reference: String,
    pub expected_current: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub remote: String,
}

fn current(root: &Path) -> Result<String> {
    Ok(run(root, &["symbolic-ref", "--quiet", "HEAD"])
        .or_else(|_| run(root, &["rev-parse", "--short", "HEAD"]))?
        .trim()
        .trim_start_matches("refs/heads/")
        .to_owned())
}

fn check_current(root: &Path, expected: &str) -> Result<()> {
    if current(root)? != expected {
        return Err("The current branch changed. Refresh branches and try again.".into());
    }
    Ok(())
}

fn clean(root: &Path) -> Result<()> {
    if !run(
        root,
        &["status", "--porcelain=v1", "--untracked-files=normal"],
    )?
    .is_empty()
    {
        return Err("Commit or stash your working-tree changes before this operation. Emdeck does not stash automatically.".into());
    }
    Ok(())
}

fn reference(root: &Path, reference: &str) -> Result<String> {
    if !(reference.starts_with("refs/heads/") || reference.starts_with("refs/remotes/")) {
        return Err("Choose a local or remote branch.".into());
    }
    run(root, &["check-ref-format", reference])?;
    if run(root, &["symbolic-ref", "-q", reference]).is_ok() {
        return Err("Choose a branch, not a symbolic reference.".into());
    }
    Ok(run(
        root,
        &["rev-parse", "--verify", &format!("{reference}^{{commit}}")],
    )?
    .trim()
    .to_owned())
}

fn branch_name(root: &Path, name: &str) -> Result<()> {
    if name.is_empty() || name.starts_with('-') || name == "HEAD" {
        return Err("Invalid branch name.".into());
    }
    run(root, &["check-ref-format", &format!("refs/heads/{name}")])?;
    Ok(())
}

fn local_name(reference: &str) -> Result<&str> {
    reference
        .strip_prefix("refs/heads/")
        .filter(|name| !name.is_empty() && !name.starts_with('-') && *name != "HEAD")
        .ok_or_else(|| "This action requires a local branch.".into())
}

fn check_remote(root: &Path, remote: &str) -> Result<()> {
    if remote.starts_with('-') || !run(root, &["remote"])?.lines().any(|name| name == remote) {
        return Err("Choose a configured Git remote.".into());
    }
    Ok(())
}

fn checkout(root: &Path, target: &str) -> Result<String> {
    if target.starts_with("refs/heads/") {
        let name = local_name(target)?;
        run(root, &["switch", "--no-guess", name])
    } else {
        run(root, &["switch", "--track", target])
    }
}

fn unoccupied(root: &Path, target: &str, allow_current: bool) -> Result<()> {
    let details = branches(root)?;
    let info = details
        .iter()
        .find(|branch| branch.reference == target)
        .ok_or("Branch no longer exists. Refresh branches.")?;
    if let Some(path) = &info.worktree {
        let here = Path::new(path).canonicalize().ok().as_deref() == Some(root);
        if !allow_current || !here {
            return Err(format!(
                "This branch is checked out in {path}. Open that worktree to update it."
            ));
        }
    }
    Ok(())
}

fn update(root: &Path, target: &str, expected: &str) -> Result<String> {
    local_name(target)?;
    unoccupied(root, target, true)?;
    let info = branches(root)?
        .into_iter()
        .find(|b| b.reference == target)
        .ok_or("Branch no longer exists.")?;
    let upstream = info
        .upstream
        .as_deref()
        .ok_or("Set a tracked branch before updating.")?;
    let remote = info
        .remote
        .as_deref()
        .ok_or("Tracked branch has no remote.")?;
    let remote_ref = info
        .remote_ref
        .as_deref()
        .ok_or("Tracked branch is not configured.")?;
    if remote != "." {
        check_remote(root, remote)?;
        if !upstream.starts_with("refs/remotes/") {
            return Err("Tracked branch must be in the remote namespace.".into());
        }
        // Refresh precisely the configured upstream, even with a narrow fetch refspec.
        run(
            root,
            &[
                "fetch",
                "--no-tags",
                remote,
                &format!("+{remote_ref}:{upstream}"),
            ],
        )?;
    }
    check_current(root, expected)?;
    unoccupied(root, target, true)?;
    let old = reference(root, target)?;
    let tip = reference(root, upstream)?;
    if old == tip {
        return Ok("Branch is already up to date.".into());
    }
    if !command(root, &["merge-base", "--is-ancestor", &old, &tip])?
        .status
        .success()
    {
        if command(root, &["merge-base", "--is-ancestor", &tip, &old])?
            .status
            .success()
        {
            return Ok("Branch has no incoming commits. Local commits are ready to push.".into());
        }
        return Err("This branch has diverged from its tracked branch. Choose Merge or Rebase to reconcile it; no local commits were replaced.".into());
    }
    if target == format!("refs/heads/{}", current(root)?) {
        clean(root)?;
        run(root, &["merge", "--ff-only", "--no-edit", &tip])
    } else {
        unoccupied(root, target, false)?;
        // The expected old object protects against concurrent ref changes.
        run(
            root,
            &[
                "update-ref",
                "-m",
                "Emdeck: fast-forward from tracked branch",
                target,
                &tip,
                &old,
            ],
        )?;
        Ok(format!(
            "Updated {} without checking it out.",
            local_name(target)?
        ))
    }
}

/// Bring the current branch up to date with `target` in one step: refresh both
/// branches from their tracked branches, then merge `target` in. Every stage is
/// skipped when it has nothing to do, so this is safe to repeat. Untracked
/// branches are simply not refreshed; that is not an error, because a local-only
/// branch still merges.
fn sync(root: &Path, target: &str, expected: &str) -> Result<String> {
    local_name(target)?;
    let branch = format!("refs/heads/{expected}");
    if target == branch {
        return Err("This is already the current branch. Choose the branch to merge in.".into());
    }
    // Refuse before the first fetch, so a rejected run changes nothing at all.
    clean(root)?;
    let tracked = |reference: &str| -> Result<bool> {
        Ok(branches(root)?
            .iter()
            .any(|b| b.reference == reference && b.upstream.is_some()))
    };
    let mut report = Vec::new();
    for reference in [target, branch.as_str()] {
        if tracked(reference)? {
            report.push(update(root, reference, expected)?);
        }
    }
    report.push(run(
        root,
        &["merge", "--no-edit", "--no-autostash", target],
    )?);
    Ok(report.join(" "))
}

pub fn action(root: &Path, request: &BranchRequest) -> Result<String> {
    let _operation = acquire(root)?;
    check_current(root, &request.expected_current)?;
    let action = request.action.as_str();
    if action == "fetch" {
        return run(root, &["fetch", "--all", "--prune"]);
    }
    let progress = operation(root);
    if action == "continue" || action == "abort" {
        let progress = progress.ok_or("No Git operation is in progress.")?;
        if action == "abort" {
            return run(root, &[progress.as_str(), "--abort"]);
        }
        return if progress == "merge" {
            run(root, &["-c", "core.editor=true", "commit", "--no-edit"])
        } else {
            run(
                root,
                &["-c", "core.editor=true", progress.as_str(), "--continue"],
            )
        };
    }
    if let Some(progress) = progress {
        return Err(format!("Finish or abort the current {progress} first."));
    }
    let target = &request.reference;
    reference(root, target)?;
    match action {
        "checkout" => checkout(root, target),
        "create-from" => {
            branch_name(root, &request.name)?;
            run(root, &["switch", "--no-track", "-c", &request.name, target])
        }
        "rename" => {
            branch_name(root, &request.name)?;
            unoccupied(root, target, true)?;
            run(root, &["branch", "-m", local_name(target)?, &request.name])
        }
        "delete" => {
            unoccupied(root, target, false)?;
            run(root, &["branch", "-d", local_name(target)?])
        }
        "track" => {
            let local = local_name(target)?;
            if request.name.is_empty() {
                return run(root, &["branch", "--unset-upstream", local]);
            }
            reference(root, &request.name)?;
            run(
                root,
                &[
                    "branch",
                    &format!("--set-upstream-to={}", request.name),
                    local,
                ],
            )
        }
        "push" => {
            local_name(target)?;
            check_remote(root, &request.remote)?;
            branch_name(root, &request.name)?;
            // Explicit destination, no wildcard/mirror/tags/force, regardless of push.default.
            run(
                root,
                &[
                    "-c",
                    &format!("remote.{}.mirror=false", request.remote),
                    "push",
                    "--porcelain",
                    "--no-force",
                    "--no-follow-tags",
                    "--set-upstream",
                    &request.remote,
                    &format!("{target}:refs/heads/{}", request.name),
                ],
            )
        }
        "update" => update(root, target, &request.expected_current),
        "sync" => sync(root, target, &request.expected_current),
        "checkout-update" => {
            // Preflight tracking before switching; errors after fetch leave the selected branch checked out.
            if target.starts_with("refs/heads/")
                && !branches(root)?
                    .iter()
                    .any(|b| &b.reference == target && b.upstream.is_some())
            {
                return Err("Set a tracked branch before checking out and updating.".into());
            }
            clean(root)?;
            checkout(root, target)?;
            let selected = current(root)?;
            update(root, &format!("refs/heads/{selected}"), &selected)
        }
        "merge" | "rebase" | "checkout-rebase" => {
            clean(root)?;
            if action == "merge" {
                run(root, &["merge", "--no-edit", "--no-autostash", target])
            } else {
                let onto = if action == "checkout-rebase" {
                    let onto = run(root, &["rev-parse", "HEAD"])?;
                    checkout(root, target)?;
                    onto.trim().to_owned()
                } else {
                    target.clone()
                };
                run(
                    root,
                    &["-c", "core.editor=true", "rebase", "--no-autostash", &onto],
                )
            }
        }
        _ => Err("Unknown branch action.".into()),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Comparison {
    pub diff: String,
    pub left: Vec<Commit>,
    pub right: Vec<Commit>,
    pub left_count: u32,
    pub right_count: u32,
}

fn commits(root: &Path, from: &str, exclude: &str) -> Result<Vec<Commit>> {
    Ok(run(
        root,
        &[
            "log",
            "-50",
            "--format=%h%x00%s%x00%cr",
            from,
            "--not",
            exclude,
            "--",
        ],
    )?
    .lines()
    .filter_map(|line| {
        let mut fields = line.split('\0');
        Some(Commit {
            hash: fields.next()?.into(),
            subject: fields.next()?.into(),
            age: fields.next()?.into(),
        })
    })
    .collect())
}

pub fn compare(root: &Path, base: &str, head: &str, working: bool) -> Result<Comparison> {
    // Resolve once so each part of this comparison uses the same commit pair.
    let base = reference(root, base)?;
    let head = if head == "HEAD" {
        run(root, &["rev-parse", "--verify", "HEAD"])?
            .trim()
            .to_owned()
    } else {
        reference(root, head)?
    };
    let mut args = vec!["diff", "--no-ext-diff", "--no-textconv", &base];
    if !working {
        args.push(&head);
    }
    args.push("--");
    let diff = run(root, &args)?;
    if diff.len() > 2 * 1024 * 1024 {
        return Err("Diff exceeds the 2 MB viewer limit. Use Git in a terminal.".into());
    }
    let counts = if working {
        "0 0".into()
    } else {
        run(
            root,
            &[
                "rev-list",
                "--left-right",
                "--count",
                &format!("{base}...{head}"),
                "--",
            ],
        )?
    };
    let mut counts = counts.split_whitespace();
    Ok(Comparison {
        diff,
        left: if working {
            vec![]
        } else {
            commits(root, &base, &head)?
        },
        right: if working {
            vec![]
        } else {
            commits(root, &head, &base)?
        },
        left_count: counts.next().and_then(|n| n.parse().ok()).unwrap_or(0),
        right_count: counts.next().and_then(|n| n.parse().ok()).unwrap_or(0),
    })
}

#[cfg(test)]
mod tests;
