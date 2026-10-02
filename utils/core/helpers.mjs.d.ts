// Type declarations for the Phase 3 ESM helper module.
// CJS consumers require() it (Node ≥22 require(esm)); TS needs the ESM shape declared.
declare function parseDuration(duration: string): number;
declare function formatDuration(seconds: number): string;
declare function formatNumber(num: number): string;
declare function parseFlexibleDate(value: unknown): Date | null;
declare function toDateObject(value: unknown, fallback?: unknown): Date;
declare function toEpochMs(value: unknown, fallback?: number): number;
declare function formatDateLabel(
  value: unknown,
  options?: { fallbackLabel?: string; locale?: string; formatOptions?: Intl.DateTimeFormatOptions }
): string;

export {
  parseDuration,
  formatDuration,
  formatNumber,
  parseFlexibleDate,
  toDateObject,
  toEpochMs,
  formatDateLabel,
};
