# Agent Notes

- Desktop source lives in `apps/desktop`. Mobile source lives in `apps/mobile`.
- For visual QA, inspect the running Electron app window as the source of truth. Browser checks are only a fallback or supplemental preview.
- Keep the desktop app minimum width at `1180px` in both `apps/desktop/src/index.css` and `apps/desktop/electron/main.ts`.
- Use TailwindCSS by default for component styling; keep plain CSS for global tokens, app-wide primitives, or cases where Tailwind would make the code less clear.
- Tests use Vitest. Run `npm test` directly; do not pass Jest-only flags such as `--runInBand`.
