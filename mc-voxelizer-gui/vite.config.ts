import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
    plugins: [react()],
    resolve: {
        alias: {"@": path.resolve(__dirname, "./src")},
    },
    // Vite options tailored for Tauri development:
    // prevent Vite from obscuring Rust errors
    clearScreen: false,
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {protocol: "ws", host, port: 1421}
            : undefined,
        watch: {
            // tell Vite to ignore watching src-tauri
            ignored: ["**/src-tauri/**"],
        },
    },
}));
