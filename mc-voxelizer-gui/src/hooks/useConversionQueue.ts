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

    // ── Start a single conversion ────────────────────────────────────────────

    const runFile = useCallback(async (fileId: string) => {
        const {
            files, preferences, addLogLine, setStatus, setPid, setProgress,
            setElapsed, finishFile, advanceQueue
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
        setProgress(fileId, 0);
        startTimeRef.current = Date.now();

        // Elapsed timer
        timerRef.current = setInterval(() => {
            setElapsed(fileId, Date.now() - startTimeRef.current);
        }, 500);

        addLogLine(fileId, {
            timestamp: new Date(),
            level: "info",
            text: `> mc_voxelizer ${args.join(" ")}`,
        });

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

                // The C++ binary ends with "Press Enter to exit..." — reply with \n
                if (isPausePrompt(line) && childRef.current) {
                    try {
                        await childRef.current.write("\n");
                    } catch {
                        // ignore — process may have already exited
                    }
                }
            });

            // stderr handler (warnings / errors from the binary)
            command.stderr.on("data", (line: string) => {
                useAppStore.getState().addLogLine(fileId, {
                    timestamp: new Date(),
                    level: "warning",
                    text: line,
                });
            });

            // Process exit handler
            command.on("close", (data: { code: number | null }) => {
                if (timerRef.current) clearInterval(timerRef.current);
                const elapsed = Date.now() - startTimeRef.current;
                useAppStore.getState().setElapsed(fileId, elapsed);

                const success = data.code === 0;
                const outputJson = success
                    ? `${outDir}/${file.settings.modelName}.json`
                    : undefined;
                const outputPng = success
                    ? `${outDir}/${file.settings.modelName}.png`
                    : undefined;

                finishFile(fileId, success, outputJson, outputPng);
                childRef.current = null;

                // Advance to next file in queue
                const nextId = advanceQueue();
                if (nextId) runFile(nextId);
            });

            command.on("error", (err: string) => {
                if (timerRef.current) clearInterval(timerRef.current);
                useAppStore.getState().addLogLine(fileId, {
                    timestamp: new Date(),
                    level: "error",
                    text: `Process error: ${err}`,
                });
                finishFile(fileId, false);
                childRef.current = null;
                const nextId = advanceQueue();
                if (nextId) runFile(nextId);
            });

            const child = await command.spawn();
            childRef.current = child;
            setPid(fileId, child.pid);

        } catch (err) {
            if (timerRef.current) clearInterval(timerRef.current);
            addLogLine(fileId, {
                timestamp: new Date(),
                level: "error",
                text: `Failed to launch binary: ${String(err)}`,
            });
            finishFile(fileId, false);
            childRef.current = null;
            const nextId = advanceQueue();
            if (nextId) runFile(nextId);
        }
    }, []);

    // ── Watch the queue and auto-start ──────────────────────────────────────

    useEffect(() => {
        const unsub = useAppStore.subscribe((state) => {
            // If nothing is active but queue has items, advance
            if (state.activeId === null && state.conversionQueue.length > 0) {
                const nextId = state.advanceQueue();
                if (nextId) runFile(nextId);
            }
        });
        return unsub;
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
        if (childRef.current) {
            try {
                await childRef.current.kill();
            } catch {
                // ignore
            }
            childRef.current = null;
        }
        if (timerRef.current) clearInterval(timerRef.current);
    }, []);

    return {killActive, pauseActive, resumeActive};
}
