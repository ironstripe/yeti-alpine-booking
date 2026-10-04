import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
export default defineConfig({ root: __dirname, plugins: [react()], resolve: { alias: [
  { find: "@/hooks/useSchedulerData", replacement: path.resolve(__dirname, "mockSchedulerData.ts") },
  { find: "@/hooks/useUserRole", replacement: path.resolve(__dirname, "mockUserRole.ts") },
  { find: "@", replacement: path.resolve(__dirname, "../src") },
]}, server: { host: "127.0.0.1", port: 4177, strictPort: true, fs: { allow: [path.resolve(__dirname, "..")] } } });
