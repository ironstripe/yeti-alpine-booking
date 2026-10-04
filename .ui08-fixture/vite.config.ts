import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: { alias: [
    { find: "@/hooks/useListsData", replacement: path.resolve(__dirname, "mockListsData.ts") },
    { find: "@", replacement: path.resolve(__dirname, "../src") },
  ] },
  server: { host: "127.0.0.1", port: 4178 },
});
