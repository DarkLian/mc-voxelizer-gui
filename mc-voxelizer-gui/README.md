# Minecraft Voxelizer GUI

A Tauri-based desktop GUI for `mc_voxelizer`. Wraps the CLI binary in a
queue-based conversion interface with per-file settings, live log streaming,
pause/resume, and batch editing.

---

## For Users

Users download and run a **single installer** — nothing else is needed.

```
Minecraft Voxelizer_1.3.0_x64-setup.exe    (~10 MB)
```

This installer bundles everything: the GUI window, the WebView2 runtime
(already on Windows 11), and the `mc_voxelizer` conversion binary. After
installing, a Start Menu entry and desktop shortcut are created. No terminal,
no dependencies, no extra files.

Everything below this line is for **developers only**.

---

## Developer Prerequisites

Install these once on your Windows 11 machine:

| Tool                  | Download                                                   | Notes                                          |
|-----------------------|------------------------------------------------------------|------------------------------------------------|
| Node.js 20+           | https://nodejs.org                                         | Use the LTS version                            |
| Rust (stable)         | https://rustup.rs                                          | Run `rustup update stable` after               |
| VS Build Tools        | https://visualstudio.microsoft.com/visual-cpp-build-tools/ | Select "Desktop development with C++" workload |
| CLion                 | https://www.jetbrains.com/clion/                           | Recommended IDE                                |
| Rust plugin for CLion | CLion → Settings → Plugins → search "Rust"                 | JetBrains official plugin                      |

> WebView2 is already installed on Windows 11 — nothing to do.

After installing Rust, verify the MSVC target is present:

```
rustup target list --installed
# Should include: x86_64-pc-windows-msvc
```

---

## Project Structure

```
mc-voxelizer-gui/                  ← developer source, never distributed
  src/                             ← React/TypeScript UI code
    components/                    ← UI components
    hooks/                         ← useConversionQueue (spawns the binary)
    store/                         ← Zustand global state
    types/                         ← TypeScript types
    utils/                         ← path helpers, log parser
    App.tsx
    main.tsx
    index.css
  src-tauri/
    binaries/                      ← PUT YOUR CLI BINARY HERE (see below)
    capabilities/default.json      ← Tauri security/permission config
    src/
      lib.rs                       ← Rust commands (pause/resume, open folder)
      main.rs
    tauri.conf.json                ← app name, window size, bundled binary
    Cargo.toml
  package.json
  tailwind.config.js
  vite.config.ts
  tsconfig.json
  index.html
```

---

## Opening in CLion

1. Open CLion and choose **File → Open**, then select the `mc-voxelizer-gui` folder.
2. CLion will detect both `package.json` (React side) and `Cargo.toml` (Rust side) and configure them automatically.
3. Install the **Rust plugin** if prompted (or go to **Settings → Plugins → Marketplace**, search "Rust", install the
   JetBrains plugin). This gives you full autocomplete and error highlighting for `lib.rs`.
4. For npm commands, use CLion's built-in terminal (**Alt+F12**) or add an npm run configuration via **Run → Edit
   Configurations → + → npm**.

---

## Setup (one-time, after cloning)

### Step 1 — Copy the CLI binary

Build your C++ project in Release mode (`mc_voxelizer-v1.3.0.exe`), then copy
it into the GUI project and **add the target triple suffix** to the filename:

```
cp path\to\build\bin\mc_voxelizer-v1.3.0.exe ^
   src-tauri\binaries\mc_voxelizer-v1.3.0-x86_64-pc-windows-msvc.exe
```

The `-x86_64-pc-windows-msvc` suffix is **required** — Tauri uses it to locate
the binary at runtime. The binary itself can be MinGW-compiled; only the
filename needs this suffix.

### Step 2 — Install npm dependencies

In the CLion terminal (Alt+F12), from the `mc-voxelizer-gui` folder:

```
npm install
```

### Step 3 — Generate app icons

Tauri requires icon files in `src-tauri/icons/`. Provide a 1024×1024 PNG of
your app icon and run:

```
npm run tauri icon path\to\icon.png
```

This auto-generates all required sizes (`32x32.png`, `128x128.png`, `icon.ico`,
etc.).

---

## Running in Development

```
npm run tauri dev
```

Opens a live window. Changes to files in `src/` (React/TypeScript) apply
instantly via hot reload. Changes to `src-tauri/src/` (Rust) trigger an
automatic recompile — CLion shows the Rust errors inline.

---

## Building the Installer

```
npm run tauri build
```

Output goes to `src-tauri/target/release/bundle/`:

```
nsis\Minecraft Voxelizer_1.3.0_x64-setup.exe   ← main installer
msi\Minecraft Voxelizer_1.3.0_x64_en-US.msi    ← alternative MSI format
```

Both formats bundle the CLI binary automatically. Either can be distributed
to users — they contain everything needed with no external dependencies.

---

## Updating to a New Binary Version (e.g. v1.4.0)

1. Build the new binary.
2. Copy to `src-tauri/binaries/mc_voxelizer-v1.4.0-x86_64-pc-windows-msvc.exe`.
3. Delete the old binary from `binaries/`.
4. Update `tauri.conf.json` → `bundle.externalBin`:
   ```json
   "externalBin": ["binaries/mc_voxelizer-v1.4.0"]
   ```
5. Update `src/hooks/useConversionQueue.ts` → `SIDECAR_NAME`:
   ```ts
   const SIDECAR_NAME = "binaries/mc_voxelizer-v1.4.0";
   ```
6. Update `src-tauri/capabilities/default.json` → the shell permission name.
7. Run `npm run tauri build`.

---

## Keyboard Shortcuts

| Shortcut     | Action            |
|--------------|-------------------|
| `Ctrl+O`     | Add files         |
| `Ctrl+Enter` | Convert selected  |
| `Ctrl+A`     | Select all        |
| `Escape`     | Deselect all      |
| `Ctrl+L`     | Toggle log drawer |
| `Ctrl+,`     | Open preferences  |

---

## Architecture Notes

- **Frontend**: React 18 + TypeScript + Tailwind CSS + Zustand (state management)
- **Backend**: Tauri v2 (Rust) — minimal glue; handles process suspend/resume
  (Windows API) and open-in-Explorer commands only
- **Conversion**: `useConversionQueue.ts` spawns `mc_voxelizer` as a Tauri
  sidecar, streams stdout line-by-line into the log panel, and maps stage
  prefixes (`[Voxelizer]`, `[TextureAtlas]`, etc.) to progress percentages
- **Pause/Resume**: Uses `SuspendThread`/`ResumeThread` via the Windows
  Toolhelp32 snapshot API (Rust `windows` crate) — freezes the process
  mid-conversion and resumes exactly where it left off
- **"Press Enter to exit"**: The C++ binary ends with `pauseConsole()` which
  blocks on stdin. The hook detects this line in stdout and writes `\n` to the
  child's stdin automatically so the process exits cleanly

---

## Troubleshooting

**"Failed to launch binary"** in the log panel — check that your binary is in
`src-tauri/binaries/` with the exact filename
`mc_voxelizer-v1.3.0-x86_64-pc-windows-msvc.exe`.

**Blank white window on startup** — WebView2 failed to initialise. This
shouldn't happen on Windows 11. If it does, download the WebView2 runtime from
https://developer.microsoft.com/en-us/microsoft-edge/webview2/.

**Conversion runs but log shows no output** — open the log drawer (Ctrl+L).
The binary's stdout is streamed verbatim; any error from the C++ side appears
there.

**Window has no title bar buttons** — the app uses a custom title bar
(`decorations: false`). Drag the top bar to move the window; use the Windows
taskbar right-click menu to close it. To add custom close/minimise/maximise
buttons, edit the titlebar div in `src/App.tsx`.

**CLion shows Rust errors in lib.rs** — install the JetBrains Rust plugin
(**Settings → Plugins → Marketplace → "Rust"**) and wait for initial indexing
to finish. This can take a minute on first open.

**`npm` not found in CLion terminal** — CLion may not inherit your system PATH.
Close and reopen CLion after installing Node.js, or set the Node interpreter
path in **Settings → Languages & Frameworks → Node.js**.
