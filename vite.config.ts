import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    logLevel: "info",
    server: {
        open: "http://localhost:3000?url=/test/test.htm"
    }
});
