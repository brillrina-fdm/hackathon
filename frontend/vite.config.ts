import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, path.resolve(import.meta.dirname, ".."));

    return {
        envDir: "../",
        plugins: [react()],
        resolve: {
            alias: {
                "@": path.resolve(import.meta.dirname, "src"),
            },
        },
        server: {
            proxy: {
                "/api": {
                    target: env.VITE_BACKEND_URL ?? "http://localhost:3000",
                    changeOrigin: true,
                },
            },
        },
    };
});