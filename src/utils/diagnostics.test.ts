/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dismissDiagnosticReport,
  finishDiagnosticRun,
  recoverInterruptedRun,
  startDiagnosticRun,
  updateDiagnosticRun,
} from './diagnostics';
const values = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
});

describe('bulk-delete diagnostics', () => {
  beforeEach(() => {
    values.clear();
    dismissDiagnosticReport();
  });

  it('recovers the last persisted checkpoint after an interrupted tab session', () => {
    const run = startDiagnosticRun(700);
    updateDiagnosticRun(run.id, {
      phase: 'deleting',
      total: 700,
      completed: 325,
      failed: 2,
      lastTask: 326,
      lastServer: 'media.example',
    });

    expect(recoverInterruptedRun()).toMatchObject({
      reason: 'interrupted',
      run: {
        id: run.id,
        phase: 'deleting',
        total: 700,
        completed: 325,
        failed: 2,
        lastTask: 326,
        lastServer: 'media.example',
      },
    });

    finishDiagnosticRun(run.id);
    expect(recoverInterruptedRun()).toMatchObject({ reason: 'interrupted', run: { id: run.id } });
  });
});
