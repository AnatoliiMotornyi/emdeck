use super::*;
use crate::{
    protocol::{Action, Response, MAX_REQUEST, MAX_RESPONSE},
    remote::types::{Payload, Request},
};
use rustls::ServerConnection;
use std::{net::TcpListener, thread};

#[test]
fn pool_works_with_old_hosts_that_close_after_one_response() {
    let identity = rcgen::generate_simple_self_signed(vec!["emdeck.internal".into()]).unwrap();
    let config = server(identity.cert.der(), &identity.signing_key.serialize_der()).unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let host = thread::spawn(move || {
        for _ in 0..3 {
            let (socket, _) = listener.accept().unwrap();
            let mut stream = BufReader::new(StreamOwned::new(
                ServerConnection::new(config.clone()).unwrap(),
                ServerIo::new(socket),
            ));
            let request: Request =
                serde_json::from_slice(&crate::server::line(&mut stream, MAX_REQUEST).unwrap())
                    .unwrap();
            assert!(request.keep_alive);
            // The previous protocol had no reuse acknowledgement and closed here.
            crate::server::send(
                stream.get_mut(),
                &Response {
                    version: 1,
                    id: request.id,
                    result: Some(serde_json::json!({ "old": true })),
                    error: None,
                },
                MAX_RESPONSE,
            )
            .unwrap();
        }
    });
    let pool = Pool::default();
    for _ in 0..3 {
        assert_eq!(
            pool.call(
                address,
                identity.cert.der(),
                Payload::Call {
                    device: "fixture".into(),
                    token: "fixture".into(),
                    action: Action::Ping,
                }
            )
            .unwrap()["old"],
            true
        );
        assert_eq!(pool.idle_count(), 0);
    }
    host.join().unwrap();
}

#[test]
fn failed_response_is_not_replayed_and_does_not_poison_the_next_request() {
    let identity = rcgen::generate_simple_self_signed(vec!["emdeck.internal".into()]).unwrap();
    let config = server(identity.cert.der(), &identity.signing_key.serialize_der()).unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let host = thread::spawn(move || {
        let (socket, _) = listener.accept().unwrap();
        let mut stream = BufReader::new(StreamOwned::new(
            ServerConnection::new(config.clone()).unwrap(),
            ServerIo::new(socket),
        ));
        let first: Request =
            serde_json::from_slice(&crate::server::line(&mut stream, MAX_REQUEST).unwrap())
                .unwrap();
        assert!(matches!(
            first.payload,
            Payload::Call {
                action: Action::Input { .. },
                ..
            }
        ));
        // Input may have been accepted when the connection dies before its reply.
        drop(stream);
        let (socket, _) = listener.accept().unwrap();
        let mut stream = BufReader::new(StreamOwned::new(
            ServerConnection::new(config).unwrap(),
            ServerIo::new(socket),
        ));
        let next: Request =
            serde_json::from_slice(&crate::server::line(&mut stream, MAX_REQUEST).unwrap())
                .unwrap();
        assert!(matches!(
            next.payload,
            Payload::Call {
                action: Action::Ping,
                ..
            }
        ));
        crate::server::send(
            stream.get_mut(),
            &Response {
                version: 1,
                id: next.id,
                result: Some(serde_json::Value::Null),
                error: None,
            },
            MAX_RESPONSE,
        )
        .unwrap();
    });
    let pool = Pool::default();
    let payload = |action| Payload::Call {
        device: "fixture".into(),
        token: "fixture".into(),
        action,
    };
    assert!(pool
        .call(
            address,
            identity.cert.der(),
            payload(Action::Input {
                id: "pane".into(),
                client: "view".into(),
                text: "submit\r".into(),
            })
        )
        .is_err());
    assert_eq!(pool.idle_count(), 0);
    assert!(pool
        .call(address, identity.cert.der(), payload(Action::Ping))
        .is_ok());
    host.join().unwrap();
}
