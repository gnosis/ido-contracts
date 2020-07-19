module.exports = {
  // NOTE: This is actually the default value but it is being overwritten by
  // the solidity plugin somehow.
  bracketSpacing: true,
  trailingComma: "all",

  overrides: [
    {
      files: "*.sol",
      options: {
        bracketSpacing: false,
        printWidth: 129,
      },
    },
    {
      files: "*.js",
      options: {
        printWidth: 129,
        semi: false,
        trailingComma: "es5",
      },
    },
  ],
}
