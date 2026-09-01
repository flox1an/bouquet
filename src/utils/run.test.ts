import { describe, expect, it } from 'vitest';
import { runTasks } from './run';

describe('runTasks', () => {
  it('reports allSucceeded false when any task fails', async () => {
    const result = await runTasks([1, 2], async n => {
      if (n === 2) throw new Error('boom');
      return `ok-${n}`;
    });
    expect(result.allSucceeded).toBe(false);
  });

  it('reports allSucceeded true when every task succeeds', async () => {
    const result = await runTasks([1, 2], async n => `ok-${n}`);
    expect(result.allSucceeded).toBe(true);
  });
  it('lists the failed indices so a retry can cover only the failures', async () => {
    const result = await runTasks([1, 2, 3, 4], async n => {
      if (n === 2 || n === 4) throw new Error('boom');
      return `ok-${n}`;
    });
    expect(result.failed).toEqual([1, 3]);
  });
  it('never runs more tasks at once than the concurrency limit', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let started = 0;
    const twoInFlight = Promise.withResolvers<void>();
    const gates = [0, 1, 2, 3, 4].map(() => Promise.withResolvers<void>());
    const run = runTasks(
      [0, 1, 2, 3, 4],
      async n => {
        started++;
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        if (started === 2) twoInFlight.resolve();
        await gates[n].promise;
        inFlight--;
        return n;
      },
      { concurrency: 2 }
    );
    // Wait for the real signal "two tasks in flight"; a runner that finishes
    // everything without ever overlapping two tasks fails here instead of hanging.
    await Promise.race([
      twoInFlight.promise,
      run.then(() => {
        throw new Error('run finished without ever running two tasks concurrently');
      }),
    ]);
    expect(maxInFlight).toBe(2);
    gates.forEach(gate => gate.resolve());
    const result = await run;
    expect(maxInFlight).toBe(2);
    expect(result.outcomes).toHaveLength(5);
  });
  it('reports one outcome per task, index-aligned, mixing success and failure', async () => {
    const boom = new Error('boom');
    const result = await runTasks([1, 2, 3], async n => {
      if (n === 2) throw boom;
      return `ok-${n}`;
    });

    expect(result.outcomes).toEqual([
      { state: 'done', value: 'ok-1' },
      { state: 'error', error: boom },
      { state: 'done', value: 'ok-3' },
    ]);
  });

  it('stops starting tasks after abort and marks never-started ones cancelled', async () => {
    const controller = new AbortController();
    const performed: number[] = [];
    const result = await runTasks(
      [0, 1, 2, 3],
      async n => {
        performed.push(n);
        if (n === 1) controller.abort();
        return `ok-${n}`;
      },
      { signal: controller.signal }
    );

    // Tasks 0 and 1 were already in flight when the abort landed; 2 and 3 never started.
    expect(performed).toEqual([0, 1]);
    expect(result.cancelled).toBe(true);
    expect(result.outcomes).toEqual([
      { state: 'done', value: 'ok-0' },
      { state: 'done', value: 'ok-1' },
      { state: 'cancelled' },
      { state: 'cancelled' },
    ]);
  });

  it('lets siblings finish when one task throws under concurrency', async () => {
    const result = await runTasks(
      [0, 1, 2, 3],
      async n => {
        if (n === 0) throw new Error('first fails');
        return `ok-${n}`;
      },
      { concurrency: 2 }
    );

    expect(result.outcomes.map(o => o.state)).toEqual(['error', 'done', 'done', 'done']);
    expect(result.failed).toEqual([0]);
    expect(result.allSucceeded).toBe(false);
    expect(result.cancelled).toBe(false);
  });

  it('reports running then done or error for each task', async () => {
    const events: Array<{ index: number; state: string }> = [];
    const result = await runTasks(
      [0, 1, 2],
      async n => {
        if (n === 1) throw new Error('boom');
        return `ok-${n}`;
      },
      { onTaskChange: (index, state) => events.push({ index, state }) }
    );

    expect(events).toEqual([
      { index: 0, state: 'running' },
      { index: 0, state: 'done' },
      { index: 1, state: 'running' },
      { index: 1, state: 'error' },
      { index: 2, state: 'running' },
      { index: 2, state: 'done' },
    ]);
    expect(result.outcomes).toHaveLength(3);
  });
});
