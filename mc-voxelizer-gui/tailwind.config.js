/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            fontFamily: {
                sans: ["Outfit", "system-ui", "sans-serif"],
                mono: ["JetBrains Mono", "Consolas", "monospace"],
            },
            colors: {
                base: "#0A0A0F",
                panel: "#111117",
                card: "#16161E",
                "card-hover": "#1E1E2A",
                accent: "#00C9A7",
                "accent-dim": "rgba(0,201,167,0.12)",
                running: "#FF9500",
                done: "#00C97A",
                error: "#FF4757",
                warning: "#FFB347",
                queued: "#4A90D9",
                paused: "#C9A700",
                cancelled: "#555566",
                "text-primary": "#E2E2E8",
                "text-secondary": "#9595A8",
                "text-muted": "#4A4A5E",
                border: "#1E1E2A",
                "border-bright": "#2A2A3A",
            },
            animation: {
                "spin-slow": "spin 2s linear infinite",
                "progress-pulse": "progressPulse 1.5s ease-in-out infinite",
                "slide-in-right": "slideInRight 0.25s ease-out",
                "fade-in": "fadeIn 0.2s ease-out",
            },
            keyframes: {
                progressPulse: {
                    "0%, 100%": {opacity: "1"},
                    "50%": {opacity: "0.6"},
                },
                slideInRight: {
                    from: {transform: "translateX(100%)", opacity: "0"},
                    to: {transform: "translateX(0)", opacity: "1"},
                },
                fadeIn: {
                    from: {opacity: "0", transform: "translateY(4px)"},
                    to: {opacity: "1", transform: "translateY(0)"},
                },
            },
        },
    },
    plugins: [],
};
