import { describe, expect, it, vi } from 'vitest';
import { uploadFiles } from './uploadRun';

const file = new File(['x'], 'one.jpg', { type: 'image/jpeg' });
const server = { name: 'one', url: 'https://one.example', type: 'blossom' as const };

describe('uploadFiles', () => {
  it('reports one failed server while retaining successful file descriptors', async () => {
    const result = await uploadFiles({
      files: [file],
      servers: [server, { ...server, name: 'two', url: 'https://two.example' }],
      sign: async () => ({ id: '', pubkey: '', created_at: 0, kind: 0, tags: [], content: '', sig: '' }),
      resolveServer: target => ({
        capabilities: { exists: false },
        upload: async () => {
          if (target.name === 'two') throw new Error('offline');
          return { sha256: 'a'.repeat(64), url: 'https://one.example/a', type: 'image/jpeg', size: 1, uploaded: 1 };
        },
      }),
    });

    expect(result.verdict).toBe('failed');
    expect(result.outcomes.map(outcome => outcome.state)).toEqual(['done', 'error']);
  });

  it('skips upload when a capable server already has the blob', async () => {
    const existing = { sha256: 'b'.repeat(64), url: 'https://one.example/b', type: 'image/jpeg', size: 1, uploaded: 1 };
    const upload = vi.fn();
    const result = await uploadFiles({
      files: [file],
      servers: [server],
      sign: async () => ({ id: '', pubkey: '', created_at: 0, kind: 0, tags: [], content: '', sig: '' }),
      resolveServer: () => ({ capabilities: { exists: true }, exists: async () => existing, upload }),
    });

    expect(result.outcomes[0]).toMatchObject({ state: 'done', value: { descriptor: existing, skipped: true } });
    expect(upload).not.toHaveBeenCalled();
  });
});
