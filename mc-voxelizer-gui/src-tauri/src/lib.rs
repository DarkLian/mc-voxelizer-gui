// ── Tauri commands ────────────────────────────────────────────────────────────

pub mod commands {
    use tauri::command;

    /// Open a folder in Windows Explorer.
    #[command]
    pub fn open_folder(path: String) -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open folder: {e}"))?;
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open folder: {e}"))?;
        }
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open folder: {e}"))?;
        }
        Ok(())
    }

    /// Reveal a specific file in Windows Explorer (selects it).
    #[command]
    pub fn reveal_file(path: String) -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .args(["/select,", &path])
                .spawn()
                .map_err(|e| format!("Failed to reveal file: {e}"))?;
        }
        #[cfg(not(target_os = "windows"))]
        {
            // macOS / Linux: open the containing folder
            let dir = std::path::Path::new(&path)
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or(path.clone());
            open_folder(dir)?;
        }
        Ok(())
    }

    // ── Windows-specific process suspend / resume ─────────────────────────────────

    /// Suspend all threads of a Windows process (pause).
    /// On non-Windows this is a no-op that returns Ok.
    #[command]
    pub fn suspend_process(pid: u32) -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            use windows::Win32::Foundation::CloseHandle;
            use windows::Win32::System::Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Thread32First, Thread32Next,
                THREADENTRY32, TH32CS_SNAPTHREAD,
            };
            use windows::Win32::System::Threading::{
                OpenThread, SuspendThread, THREAD_SUSPEND_RESUME,
            };

            unsafe {
                let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0)
                    .map_err(|e| format!("CreateToolhelp32Snapshot failed: {e:?}"))?;

                let mut entry = THREADENTRY32 {
                    dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
                    ..Default::default()
                };

                if Thread32First(snapshot, &mut entry).is_ok() {
                    loop {
                        if entry.th32OwnerProcessID == pid {
                            if let Ok(handle) = OpenThread(THREAD_SUSPEND_RESUME, false, entry.th32ThreadID) {
                                SuspendThread(handle);
                                let _ = CloseHandle(handle);
                            }
                        }
                        entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
                        if Thread32Next(snapshot, &mut entry).is_err() {
                            break;
                        }
                    }
                }
                let _ = CloseHandle(snapshot);
            }
        }
        Ok(())
    }

    /// Resume all suspended threads of a Windows process.
    /// On non-Windows this is a no-op that returns Ok.
    #[command]
    pub fn resume_process(pid: u32) -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            use windows::Win32::Foundation::CloseHandle;
            use windows::Win32::System::Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Thread32First, Thread32Next,
                THREADENTRY32, TH32CS_SNAPTHREAD,
            };
            use windows::Win32::System::Threading::{
                OpenThread, ResumeThread, THREAD_SUSPEND_RESUME,
            };

            unsafe {
                let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0)
                    .map_err(|e| format!("CreateToolhelp32Snapshot failed: {e:?}"))?;

                let mut entry = THREADENTRY32 {
                    dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
                    ..Default::default()
                };

                if Thread32First(snapshot, &mut entry).is_ok() {
                    loop {
                        if entry.th32OwnerProcessID == pid {
                            if let Ok(handle) = OpenThread(THREAD_SUSPEND_RESUME, false, entry.th32ThreadID) {
                                ResumeThread(handle);
                                let _ = CloseHandle(handle);
                            }
                        }
                        entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
                        if Thread32Next(snapshot, &mut entry).is_err() {
                            break;
                        }
                    }
                }
                let _ = CloseHandle(snapshot);
            }
        }
        Ok(())
    }
}

// ── App setup ─────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // Notice the `commands::` prefix here
            commands::open_folder,
            commands::reveal_file,
            commands::suspend_process,
            commands::resume_process,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}