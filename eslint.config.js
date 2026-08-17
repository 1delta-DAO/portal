import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * Lint, kept deliberately narrow: the RULES OF HOOKS and nothing else.
 *
 * This config exists because of one bug. `UnifiedEarnTab` grew an
 * `if (error) return …` above two `useMemo` calls, which renders fine until the
 * backend goes down — then React sees fewer hooks than the previous pass and
 * takes the whole tab out with "Rendered fewer hooks than expected". That is
 * exactly what `rules-of-hooks` catches statically, and there was no ESLint
 * config here for it to run under.
 *
 * What this is NOT: a style pass. `js.configs.recommended` and
 * `tseslint.configs.recommended` over this codebase produce hundreds of
 * findings (`no-explicit-any` alone is ~90), and a lint run nobody can get to
 * zero is a lint run nobody reads. Prettier already owns formatting and `tsc
 * --noEmit` already owns types; the gap between them was hook correctness, so
 * that is what this closes. Add rules when someone is prepared to fix the
 * backlog they open.
 *
 *   pnpm lint          # exits non-zero on an ERROR; warnings are advisory
 *   pnpm lint:strict   # exits non-zero on a warning too — for CI, once the
 *                      # ~31 existing exhaustive-deps warnings are dealt with
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.vite/**', 'public/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    // The parser is here for TS/TSX SYNTAX only — no `project`, so no
    // type-aware linting and no per-run type-check cost. `tsc --noEmit` is the
    // type gate and it is already wired into the test loop.
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // A hook after a conditional return is the bug above. Never a warning.
      'react-hooks/rules-of-hooks': 'error',
      // A warning, not an error: this file carries ~15 deliberate
      // `eslint-disable-next-line react-hooks/exhaustive-deps` suppressions,
      // each with a reason next to it (a `.join(',')` standing in for an array
      // identity, a setter that is a fresh closure every render). Those are
      // judgement calls the rule cannot make, so it advises rather than blocks.
      'react-hooks/exhaustive-deps': 'warn',
    },
  }
)
