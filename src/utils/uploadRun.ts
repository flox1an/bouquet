import type { AxiosProgressEvent } from 'axios';
import type { BlobDescriptor, EventTemplate, SignedEvent } from 'blossom-client-sdk';
import { calculateFileHash } from './blossom';
import { runTasks, type RunResult } from './run';
import type { Server } from './useUserServers';

export type UploadTask = { file: File; server: Server };
export type UploadResult = { task: UploadTask; descriptor: BlobDescriptor; skipped: boolean };
export type UploadServer = {
  capabilities: { exists: boolean };
  exists?(hash: string): Promise<BlobDescriptor | null>;
  upload(
    file: File,
    filename: string,
    sign: (template: EventTemplate) => Promise<SignedEvent>,
    onProgress?: (progress: AxiosProgressEvent) => void,
    signal?: AbortSignal
  ): Promise<BlobDescriptor>;
};

export async function uploadFiles(input: {
  files: File[];
  servers: Server[];
  sign: (template: EventTemplate) => Promise<SignedEvent>;
  resolveServer(server: Server): UploadServer;
  onProgress?(task: UploadTask, progress: AxiosProgressEvent): void;
  signal?: AbortSignal;
  concurrency?: number;
}): Promise<RunResult<UploadResult> & { verdict: 'allSucceeded' | 'failed' | 'cancelled' }> {
  const tasks = input.servers.flatMap(server => input.files.map(file => ({ file, server })));
  const result = await runTasks(
    tasks,
    async task => {
      const target = input.resolveServer(task.server);
      const hash = target.capabilities.exists ? await calculateFileHash(task.file) : undefined;
      const existing = hash && target.exists ? await target.exists(hash) : null;
      const descriptor = existing ?? (await target.upload(task.file, task.file.name, input.sign, progress => input.onProgress?.(task, progress), input.signal));
      return { task, descriptor, skipped: !!existing };
    },
    { concurrency: input.concurrency ?? 3, signal: input.signal }
  );
  return { ...result, verdict: result.cancelled ? 'cancelled' : result.allSucceeded ? 'allSucceeded' : 'failed' };
}
