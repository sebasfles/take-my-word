import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";
import root from "../../eslint.config.js";

export default tseslint.config({ ignores: ["src-tauri/**"] }, ...root, {
  files: ["src/**/*.{ts,tsx}"],
  languageOptions: {
    globals: globals.browser,
    parserOptions: { tsconfigRootDir: import.meta.dirname },
  },
  ...reactHooks.configs.flat["recommended-latest"],
});
