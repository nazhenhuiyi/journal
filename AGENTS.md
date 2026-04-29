# Agent Notes

- Desktop-only app. Do not add mobile layouts or responsive mobile breakpoints unless requested.
- Keep the app minimum width at `1180px` in both `src/index.css` and `electron/main.ts`.
- Use TailwindCSS by default for component styling; keep plain CSS for global tokens, app-wide primitives, or cases where Tailwind would make the code less clear.
- Tests use Vitest. Run `npm test` directly; do not pass Jest-only flags such as `--runInBand`.
