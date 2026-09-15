use super::{host::Host, tls, types::*};
use crate::{client, protocol::Action, storage};
use serde_json::{json, Value};
use std::{
    net::SocketAddr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

struct Fixture {
    home: tempfile::TempDir,
    host_home: tempfile::TempDir,
    host: Arc<Host>,
    address: SocketAddr,
    stop: Arc<AtomicBool>,
    accept: Option<thread::JoinHandle<()>>,
    local: Option<thread::JoinHandle<()>>,
}
impl Fixture {
    fn new() -> Self {
        let home = tempfile::tempdir().unwrap();
        let host_home = tempfile::tempdir().unwrap();
        let path = home.path().to_path_buf();
        let local = thread::spawn(move || crate::server::run(&path).unwrap());
        let deadline = Instant::now() + Duration::from_secs(8);
        while client::call(home.path(), Action::Ping).is_err() {
            assert!(Instant::now() < deadline, "Fixture server did not start");
            thread::sleep(Duration::from_millis(20));
        }
        let host = Host::load(host_home.path(), storage::endpoint(home.path()).unwrap()).unwrap();
        let address = host.test_bind();
        let stop = Arc::new(AtomicBool::new(false));
        let running = stop.clone();
        let accepting = host.clone();
        let accept = thread::spawn(move || {
            while !running.load(Ordering::SeqCst) {
                accepting.accept();
                thread::sleep(Duration::from_millis(5));
            }
        });
        Self {
            home,
            host_home,
            host,
            address,
            stop,
            accept: Some(accept),
            local: Some(local),
        }
    }
    fn invite(&self) -> Invite {
        let response = self.host.manage(Management::Invite).unwrap();
        let code = response["code"]
            .as_str()
            .unwrap()
            .strip_prefix("emdeck-pair:")
            .unwrap();
        use base64::Engine;
        let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(code)
            .unwrap();
        let invite: Invite = serde_json::from_slice(&bytes).unwrap();
        assert!(invite.expires <= crate::terminal::now() + 600);
        invite
    }
    fn pair(&self, invite: &Invite) -> Value {
        tls::exchange(
            self.address,
            &invite.certificate,
            Payload::Pair {
                secret: invite.secret.clone(),
                name: "Test laptop".into(),
            },
        )
        .unwrap()
    }
    fn call(&self, invite: &Invite, grant: &Value, action: Action) -> crate::Result<Value> {
        tls::exchange(
            self.address,
            &invite.certificate,
            Payload::Call {
                device: grant["device"].as_str().unwrap().into(),
                token: grant["token"].as_str().unwrap().into(),
                action,
            },
        )
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        self.host.close();
        if let Some(thread) = self.accept.take() {
            let _ = thread.join();
        }
        let _ = client::call(self.home.path(), Action::StopServer);
        if let Some(thread) = self.local.take() {
            let _ = thread.join();
        }
    }
}

#[test]
fn tls_pairing_is_single_use_revocable_and_keeps_local_capabilities_private() {
    let fixture = Fixture::new();
    let invite = fixture.invite();
    let grant = fixture.pair(&invite);
    let endpoint = storage::endpoint(fixture.home.path()).unwrap();
    assert!(!grant.to_string().contains(&endpoint.token));
    let persisted =
        std::fs::read_to_string(fixture.host_home.path().join("remote-host.json")).unwrap();
    assert!(!persisted.contains(grant["token"].as_str().unwrap()));
    assert!(!persisted.contains(&invite.secret));
    assert!(tls::exchange(
        fixture.address,
        &invite.certificate,
        Payload::Pair {
            secret: invite.secret.clone(),
            name: "Again".into()
        }
    )
    .unwrap_err()
    .contains("already used"));
    let ping = fixture.call(&invite, &grant, Action::Ping).unwrap();
    assert_eq!(ping["serverId"], endpoint.server_id);
    assert!(fixture
        .call(&invite, &grant, Action::Remote(Management::Invite))
        .unwrap_err()
        .contains("only"));
    assert!(fixture
        .call(&invite, &grant, Action::StopServer)
        .unwrap_err()
        .contains("only"));
    let invalid = json!({ "device": grant["device"], "token": "invalid" });
    assert!(fixture
        .call(&invite, &invalid, Action::Ping)
        .unwrap_err()
        .contains("invalid"));
    let status = fixture.host.manage(Management::Status).unwrap();
    assert!(!status
        .to_string()
        .contains(grant["token"].as_str().unwrap()));
    fixture
        .host
        .manage(Management::Revoke {
            id: grant["device"].as_str().unwrap().into(),
        })
        .unwrap();
    assert!(fixture
        .call(&invite, &grant, Action::Ping)
        .unwrap_err()
        .contains("revoked"));
    assert!(client::call(fixture.home.path(), Action::Ping).is_ok());
}

#[test]
fn wrong_certificate_is_rejected_and_replacing_an_invite_invalidates_the_old_one() {
    let fixture = Fixture::new();
    let old = fixture.invite();
    let invite = fixture.invite();
    assert!(tls::exchange(
        fixture.address,
        &invite.certificate,
        Payload::Pair {
            secret: old.secret,
            name: "Old".into()
        }
    )
    .is_err());
    let wrong = rcgen::generate_simple_self_signed(vec!["emdeck.internal".into()]).unwrap();
    assert!(tls::exchange(
        fixture.address,
        wrong.cert.der(),
        Payload::Pair {
            secret: invite.secret.clone(),
            name: "Wrong server".into()
        }
    )
    .is_err());
    let grant = fixture.pair(&invite);
    assert!(fixture.call(&invite, &grant, Action::Ping).is_ok());
    fixture.host.manage(Management::Disable).unwrap();
    assert!(fixture.call(&invite, &grant, Action::Ping).is_err());
    assert!(client::call(fixture.home.path(), Action::Ping).is_ok());
}

#[test]
fn sharing_and_pairing_reject_non_tailnet_endpoints_and_expired_codes() {
    for address in [
        "0.0.0.0:48192",
        "127.0.0.1:48192",
        "192.168.1.10:48192",
        "8.8.8.8:443",
        "[::]:48192",
        "100.63.255.255:1",
        "100.128.0.0:1",
        "100.100.1.1:0",
    ] {
        assert!(
            validate_address(address.parse().unwrap()).is_err(),
            "{address}"
        );
    }
    for address in ["100.64.0.1:48192", "100.127.255.254:48192"] {
        assert!(validate_address(address.parse().unwrap()).is_ok());
    }
    let invite = Invite {
        version: 1,
        address: "100.80.1.1:48192".parse().unwrap(),
        certificate: vec![],
        secret: secret(),
        expires: crate::terminal::now() - 1,
    };
    assert!(Invite::decode(&invite.encode().unwrap())
        .err()
        .unwrap()
        .contains("expired"));
    assert!(Invite::decode(&"x".repeat(12_001)).is_err());
    let fixture = Fixture::new();
    assert!(fixture
        .host
        .manage(Management::Enable {
            address: "0.0.0.0".into(),
            port: 48192
        })
        .is_err());
}

#[test]
fn remote_clients_share_the_persistent_engine_and_have_separate_input_leases() {
    let fixture = Fixture::new();
    let first = fixture.invite();
    let grant = fixture.pair(&first);
    let workspace = fixture
        .call(
            &first,
            &grant,
            Action::WorkspaceCreate {
                root: fixture.home.path().to_string_lossy().into(),
                name: "Remote fixture".into(),
            },
        )
        .unwrap();
    let second = fixture.invite();
    let other = fixture.pair(&second);
    let snapshot = fixture
        .call(
            &second,
            &other,
            Action::Snapshot {
                after: None,
                wait_ms: 0,
            },
        )
        .unwrap();
    assert_eq!(snapshot["workspaces"][0]["id"], workspace["id"]);
    let local = client::call(
        fixture.home.path(),
        Action::Snapshot {
            after: None,
            wait_ms: 0,
        },
    )
    .unwrap();
    assert_eq!(snapshot["workspaces"], local["workspaces"]);
    #[cfg(windows)]
    let shell = "powershell.exe".to_string();
    #[cfg(not(windows))]
    let shell = {
        use std::os::unix::fs::PermissionsExt;
        let path = fixture.home.path().join("fixture-shell");
        // A non-login interpreter avoids reading the tester's shell profiles.
        std::fs::write(
            &path,
            "#!/bin/sh\nprintf 'REMOTE_TEST_READY\\n'\nexec sleep 60\n",
        )
        .unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
        path.to_string_lossy().into_owned()
    };
    let pane = fixture
        .call(
            &first,
            &grant,
            Action::PaneCreate {
                launch: crate::protocol::Launch {
                    workspace_id: workspace["id"].as_str().unwrap().into(),
                    name: "Isolated shell".into(),
                    cwd: fixture.home.path().to_string_lossy().into(),
                    shell,
                    command: if cfg!(windows) {
                        "Write-Output 'REMOTE_TEST_READY'; Start-Sleep -Seconds 60"
                    } else {
                        "printf 'REMOTE_TEST_READY\\n'; sleep 60"
                    }
                    .into(),
                    resume_on_restart: false,
                },
                cols: 80,
                rows: 24,
            },
        )
        .unwrap();
    let id = pane["id"].as_str().unwrap().to_owned();
    let view = "same-view-identity-".repeat(6);
    fixture
        .call(
            &first,
            &grant,
            Action::Attach {
                id: id.clone(),
                client: view.clone(),
                takeover: false,
            },
        )
        .unwrap();
    assert!(fixture
        .call(
            &second,
            &other,
            Action::Attach {
                id: id.clone(),
                client: view.clone(),
                takeover: false
            }
        )
        .unwrap_err()
        .contains("Another client"));
    fixture
        .call(
            &first,
            &grant,
            Action::Resize {
                id: id.clone(),
                client: view.clone(),
                cols: 90,
                rows: 28,
            },
        )
        .unwrap();
    assert!(fixture
        .call(
            &second,
            &other,
            Action::Input {
                id: id.clone(),
                client: view.clone(),
                text: "wrong owner".into()
            }
        )
        .unwrap_err()
        .contains("does not own"));
    fixture
        .call(
            &first,
            &grant,
            Action::Detach {
                id: id.clone(),
                client: view.clone(),
            },
        )
        .unwrap();
    fixture
        .call(
            &second,
            &other,
            Action::Attach {
                id: id.clone(),
                client: view,
                takeover: false,
            },
        )
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        let read = fixture
            .call(
                &second,
                &other,
                Action::Read {
                    id: id.clone(),
                    after: None,
                    wait_ms: 0,
                },
            )
            .unwrap();
        if read["text"].as_str().unwrap().contains("REMOTE_TEST_READY") {
            break;
        }
        assert!(Instant::now() < deadline, "Remote output never arrived");
        thread::sleep(Duration::from_millis(50));
    }
    fixture.host.manage(Management::Disable).unwrap();
    assert_eq!(
        client::call(
            fixture.home.path(),
            Action::Read {
                id,
                after: None,
                wait_ms: 0
            }
        )
        .unwrap()["pane"]["running"],
        true
    );
    assert_eq!(
        client::call(
            fixture.home.path(),
            Action::Snapshot {
                after: None,
                wait_ms: 0
            }
        )
        .unwrap()["workspaces"],
        snapshot["workspaces"]
    );
}

#[test]
fn credential_file_names_cannot_escape_private_storage() {
    let home = tempfile::tempdir().unwrap();
    for id in ["../endpoint", "C:\\secret", "", "local"] {
        assert!(super::Credential::load(home.path(), id).is_err());
        assert!(super::forget(home.path(), id).is_err());
    }
    let id = uuid::Uuid::new_v4().to_string();
    assert!(super::forget(home.path(), &id).is_ok());
}

#[test]
fn server_enforces_invite_expiry_and_preserves_trust_across_restart() {
    let mut fixture = Fixture::new();
    let expired = fixture.invite();
    fixture.host.test_expire_invite();
    assert!(tls::exchange(
        fixture.address,
        &expired.certificate,
        Payload::Pair {
            secret: expired.secret,
            name: "Expired".into(),
        }
    )
    .unwrap_err()
    .contains("expired"));
    let invite = fixture.invite();
    let grant = fixture.pair(&invite);
    fixture.stop.store(true, Ordering::SeqCst);
    fixture.accept.take().unwrap().join().unwrap();
    fixture.host.close();
    fixture.host = Host::load(
        fixture.host_home.path(),
        storage::endpoint(fixture.home.path()).unwrap(),
    )
    .unwrap();
    fixture.address = fixture.host.test_bind();
    fixture.stop.store(false, Ordering::SeqCst);
    let stop = fixture.stop.clone();
    let host = fixture.host.clone();
    fixture.accept = Some(thread::spawn(move || {
        while !stop.load(Ordering::SeqCst) {
            host.accept();
            thread::sleep(Duration::from_millis(5));
        }
    }));
    // The original pinned certificate and device credential still authenticate.
    assert!(fixture.call(&invite, &grant, Action::Ping).is_ok());
    assert_eq!(
        fixture.host.manage(Management::Status).unwrap()["devices"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn saved_credentials_are_private_and_forgetting_removes_only_the_selected_device() {
    let home = tempfile::tempdir().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    // Create the credential directory through the production path validator.
    super::forget(home.path(), &id).unwrap();
    let path = home
        .path()
        .join("paired-machines")
        .join(format!("{id}.json"));
    let key = secret();
    let certificate = rcgen::generate_simple_self_signed(vec!["emdeck.internal".into()]).unwrap();
    storage::write_json(&path, &json!({ "address": "100.80.1.1:48192", "certificate": certificate.cert.der().to_vec(), "device": uuid::Uuid::new_v4().to_string(), "token": key })).unwrap();
    assert!(super::Credential::load(home.path(), &id).is_ok());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
    super::forget(home.path(), &uuid::Uuid::new_v4().to_string()).unwrap();
    assert!(path.exists());
    super::forget(home.path(), &id).unwrap();
    assert!(!path.exists());
}
