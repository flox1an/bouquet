export type TaskState = 'running' | 'done' | 'error' | 'cancelled';

export type TaskOutcome<T> = { state: 'done'; value: T } | { state: 'error'; error: unknown } | { state: 'cancelled' };

export type RunResult<T> = {
  outcomes: TaskOutcome<T>[];
  allSucceeded: boolean;
  /** Input indices whose task threw - a retry passes just these back in. */
  failed: number[];
  cancelled: boolean;
};

export function runTasks<Task, T>(
  tasks: Task[],
  perform: (task: Task, index: number) => Promise<T>,
  options?: {
    concurrency?: number;
    signal?: AbortSignal;
    onTaskChange?: (index: number, state: TaskState) => void;
  }
): Promise<RunResult<T>> {
  const concurrency = Math.max(1, options?.concurrency ?? 1);
  const signal = options?.signal;
  const onTaskChange = options?.onTaskChange;

  return new Promise(resolve => {
    // Shared index counter - safe in JS's single-threaded event loop.
    let nextIndex = 0;
    const outcomes: TaskOutcome<T>[] = new Array(tasks.length);

    const worker = async () => {
      while (nextIndex < tasks.length && !signal?.aborted) {
        const index = nextIndex++;
        onTaskChange?.(index, 'running');
        try {
          const value = await perform(tasks[index], index);
          onTaskChange?.(index, 'done');
          outcomes[index] = { state: 'done', value };
        } catch (error) {
          onTaskChange?.(index, 'error');
          outcomes[index] = { state: 'error', error };
        }
      }
    };

    Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker)).then(() => {
      for (let i = 0; i < outcomes.length; i++) {
        if (!outcomes[i]) outcomes[i] = { state: 'cancelled' };
      }
      resolve({
        outcomes,
        allSucceeded: outcomes.every(o => o.state === 'done'),
        cancelled: signal?.aborted === true,
        failed: [...outcomes.entries()].filter(([, o]) => o.state === 'error').map(([i]) => i),
      });
    });
  });
}
