use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

const LOOPBACK_HOST: &str = "127.0.0.1";
const TEST_ROOT_ENVIRONMENT: &str = "LIFEOS_TEST_ROOT";

struct WritablePaths {
    local_data: PathBuf,
    config: PathBuf,
    logs: PathBuf,
}

fn test_writable_paths(root: &Path) -> Result<WritablePaths, Box<dyn std::error::Error>> {
    if !root.is_absolute() {
        return Err("LIFEOS_TEST_ROOT muss ein absoluter Pfad sein.".into());
    }
    Ok(WritablePaths {
        local_data: root.join("app-data"),
        config: root.join("config"),
        logs: root.join("logs"),
    })
}

fn create_private_directory(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    std::fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

fn reserve_loopback_port() -> Result<u16, Box<dyn std::error::Error>> {
    let listener = TcpListener::bind((LOOPBACK_HOST, 0))?;
    Ok(listener.local_addr()?.port())
}

fn readiness_succeeds(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(200)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(300)));
    if stream
        .write_all(
            b"GET /api/v1/readiness HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
        )
        .is_err()
    {
        return false;
    }

    let mut response = String::new();
    stream.read_to_string(&mut response).is_ok() && response.starts_with("HTTP/1.1 200")
}

fn wait_for_readiness(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if readiness_succeeds(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(100));
    }
    false
}

fn append_log_line(path: &Path, line: &[u8]) -> std::io::Result<()> {
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    file.write_all(line)?;
    if !line.ends_with(b"\n") {
        file.write_all(b"\n")?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

fn terminate_sidecar(child: CommandChild) {
    #[cfg(unix)]
    {
        let result = unsafe { libc::kill(child.pid() as i32, libc::SIGTERM) };
        if result == 0 {
            return;
        }
    }
    let _ = child.kill();
}

fn resource_path(root: &Path, relative: &str) -> PathBuf {
    root.join(relative)
}

pub fn run() {
    let sidecar_process: Arc<Mutex<Option<CommandChild>>> = Arc::new(Mutex::new(None));
    let shutting_down = Arc::new(AtomicBool::new(false));
    let startup_complete = Arc::new(AtomicBool::new(false));
    let process_for_setup = Arc::clone(&sidecar_process);
    let process_for_exit = Arc::clone(&sidecar_process);
    let shutdown_for_setup = Arc::clone(&shutting_down);
    let shutdown_for_exit = Arc::clone(&shutting_down);
    let startup_for_setup = Arc::clone(&startup_complete);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            let setup_result = (|| -> Result<(), Box<dyn std::error::Error>> {
                let paths = match std::env::var_os(TEST_ROOT_ENVIRONMENT) {
                    Some(root) => test_writable_paths(Path::new(&root))?,
                    None => WritablePaths {
                        local_data: app.path().app_local_data_dir()?,
                        config: app.path().app_config_dir()?,
                        logs: app.path().app_log_dir()?,
                    },
                };
                let local_data = paths.local_data;
                let data_directory = local_data.join("data");
                let documents_directory = local_data.join("documents");
                let backups_directory = local_data.join("backups");
                let config_directory = paths.config;
                let log_directory = paths.logs;
                let log_path = log_directory.join("lifeos-api.log");
                create_private_directory(&local_data)?;
                create_private_directory(&data_directory)?;
                create_private_directory(&documents_directory)?;
                create_private_directory(&backups_directory)?;
                create_private_directory(&config_directory)?;
                create_private_directory(&log_directory)?;

                let resource_directory = app.path().resource_dir()?;
                let server_path = resource_path(&resource_directory, "server/server.js");
                let web_path = resource_path(&resource_directory, "web");
                let migration_path = resource_path(&resource_directory, "sqlite-migrations");
                let database_path = data_directory.join("lifeos.sqlite");
                let port = reserve_loopback_port()?;
                let origin = format!("http://{LOOPBACK_HOST}:{port}");
                let database_url = format!("file:{}", database_path.display());

                let sidecar_command = app
                    .shell()
                    .sidecar("lifeos-node")?
                    .arg(server_path)
                    .env("NODE_ENV", "production")
                    .env("API_HOST", LOOPBACK_HOST)
                    .env("API_PORT", port.to_string())
                    .env("DATABASE_URL", database_url)
                    .env("WEB_ORIGIN", &origin)
                    .env("WEB_DIST_PATH", web_path)
                    .env("SQLITE_MIGRATIONS_PATH", migration_path)
                    .env("LOG_LEVEL", "info")
                    .env("SHUTDOWN_TIMEOUT_MS", "5000")
                    .env("SESSION_TTL_HOURS", "24");
                let (mut events, child) = sidecar_command.spawn()?;
                *process_for_setup.lock().expect("Sidecar-Sperre beschädigt") = Some(child);

                let app_handle = app.handle().clone();
                let shutdown_for_monitor = Arc::clone(&shutdown_for_setup);
                let startup_for_monitor = Arc::clone(&startup_for_setup);
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = events.recv().await {
                        match event {
                            CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                                let _ = append_log_line(&log_path, &line);
                            }
                            CommandEvent::Error(error) => {
                                let _ = append_log_line(&log_path, error.as_bytes());
                            }
                            CommandEvent::Terminated(payload) => {
                                if startup_for_monitor.load(Ordering::SeqCst)
                                    && !shutdown_for_monitor.load(Ordering::SeqCst)
                                {
                                    let hint = payload
                                        .code
                                        .map(|code| format!(" (Code {code})"))
                                        .unwrap_or_default();
                                    app_handle
                                        .dialog()
                                        .message(format!(
                                            "Der lokale LifeOS-Server wurde unerwartet beendet{hint}. Vorhandene Daten wurden nicht gelöscht. Bitte starte die App erneut."
                                        ))
                                        .kind(MessageDialogKind::Error)
                                        .title("LifeOS-Server beendet")
                                        .show(|_| {});
                                }
                                break;
                            }
                            _ => {}
                        }
                    }
                });

                if !wait_for_readiness(port, Duration::from_secs(15)) {
                    if let Some(child) = process_for_setup
                        .lock()
                        .expect("Sidecar-Sperre beschädigt")
                        .take()
                    {
                        terminate_sidecar(child);
                    }
                    return Err("Der lokale Server wurde nicht rechtzeitig bereit.".into());
                }

                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(origin.parse()?))
                    .title("Anton Life OS")
                    .inner_size(1280.0, 820.0)
                    .min_inner_size(880.0, 620.0)
                    .build()?;
                startup_for_setup.store(true, Ordering::SeqCst);

                Ok(())
            })();

            if let Err(error) = &setup_result {
                app.dialog()
                    .message(format!(
                        "LifeOS konnte den lokalen Server nicht starten. Vorhandene Daten wurden nicht verändert. Bitte starte die App erneut.\n\nTechnischer Hinweis: {error}"
                    ))
                    .kind(MessageDialogKind::Error)
                    .title("LifeOS konnte nicht starten")
                    .blocking_show();
            }

            setup_result
        })
        .build(tauri::generate_context!())
        .expect("LifeOS konnte nicht initialisiert werden")
        .run(move |_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                shutdown_for_exit.store(true, Ordering::SeqCst);
                if let Some(child) = process_for_exit
                    .lock()
                    .expect("Sidecar-Sperre beschädigt")
                    .take()
                {
                    terminate_sidecar(child);
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reserviert_einen_loopback_port() {
        let port = reserve_loopback_port().expect("Portreservierung fehlgeschlagen");
        assert!(port > 0);
    }

    #[test]
    fn bildet_ressourcenpfade_ohne_feste_installationsadresse() {
        let root = Path::new("/Applications/LifeOS.app/Contents/Resources");
        assert_eq!(
            resource_path(root, "server/server.js"),
            root.join("server/server.js")
        );
    }

    #[test]
    fn trennt_installationstestdaten_von_echten_app_daten() {
        let root = Path::new("/tmp/lifeos-installation-test");
        let paths = test_writable_paths(root).expect("Testpfade fehlen");
        assert_eq!(paths.local_data, root.join("app-data"));
        assert_eq!(paths.config, root.join("config"));
        assert_eq!(paths.logs, root.join("logs"));
        assert!(test_writable_paths(Path::new("relativ")).is_err());
    }

    #[test]
    fn schreibt_lokale_logs_mit_privaten_dateirechten() {
        let directory =
            std::env::temp_dir().join(format!("lifeos-desktop-log-test-{}", std::process::id()));
        std::fs::create_dir_all(&directory).expect("Testverzeichnis fehlt");
        let log_path = directory.join("lifeos-api.log");

        append_log_line(&log_path, b"synthetischer Start")
            .expect("Logzeile konnte nicht geschrieben werden");
        assert_eq!(
            std::fs::read_to_string(&log_path).expect("Logdatei fehlt"),
            "synthetischer Start\n"
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&log_path)
                    .expect("Logdatei fehlt")
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }

        std::fs::remove_dir_all(directory).expect("Testverzeichnis blieb zurück");
    }
}
