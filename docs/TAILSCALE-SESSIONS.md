# Connect Emdeck over Tailscale

The experimental session server supports direct connections between Windows,
macOS and Linux. Both computers need a build containing this feature. Tailscale
provides network connectivity; Emdeck provides the terminal server, TLS and
device authentication. This connection does not require OpenSSH, Supabase or
router port forwarding.

## Share your desktop

1. Install and connect
   [Tailscale](https://tailscale.com/docs/how-to/connect-to-devices) on both
   computers. Your tailnet policy must permit the laptop to reach the desktop's
   sharing port. Keep the desktop awake and connected.
2. In Emdeck on the desktop, select **Background sessions** from the terminal
   view menu, then **Connect local server**.
3. Open **Machine settings** under **This computer**, then expand **Share this
   computer over Tailscale**. Enter the desktop's Tailscale IPv4 address,
   visible in Tailscale or from `tailscale ip -4`. The default TCP port is
   `48192`.
4. Select **Enable sharing**. Emdeck binds only that address, never all network
   interfaces. If the OS firewall blocks connections, add a rule for this port
   restricted to the laptop's Tailscale address. Emdeck does not alter firewall
   rules, install Tailscale or change your tailnet policy.
5. Select **Create pairing code**. Copy it privately to your laptop. It expires
   after ten minutes and can be used once. Creating a new code replaces the
   previous code; disabling sharing or restarting the server cancels it.

For unattended Windows operation, see
[Tailscale's unattended mode](https://tailscale.com/docs/how-to/run-unattended).
This does not configure Emdeck to start automatically at OS boot.

## Connect your Linux laptop

1. Open **Background sessions** in Emdeck on the laptop.
2. Expand **Pair a machine over Tailscale**. Set an optional machine label such
   as `Office desktop`, and a device name such as `Linux laptop`. The desktop
   will display the device name in its access list.
3. Paste the pairing code and select **Pair machine**. Pairing grants command
   execution and access to all background workspaces and terminals owned by that
   desktop user. Pair only devices you control and trust.
4. Select **Connect** on the new machine. Its saved workspaces, agents and
   terminals appear alongside local machines. Select a terminal to attach; use
   **Take control** explicitly if another client owns its input.
5. To start another Claude or Codex session, expand **New background terminal**,
   select the paired desktop, choose a workspace or enter an absolute folder on
   that desktop, and enter `claude` or `codex`. The CLI must already be
   installed and authenticated there.

**Disconnect** in the machine's **Machine settings**, or closing the laptop IDE,
leaves the desktop's processes running. After a network interruption, select
**Connect** again. Enabled machines are remembered and reconnect when the
background view opens on a later app launch. Opening a project does not
automatically start an agent.

## Manage access

On the desktop, open the sharing controls and select **Refresh paired devices**.
**Revoke** removes one device's credential after confirmation. **Disable
sharing** closes the network listener and cancels pending pairing codes. Neither
operation stops terminals. A command already accepted for execution cannot be
undone by revocation; later requests and pending output responses are denied.

**Forget** in the laptop's **Machine settings** deletes its local saved
credential and machine profile; it does not revoke other copies of that
credential. Use **Revoke** on the desktop to invalidate access everywhere.
Re-pair after changing the desktop's Tailscale IP, sharing port or server
identity. Up to 32 devices may be paired.

Sharing and device trust persist across session-server restarts. If Tailscale is
not ready when the server starts, the sharing controls report the bind error;
connect Tailscale and select **Enable sharing** again. A malformed sharing-state
file fails closed rather than replacing trusted identities automatically.

An older running session server cannot gain this transport in place. Finish its
active sessions before stopping it and starting the updated server. Do not stop
the server while agents you need are running. Ordinary IDE terminals, tmux/cmux
sessions and provider Remote Control sessions are separate from the Emdeck
server inventory and are not adopted automatically.

## Headless hosts

Build and start `emdeck-session` as described in
[the session-server guide](PERSISTENT-AGENTS.md). Its existing `request` command
accepts the following JSON actions, each as one shell argument:

```json
{"method":"remote.manage","params":{"operation":"enable","address":"100.80.1.1","port":48192}}
{"method":"remote.manage","params":{"operation":"status"}}
{"method":"remote.manage","params":{"operation":"invite"}}
{"method":"remote.manage","params":{"operation":"revoke","id":"DEVICE_ID"}}
{"method":"remote.manage","params":{"operation":"disable"}}
```

The invite response contains a sensitive `code` and its `expiresAt` Unix time in
milliseconds. Do not publish that output. The desktop UI is the pairing client;
headless servers can host sessions without a GUI.

## Transport and storage

- Direct connections use TLS 1.3 with rustls. The invitation supplies the one
  server certificate trusted by the client. Certificate and signature checks
  remain enabled; system trust roots and trust-on-first-use are not used.
- Each request carries a device credential inside TLS. Server-side device
  secrets are stored as SHA-256 digests; invitation digests exist only in
  memory. New secrets use two random UUID v4 values, independent of the local
  capability.
- Client credentials and the server's TLS private key live in private per-user
  session storage: owner-only permissions on Unix, owner/SYSTEM ACLs on Windows.
  Browser preferences contain only an opaque credential ID and public labels.
  Pairing codes are transient UI state, cleared after submitting or closing the
  sharing controls. They are not saved in browser storage.
- Remote requests cannot change sharing settings or stop the server. Paired
  users still have full terminal command execution, so this is a trusted-device
  boundary, not a sandbox against the host user.
- Input leases are namespaced by authenticated device. Frames, device count,
  active network requests (32) and request lifetimes (40 seconds) are bounded.
  TLS handshake/request reads have a five-second inactivity timeout.
- This first direct transport accepts literal Tailscale IPv4 addresses in
  `100.64.0.0/10`. MagicDNS names, IPv6, public addresses and wildcard listeners
  are not accepted. The existing SSH adapter remains available separately.

TLS references: [rustls](https://docs.rs/rustls/0.23/rustls/) and
[rcgen](https://docs.rs/rcgen/0.14/rcgen/).
