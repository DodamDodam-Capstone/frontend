const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  { ignores: ['android/**', 'ios/**', '.expo/**', 'coverage/**', 'dist/**', 'build/**'] },
  ...expoConfig,
];
