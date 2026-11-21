import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

export default defineConfig([
  ...nextVitals,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
  // Surface the new compiler diagnostics on existing effects without changing their timing.
  {
    files: [
      'app/playground/page.tsx',
      'components/analysis/results-panel.tsx',
      'components/auth.tsx',
      'components/deploy-dialog.tsx',
      'lib/analysis/use-run-history.ts',
      'lib/analysis/use-workspace.ts',
      'lib/auth.ts',
    ],
    rules: { 'react-hooks/set-state-in-effect': 'warn' },
  },
  {
    files: ['app/playground/page.tsx'],
    rules: { 'react-hooks/immutability': 'warn' },
  },
])
