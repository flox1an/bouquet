const ACTIVE_KEY = 'bouquet:diagnostics:active';
const REPORT_KEY = 'bouquet:diagnostics:report';

type HeapSnapshot = {
  usedBytes: number;
  totalBytes: number;
  limitBytes: number;
};

export type DiagnosticRun = {
  id: string;
  operation: 'bulk-delete';
  phase: string;
  startedAt: string;
  updatedAt: string;
  total: number;
  completed: number;
  failed: number;
  lastTask?: number;
  lastServer?: string;
  lastError?: string;
  heap?: HeapSnapshot;
};

export type DiagnosticReport = {
  reason: 'interrupted' | 'error';
  detectedAt: string;
  page: string;
  browser: string;
  run?: DiagnosticRun;
  error?: { context: string; name: string; message: string; stack?: string };
};

const read = <T>(key: string): T | undefined => {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : undefined;
  } catch {
    return undefined;
  }
};

const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Diagnostics must never become another application failure.
  }
};

const remove = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Diagnostics are best-effort when browser storage is unavailable.
  }
};

const environment = () => ({
  page: `${location.origin}${location.pathname}`,
  browser: navigator.userAgent,
});

const heapSnapshot = (): HeapSnapshot | undefined => {
  const memory = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
    }
  ).memory;
  return memory
    ? { usedBytes: memory.usedJSHeapSize, totalBytes: memory.totalJSHeapSize, limitBytes: memory.jsHeapSizeLimit }
    : undefined;
};

export function startDiagnosticRun(total: number): DiagnosticRun {
  const now = new Date().toISOString();
  const run: DiagnosticRun = {
    id: crypto.randomUUID(),
    operation: 'bulk-delete',
    phase: 'planning',
    startedAt: now,
    updatedAt: now,
    total,
    completed: 0,
    failed: 0,
    heap: heapSnapshot(),
  };
  write(ACTIVE_KEY, run);
  return run;
}

export function updateDiagnosticRun(
  id: string,
  update: Partial<Omit<DiagnosticRun, 'id' | 'operation' | 'startedAt'>>
) {
  const current = read<DiagnosticRun>(ACTIVE_KEY);
  if (!current || current.id !== id) return;
  write(ACTIVE_KEY, { ...current, ...update, updatedAt: new Date().toISOString(), heap: heapSnapshot() });
}

export function finishDiagnosticRun(id: string) {
  const current = read<DiagnosticRun>(ACTIVE_KEY);
  if (current?.id === id) remove(ACTIVE_KEY);
}

export function recoverInterruptedRun(): DiagnosticReport | undefined {
  const active = read<DiagnosticRun>(ACTIVE_KEY);
  if (!active) return read<DiagnosticReport>(REPORT_KEY);
  const report: DiagnosticReport = {
    reason: 'interrupted',
    detectedAt: new Date().toISOString(),
    ...environment(),
    run: active,
  };
  write(REPORT_KEY, report);
  remove(ACTIVE_KEY);
  return report;
}

export function recordDiagnosticError(context: string, value: unknown) {
  const error = value instanceof Error ? value : new Error(String(value));
  write(REPORT_KEY, {
    reason: 'error',
    detectedAt: new Date().toISOString(),
    ...environment(),
    run: read<DiagnosticRun>(ACTIVE_KEY),
    error: { context, name: error.name, message: error.message, stack: error.stack },
  } satisfies DiagnosticReport);
}

export const readDiagnosticReport = () => read<DiagnosticReport>(REPORT_KEY);
export const dismissDiagnosticReport = () => remove(REPORT_KEY);

export function downloadDiagnosticReport(report = readDiagnosticReport()) {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `bouquet-diagnostics-${report.detectedAt.replaceAll(':', '-')}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

let initialized = false;
export function initializeDiagnostics() {
  if (initialized) return;
  initialized = true;
  recoverInterruptedRun();
  window.addEventListener('error', event => recordDiagnosticError('window.error', event.error ?? event.message));
  window.addEventListener('unhandledrejection', event => recordDiagnosticError('unhandledrejection', event.reason));
}
