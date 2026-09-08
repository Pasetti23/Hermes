// Desktop shell entry point.
//
// IMPORTANT CAVEAT (read before shipping):
// This app has server-side API routes (`app/api/ai/completion`, Edge
// runtime, streaming, and secret API keys) — it cannot be exported as a
// static site. In `tauri dev`, Tauri's `devUrl` simply points at the normal
// `next dev` server (started via `beforeDevCommand`), so the release-only
// server-spawning logic below never runs there.
//
// In a production build, something has to actually run that server on the
// end user's machine. This spawns the Next.js **standalone** build
// (`resources/standalone/server.js`, produced by `next build` with
// `NEXT_OUTPUT=standalone` and copied into place by
// `scripts/copy-standalone-to-tauri.mjs`) using the `node` binary already
// on the user's PATH. That means: **this build currently requires Node.js
// to be installed on the target machine** — it is not yet a fully
// dependency-free native binary. Bundling a self-contained Node runtime as
// a proper Tauri `externalBin` sidecar (so end users need nothing
// preinstalled) is the natural next step; it was left out here because it
// requires downloading and pinning platform-specific Node distributables,
// which isn't something that could be produced or verified in this
// environment.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::File;
use std::io::Write;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

struct ServerProcess(Mutex<Option<Child>>);

const APP_TITLE: &str = "𝓗𝓔𝓡𝓜𝓔𝓢";
const DEV_URL: &str = "http://localhost:3000";
const SERVER_PORT: u16 = 3000;
const SERVER_HOST: &str = "127.0.0.1";
const READY_TIMEOUT: Duration = Duration::from_secs(15);
const READY_POLL_INTERVAL: Duration = Duration::from_millis(150);

// Tells CreateProcess on Windows to never allocate a console for the child
// at all — not "create one and hide it", just never create one. This is
// what stops the black CMD-style window from flashing on screen. See the
// long comment on `spawn_node_server` for why this has to be paired with
// explicit stdio redirection, not used on its own.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn standalone_server_path(resource_dir: &Path) -> PathBuf {
    resource_dir.join("standalone").join("server.js")
}

fn log_dir() -> PathBuf {
    std::env::temp_dir()
}

/// Every release-mode failure path funnels through here instead of
/// `.expect()`/`panic!()`. Release builds run with
/// `windows_subsystem = "windows"` (no console window), so a panic message
/// goes nowhere the user or a developer helping them can see — this at
/// least leaves a paper trail next to the executable.
fn log_line(message: &str) {
    eprintln!("[canvas] {message}");

    let log_path = log_dir().join("canvas-server.log");
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
        let _ = writeln!(file, "[{:?}] {message}", std::time::SystemTime::now());
    }
}

/// Opens (create-or-append) the file Node's own stdout/stderr get
/// redirected into, kept separate from `canvas-server.log` (which is only
/// ever written to by this Rust process) so the two don't interleave and
/// Node's raw output — which is exactly what would explain a silent crash
/// like "starts, dies around 100ms" — is easy to find on its own.
fn open_node_log_file() -> std::io::Result<File> {
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir().join("canvas-node.log"))
}

enum ReadyOutcome {
    Ready,
    ProcessExited(ExitStatus),
    TimedOut,
}

/// Blocks the calling thread, polling `127.0.0.1:SERVER_PORT` until it
/// accepts a TCP connection, `READY_TIMEOUT` elapses, or — critically — the
/// child process exits on its own first. That last case is what actually
/// matters for this bug report: previously, if Node died at ~100ms, this
/// function had no way to notice and just kept polling a dead process for
/// the full 15-second timeout before giving up with a generic "didn't
/// respond in time" message. Checking `child.try_wait()` on every poll
/// means a crash gets detected on the very next tick (≤150ms later) and
/// reported with the actual exit status, pointing straight at
/// `canvas-node.log` for the real reason instead of a vague timeout.
fn wait_for_server_ready(child: &mut Child) -> ReadyOutcome {
    let deadline = Instant::now() + READY_TIMEOUT;
    while Instant::now() < deadline {
        if TcpStream::connect((SERVER_HOST, SERVER_PORT)).is_ok() {
            return ReadyOutcome::Ready;
        }

        match child.try_wait() {
            Ok(Some(status)) => return ReadyOutcome::ProcessExited(status),
            Ok(None) => {} // still running — keep polling
            Err(e) => log_line(&format!("child.try_wait() itself failed: {e}")),
        }

        std::thread::sleep(READY_POLL_INTERVAL);
    }
    ReadyOutcome::TimedOut
}

/// Spawns `node <server_entry>` with the port/host it should bind to.
///
/// Windows-specific fixes baked in here (this is the actual fix for this
/// report — flashing black console + Node dying near-instantly):
///
/// - **`creation_flags(CREATE_NO_WINDOW)`**: when a GUI-subsystem process
///   (no console of its own — this app in release mode) spawns a console
///   subprocess without this flag, Windows allocates a brand-new console
///   window for that child. That's the black window that flashes on
///   screen.
/// - **Explicit `.stdout()`/`.stderr()` redirection**: this is the part
///   that actually explains Node *dying*, not just the console flashing.
///   `std::process::Command` inherits the parent's stdio handles by
///   default. This app's parent process (GUI subsystem, no console) has no
///   valid console/stdio handles to inherit in the first place — so Node
///   starts up, immediately tries to write its normal startup log lines to
///   an inherited stdout handle that isn't backed by anything real, and
///   dies. Explicitly redirecting both streams to `canvas-node.log`
///   sidesteps handle inheritance entirely and, as a bonus, actually
///   captures Node's own output for debugging instead of throwing it away.
/// - **`current_dir(...)`**: set explicitly to the server's own folder,
///   since a desktop app launched by double-click (rather than from a
///   terminal) gets an unpredictable OS-assigned working directory.
/// - `Command::new("node")` on Windows resolves **only** a literal
///   `node.exe` on PATH — unlike typing `node ...` into `cmd.exe`, Rust's
///   `Command` does not consult `PATHEXT` or resolve `.cmd`/`.bat` shims
///   some Node version managers use. Direct `node.exe` is tried first,
///   falling back to routing through `cmd.exe` (which does understand
///   those shims) if that fails — both paths get the same
///   no-window/redirected-stdio treatment.
fn spawn_node_server(server_entry: &Path) -> std::io::Result<Child> {
    let working_dir = server_entry.parent().unwrap_or_else(|| Path::new("."));

    #[cfg(target_os = "windows")]
    {
        let stdout_file = open_node_log_file()?;
        let stderr_file = stdout_file.try_clone()?;

        let direct = Command::new("node.exe")
            .arg("server.js")
            .current_dir(working_dir)
            .env("PORT", SERVER_PORT.to_string())
            .env("HOSTNAME", SERVER_HOST)
            .env("NODE_ENV", "production")
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .stdout(Stdio::from(stdout_file))
            .stderr(Stdio::from(stderr_file))
            .spawn();

        match direct {
            Ok(child) => Ok(child),
            Err(direct_err) => {
                log_line(&format!(
                    "node.exe spawn failed ({direct_err}); retrying via cmd.exe in case Node is only on PATH as a shim"
                ));

                let stdout_file = open_node_log_file()?;
                let stderr_file = stdout_file.try_clone()?;

                Command::new("cmd")
                    .args(["/C", "node", "server.js"])
                    .current_dir(working_dir)
                    .env("PORT", SERVER_PORT.to_string())
                    .env("HOSTNAME", SERVER_HOST)
                    .env("NODE_ENV", "production")
                    .creation_flags(CREATE_NO_WINDOW)
                    .stdin(Stdio::null())
                    .stdout(Stdio::from(stdout_file))
                    .stderr(Stdio::from(stderr_file))
                    .spawn()
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let stdout_file = open_node_log_file()?;
        let stderr_file = stdout_file.try_clone()?;

        Command::new("node")
            .arg("server.js")
            .current_dir(working_dir)
            .env("PORT", SERVER_PORT.to_string())
            .env("HOSTNAME", SERVER_HOST)
            .env("NODE_ENV", "production")
            .stdin(Stdio::null())
            .stdout(Stdio::from(stdout_file))
            .stderr(Stdio::from(stderr_file))
            .spawn()
    }
}

/// Kills the tracked Node child process, if any. Takes the already-resolved
/// `ServerProcess` state rather than an `AppHandle`, and binds the lock
/// guard to a name before matching on it — inlining
/// `app.state::<ServerProcess>().0.lock().unwrap().take()` as a single
/// chained expression is exactly what produces the
/// "temporary value dropped while borrowed" / "does not live long enough"
/// borrow-checker error: the intermediate `State<...>` and `MutexGuard<...>`
/// are temporaries whose lifetime doesn't reliably extend through a
/// multi-step chained borrow. Naming each step sidesteps that entirely.
fn kill_server_process(state: &ServerProcess) {
    let mut guard = state.0.lock().unwrap();
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
    }
}

fn show_fatal_error(app: &tauri::AppHandle, message: &str) {
    log_line(message);
    app.dialog()
        .message(message)
        .title(APP_TITLE)
        .kind(MessageDialogKind::Error)
        .blocking_show();
}

fn open_main_window(app: &tauri::AppHandle, url_str: &str) -> tauri::Result<()> {
    let url = url::Url::parse(url_str).expect("window URL must be valid");
    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        .title(APP_TITLE)
        .inner_size(1280.0, 800.0)
        .min_inner_size(960.0, 640.0)
        .build()?;
    Ok(())
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();

            #[cfg(debug_assertions)]
            {
                // Dev: `beforeDevCommand` already started `next dev`, and the
                // Tauri CLI already waited for `devUrl` to respond before
                // even launching this binary — no readiness race to guard
                // against here, so just open the window immediately.
                open_main_window(&handle, DEV_URL)?;
            }

            #[cfg(not(debug_assertions))]
            {
                let resource_dir = match app.path().resource_dir() {
                    Ok(dir) => dir,
                    Err(e) => {
                        show_fatal_error(&handle, &format!("Failed to resolve bundled resources: {e}"));
                        return Ok(());
                    }
                };
                let server_entry = standalone_server_path(&resource_dir);

                if !server_entry.exists() {
                    show_fatal_error(
                        &handle,
                        &format!(
                            "No se encontró el servidor en {server_entry:?}. \
                             ¿Corrió `beforeBuildCommand` (npx cross-env NEXT_OUTPUT=standalone npm run build \
                             && node scripts/copy-standalone-to-tauri.mjs) antes de empaquetar?"
                        ),
                    );
                    return Ok(());
                }

                let mut child = match spawn_node_server(&server_entry) {
                    Ok(child) => child,
                    Err(e) => {
                        show_fatal_error(
                            &handle,
                            &format!("No se pudo iniciar el servidor de Node.js: {e}. ¿Node.js está instalado y en el PATH?"),
                        );
                        return Ok(());
                    }
                };

                // This is the fix for ERR_CONNECTION_REFUSED: the window is
                // only ever created *after* this call returns `Ready`, so it
                // can never navigate to the server before the socket is
                // actually listening. It's also now able to notice the
                // child dying instead of just timing out uselessly for 15s.
                match wait_for_server_ready(&mut child) {
                    ReadyOutcome::Ready => {
                        app.state::<ServerProcess>().0.lock().unwrap().replace(child);
                        open_main_window(&handle, &format!("http://{SERVER_HOST}:{SERVER_PORT}"))?;
                    }
                    ReadyOutcome::ProcessExited(status) => {
                        show_fatal_error(
                            &handle,
                            &format!(
                                "El servidor de Node.js se cerró inesperadamente ({status}) antes de responder. \
                                 Revisá canvas-node.log junto al ejecutable para ver la salida real de Node."
                            ),
                        );
                    }
                    ReadyOutcome::TimedOut => {
                        log_line("El servidor no respondió dentro del tiempo límite; se abre la ventana de todas formas.");
                        app.state::<ServerProcess>().0.lock().unwrap().replace(child);
                        open_main_window(&handle, &format!("http://{SERVER_HOST}:{SERVER_PORT}"))?;
                    }
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                let app_handle = window.app_handle();
                let state = app_handle.state::<ServerProcess>();
                kill_server_process(&state);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building the Canvas desktop shell");

    app.run(|app_handle, event| {
        // Belt-and-suspenders alongside the `Destroyed` handler above:
        // `RunEvent::Exit` fires right before the process actually
        // terminates on every platform/exit path, including ones that skip
        // `WindowEvent::Destroyed` or bypass normal Rust unwinding (where a
        // `Drop` impl would never have run). This is the reliable place to
        // guarantee the sidecar Node process doesn't linger.
        if let RunEvent::Exit = event {
            let state = app_handle.state::<ServerProcess>();
            kill_server_process(&state);
        }
    });
}
