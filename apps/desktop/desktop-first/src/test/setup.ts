import "@testing-library/jest-dom/vitest";
import { clearMocks } from "@tauri-apps/api/mocks";
import { configure } from "@testing-library/vue";
import { afterEach } from "vitest";

afterEach(() => {
  clearMocks();
});

// Imports dinâmicos a frio (ex.: qrcode) passam do 1 s padrão das consultas assíncronas.
configure({ asyncUtilTimeout: 5000 });
