import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', '.published-sims/**/*'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
