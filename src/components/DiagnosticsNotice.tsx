import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  dismissDiagnosticReport,
  downloadDiagnosticReport,
  readDiagnosticReport,
  type DiagnosticReport,
} from '../utils/diagnostics';

export function DiagnosticsNotice() {
  const [report, setReport] = useState<DiagnosticReport | undefined>(readDiagnosticReport);
  if (!report) return null;

  const detail = report.run
    ? `The previous bulk delete stopped during “${report.run.phase}” after ${report.run.completed} of ${report.run.total} operations (${report.run.failed} failed).`
    : `The previous session ended with ${report.error?.name ?? 'an application error'}.`;

  return (
    <div
      className="container mt-4 flex flex-wrap items-center justify-between gap-3 border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm"
      role="alert"
    >
      <span>{detail} A diagnostic report is available.</span>
      <span className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => downloadDiagnosticReport(report)}>
          Download report
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            dismissDiagnosticReport();
            setReport(undefined);
          }}
        >
          Dismiss
        </Button>
      </span>
    </div>
  );
}
