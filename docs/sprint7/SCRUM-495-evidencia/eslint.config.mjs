import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
const base = jsxA11y.flatConfigs.recommended;
export default [
  { ...base, files: ['src/**/*.{ts,tsx}'], languageOptions: { ...base.languageOptions, parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } } },
];
