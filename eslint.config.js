// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Verification scripts compile TypeScript fixtures into hidden folders.
    // Lint the authored sources, not those generated CommonJS artifacts.
    ignores: ["dist/**", ".expo/**", ".*-verification/**"],
  }
]);
