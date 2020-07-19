module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  env: {
    node: true,
    commonjs: true,
    es2020: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended",
    "prettier/@typescript-eslint",
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "prettier", "tsdoc"],
  rules: {
    "no-console": "error",
    "tsdoc/syntax": "error",

    "@typescript-eslint/camelcase": "off",
    "@typescript-eslint/no-use-before-define": "off",
  },
  globals: {
    artifacts: false,
    contract: false,
    assert: false,
    web3: false,
  },
  overrides: [
    {
      files: ["*.js"],
      rules: {
        "tsdoc/syntax": "off",
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/no-var-requires": "off",
      },
    },
  ],
  ignorePatterns: ["build/", "coverage/", "node_modules/"],
};
