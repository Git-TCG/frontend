import { defineConfig } from "vite";

// 개발 서버에서도 API를 같은 Origin의 /api로 부른다(쿠키·CSRF 규칙을 운영과 같게 유지).
export default defineConfig({
  server: {
    port: 8123,
    proxy: {
      "/api": { target: process.env.API_URL ?? "http://localhost:3000", ws: true, xfwd: true },
    },
  },
});
