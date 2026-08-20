// Shared DOM lookup helper — used by main.ts and wizard.ts. Standalone
// for the same reason as tick-features.ts: main.ts has import-time
// side effects, so anything else needing this can't import main.ts.

// T is set by the caller's explicit type argument (mirrors DOM's own
// querySelector<T>), not inferred from the selector string.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function requireElement<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) {
    throw new Error(`Expected element matching "${selector}" in index.html.`);
  }
  return el;
}
