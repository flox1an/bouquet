import { describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import type { SignedEvent } from 'blossom-client-sdk';
import { buildReportTemplate } from './report';
import { reportBlobs } from './blossom';

describe('buildReportTemplate (NIP-56 / BUD-09)', () => {
  it('builds a kind 1984 template with x tags carrying the report type', () => {
    const template = buildReportTemplate({
      hashes: ['a'.repeat(64), 'b'.repeat(64)],
      type: 'malware',
      content: 'virus',
    });
    expect(template.kind).toBe(1984);
    expect(template.content).toBe('virus');
    expect(template.tags).toEqual([
      ['x', 'a'.repeat(64), 'malware'],
      ['x', 'b'.repeat(64), 'malware'],
    ]);
  });

  it('adds e/p context tags when the blob is linked to an event', () => {
    const template = buildReportTemplate({
      hashes: ['a'.repeat(64)],
      type: 'nudity',
      content: '',
      event: { id: 'event-id', pubkey: 'author-pk' },
    });
    expect(template.tags).toEqual([
      ['x', 'a'.repeat(64), 'nudity'],
      ['e', 'event-id'],
      ['p', 'author-pk'],
    ]);
  });
});

describe('reportBlobs (BUD-09 PUT /report)', () => {
  it('PUTs the signed report event as JSON without an auth header', async () => {
    const put = vi.spyOn(axios, 'put').mockResolvedValue({ data: '' });
    const event = { id: '1', kind: 1984, tags: [], content: '', sig: 's' } as unknown as SignedEvent;
    await reportBlobs('https://server.example', event);
    expect(put).toHaveBeenCalledWith(
      'https://server.example/report',
      event,
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) })
    );
    const headers = put.mock.calls[0][2]?.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
  });
});
