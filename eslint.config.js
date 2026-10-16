import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // La consola no llama a fetch ni a WebSocket fuera de la capa de infraestructura (DO-02, sección 6).
      "no-restricted-globals": ["error", { name: "fetch", message: "Usa infrastructure/http/api.ts" }, { name: "WebSocket", message: "Usa infrastructure/realtime/ws.ts" }],
    },
  },
  {
    // Única capa autorizada a usar fetch/WebSocket: los adaptadores de infraestructura.
    files: ["src/infrastructure/http/**/*.ts", "src/infrastructure/realtime/**/*.ts"],
    rules: { "no-restricted-globals": "off" },
  },
);
