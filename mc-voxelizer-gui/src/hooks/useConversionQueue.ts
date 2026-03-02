/**
 * useConversionQueue
 *
 * Drives the sequential conversion loop:
 *   1. Watch for a non-null advanceQueue() result.
 *   2. Spawn mc_voxelizer as a Tauri sidecar with the file's settings.
 *   3. Stream stdout/stderr into the log and update progress.
 *   4. On close, mark done/error and advance the queue again.
 *
 * Suspend/resume is handled via custom Tauri commands (Rust, Windows-only).
 */

import {useCallback, useEffect, useRef} from "react";
import {type Child, Command} from "@tauri-apps/plugin-shell";
import {invoke} from "@tauri-apps/api/core";
import {useAppStore} from "@/store/useAppStore";
import {resolveOutputDir} from "@/utils/pathUtils";
import {detectLogLevel, isPausePrompt, progressFromLine} from "@/utils/logParser";

// Name registered in tauri.conf.json  bundle.externalBin
const SIDECAR_NAME = "binaries/mc_voxelizer-v1.3.0";

export function useConversionQueue() {
    const childRef = useRef<Child | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimeRef = useRef<number>(0);
    // Track whether close/error already fired for the current file
    const finishedRef = useRef<boolean>(false);

    // ── Cleanup helper ───────────────────────────────────────────────────────

    function cleanup() {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        childRef.current = null;
        finishedRef.current = false;
    }

    // ── Start a single conversion ────────────────────────────────────────────

    const runFile = useCallback(async (fileId: string) => {
        // FIX #2: Always reset finishedRef at the start of each file.
        // Without this, the 2nd+ file sees finishedRef=true left over from the
        // previous file's finish() call, so its finish() returns immediately
        // and the file is stuck in "running" forever.
        finishedRef.current = false;

        const {
            files, preferences, addLogLine, setStatus, setPid,
            finishFile, advanceQueue
        } = useAppStore.getState();

        const file = files.find((f) => f.id === fileId);
        if (!file) return;

        const outDir = resolveOutputDir(
            file.settings.outputDir,
            file.sourcePath,
            preferences.defaultOutputMode,
            preferences.defaultOutputDir
        );

        // Build CLI arguments
        const args: string[] = [
            file.sourcePath,
            "--quality", String(file.settings.quality),
            "--output", outDir,
            "--name", file.settings.modelName,
            "--modid", file.settings.modId,
        ];
        if (file.settings.density > 0) {
            args.push("--density", String(file.settings.density));
        }
        if (file.settings.solidFill) {
            args.push("--solid");
        }

        setStatus(fileId, "running");
        startTimeRef.current = Date.now();
        timerRef.current = setInterval(() => {
            useAppStore.getState().setElapsed(fileId, Date.now() - startTimeRef.current);
        }, 1000);

        // ── stdin helper — reply to "Press Enter to exit…" ──────────────────

        async function replyEnter() {
            if (childRef.current) {
                try {
                    await childRef.current.write("\n");
                } catch { /* ignore */ }
            }
        }

        // ── Finish helper — idempotent, called by close/error/pause-prompt ──

        function finish(success: boolean, outputJson?: string, outputPng?: string) {
            if (finishedRef.current) return;
            finishedRef.current = true;
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            const elapsed = Date.now() - startTimeRef.current;
            useAppStore.getState().setElapsed(fileId, elapsed);
            finishFile(fileId, success, outputJson, outputPng);
            childRef.current = null;
            const nextId = advanceQueue();
            if (nextId) runFile(nextId);
        }

        try {
            const command = Command.sidecar(SIDECAR_NAME, args);

            // stdout handler
            command.stdout.on("data", async (line: string) => {
                const level = detectLogLevel(line);
                useAppStore.getState().addLogLine(fileId, {
                    timestamp: new Date(),
                    level,
                    text: line,
                });

                const p = progressFromLine(line);
                if (p !== null) useAppStore.getState().setProgress(fileId, p);

                // The CLI ends with pauseConsole() which prints "Press Enter to exit..."
                // with NO trailing newline — so Tauri's line-buffered stdout never delivers
                // that string. Instead we detect "Done!" (which does have a newline) and
                // immediately write \n to stdin to unblock pauseConsole(). The process then
                // exits cleanly and fires the close event with code 0.
                if (line.includes("Done!")) {
                    await replyEnter();
                }

                // Also handle isPausePrompt as a fallback in case a future CLI version
                // adds a trailing newline to the pause prompt.
                if (isPausePrompt(line)) {
                    await replyEnter();
                }
            });

            // stderr handler
            command.stderr.on("data", async (line: string) => {
                useAppStore.getState().addLogLine(fileId, {
                    timestamp: new Date(),
                    level: "warning",
                    text: line,
                });

                // Fatal error path also calls pauseConsole() — unblock it the same way
                if (line.includes("Fatal error:") || isPausePrompt(line)) {
                    await replyEnter();
                }
            });

            // Process exit handler
            command.on("close", (data: { code: number | null }) => {
                const success = data.code === 0;
                const outputJson = success
                    ? `${outDir}/${file.settings.modelName}.json`
                    : undefined;
                const outputPng = success
                    ? `${outDir}/${file.settings.modelName}.png`
                    : undefined;
                finish(success, outputJson, outputPng);
            });

            command.on("error", (err: string) => {
                useAppStore.getState().addLogLine(fileId, {
                    timestamp: new Date(),
                    level: "error",
                    text: `Process error: ${err}`,
                });
                finish(false);
            });

            const child = await command.spawn();
            childRef.current = child;
            setPid(fileId, child.pid);

        } catch (err) {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            addLogLine(fileId, {
                timestamp: new Date(),
                level: "error",
                text: `Failed to launch binary: ${String(err)}`,
            });
            finishFile(fileId, false);
            childRef.current = null;
            const nextId = advanceQueue();
            if (nextId) await runFile(nextId);
        }
    }, []);

    // ── Watch the queue and auto-start ──────────────────────────────────────

    useEffect(() => {
        return useAppStore.subscribe((state) => {
            if (state.activeId === null && state.conversionQueue.length > 0) {
                const nextId = state.advanceQueue();
                if (nextId) runFile(nextId);
            }
        });
    }, [runFile]);

    // ── Pause / resume (Windows: suspend/resume the process) ────────────────

    const pauseActive = useCallback(async () => {
        const {activeId, files, setStatus} = useAppStore.getState();
        if (!activeId) return;
        const file = files.find((f) => f.id === activeId);
        if (!file || file.status !== "running") return;

        try {
            await invoke("suspend_process", {pid: file.pid});
            setStatus(activeId, "paused");
        } catch (err) {
            console.error("Failed to suspend process:", err);
        }
    }, []);

    const resumeActive = useCallback(async () => {
        const {activeId, files, setStatus} = useAppStore.getState();
        if (!activeId) return;
        const file = files.find((f) => f.id === activeId);
        if (!file || file.status !== "paused") return;

        try {
            await invoke("resume_process", {pid: file.pid});
            setStatus(activeId, "running");
        } catch (err) {
            console.error("Failed to resume process:", err);
        }
    }, []);

    // ── Cancel ───────────────────────────────────────────────────────────────

    const killActive = useCallback(async () => {
        // FIX #5: Set finishedRef BEFORE killing so the close event that fires
        // immediately after kill() does NOT call finish() → advanceQueue() →
        // runFile(next). Without this guard, the next queued file would start
        // between killActive() and cancelAll(), making Cancel do nothing visible.
        finishedRef.current = true;

        if (childRef.current) {
            try {
                await childRef.current.kill();
            } catch { /* ignore */
            }
            childRef.current = null;
        }
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        // Do NOT reset finishedRef here. The caller (handleCancelAll in Toolbar)
        // will call cancelAll() next. finishedRef is reset at the top of the
        // next runFile() call when the user starts a new conversion.
    }, []);

    // ── Force-reset stuck conversion ─────────────────────────────────────────

    const forceReset = useCallback(async () => {
        if (childRef.current) {
            try {
                await childRef.current.kill();
            } catch { /* ignore */
            }
        }
        cleanup();
        useAppStore.getState().forceResetActive();
    }, []);

    return {killActive, pauseActive, resumeActive, forceReset};
}