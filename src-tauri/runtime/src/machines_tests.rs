use super::*;

fn ssh_profile(id: &str) -> Profile {
    Profile {
        id: id.into(),
        name: format!("Machine {id}"),
        enabled: true,
        target: Target::Ssh {
            host: "synthetic.test".into(),
            port: None,
            binary: "emdeck-session".into(),
        },
    }
}

fn pairing(home: &Path) -> String {
    let directory = home.join("paired-machines");
    fs::create_dir_all(&directory).unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    storage::write_json(
        &directory.join(format!("{id}.json")),
        &serde_json::json!({
            "address": "100.80.1.1:48192", "certificate": [1, 2, 3],
            "device": uuid::Uuid::new_v4().to_string(), "token": "a".repeat(64),
        }),
    )
    .unwrap();
    id
}

#[test]
fn recovers_pairings_without_a_webview_profile_or_exposing_credentials() {
    let temp = tempfile::tempdir().unwrap();
    let id = pairing(temp.path());
    let saved = load(temp.path(), vec![]).unwrap();
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].name, "100.80.1.1:48192");
    assert_eq!(saved[0].target, Target::Direct { credential: id });
    assert!(!saved[0].enabled);
    let public = serde_json::to_string(&saved).unwrap();
    let disk = fs::read_to_string(temp.path().join("machines.json")).unwrap();
    for value in [public, disk] {
        assert!(!value.contains("certificate"));
        assert!(!value.contains("token"));
    }
    assert_eq!(load(temp.path(), vec![]).unwrap().len(), 1);
}

#[test]
fn migrates_names_ids_and_ssh_profiles_without_overwriting_later_edits() {
    let temp = tempfile::tempdir().unwrap();
    let credential = pairing(temp.path());
    load(temp.path(), vec![]).unwrap();
    let legacy = Profile {
        id: "legacy-view-id".into(),
        name: "Mac mini".into(),
        enabled: true,
        target: Target::Direct { credential },
    };
    let saved = load(temp.path(), vec![legacy.clone(), ssh_profile("ssh")]).unwrap();
    assert_eq!(saved.len(), 2);
    assert_eq!(saved[0].id, legacy.id);
    assert_eq!(saved[0].name, legacy.name);
    assert!(!saved[0].enabled);
    let mut renamed = legacy.clone();
    renamed.name = "Renamed desktop".into();
    save(temp.path(), renamed).unwrap();
    assert_eq!(
        load(temp.path(), vec![legacy]).unwrap()[0].name,
        "Renamed desktop"
    );
    assert_eq!(load(temp.path(), vec![]).unwrap().len(), 2);
}

#[test]
fn forgetting_does_not_resurrect_stale_browser_entries() {
    let temp = tempfile::tempdir().unwrap();
    let credential = pairing(temp.path());
    let direct = Profile {
        id: "desktop".into(),
        name: "Desktop".into(),
        enabled: false,
        target: Target::Direct {
            credential: credential.clone(),
        },
    };
    let legacy = vec![direct.clone(), ssh_profile("ssh")];
    load(temp.path(), legacy.clone()).unwrap();
    remove(temp.path(), "desktop").unwrap();
    remove(temp.path(), "ssh").unwrap();
    assert!(load(temp.path(), legacy).unwrap().is_empty());
    assert!(remote::Credential::load(temp.path(), &credential).is_err());
    save(temp.path(), ssh_profile("ssh")).unwrap();
    assert_eq!(load(temp.path(), vec![]).unwrap().len(), 1);
    assert!(save(temp.path(), direct).is_err());
}

#[test]
fn corrupt_or_future_settings_are_never_overwritten() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("machines.json");
    for content in ["{broken", r#"{"version":2,"entries":[],"removed":[]}"#] {
        fs::write(&path, content).unwrap();
        assert!(load(temp.path(), vec![ssh_profile("legacy")]).is_err());
        assert!(save(temp.path(), ssh_profile("new")).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), content);
    }
}

#[test]
fn concurrent_updates_preserve_other_windows_profiles() {
    let temp = tempfile::tempdir().unwrap();
    std::thread::scope(|scope| {
        for index in 0..8 {
            let home = temp.path();
            scope.spawn(move || {
                let mut profile = ssh_profile(&format!("window-{index}"));
                if let Target::Ssh { host, .. } = &mut profile.target {
                    *host = format!("synthetic-{index}.test");
                }
                save(home, profile).unwrap();
            });
        }
    });
    assert_eq!(load(temp.path(), vec![]).unwrap().len(), 8);
}

#[test]
fn rejects_invalid_profile_and_non_regular_registry() {
    let temp = tempfile::tempdir().unwrap();
    let mut profile = ssh_profile("invalid");
    profile.name = "\n".into();
    assert!(save(temp.path(), profile).is_err());
    fs::create_dir(temp.path().join("machines.json")).unwrap();
    assert!(load(temp.path(), vec![]).is_err());
}
