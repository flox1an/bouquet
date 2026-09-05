/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useCatalogRefresh } from './useCatalogRefresh';
import { act } from 'react';
import type { TimelineItem } from './browseConstants';

const queryCatalogTimeline = vi.fn();
vi.mock('../../catalog/catalogClient', () => ({
  getCatalogClient: () => ({ queryCatalogTimeline }),
}));

afterEach(() => {
  cleanup();
  queryCatalogTimeline.mockReset();
  vi.useRealTimers();
});

const item = (assetId: string): TimelineItem =>
  ({ assetId, searchText: '', availabilityState: 'unknown', displayTitleIsFallback: false }) as TimelineItem;

describe('useCatalogRefresh', () => {
  it('coalesces a burst of catalog changes into one re-query', async () => {
    vi.useFakeTimers();
    queryCatalogTimeline.mockResolvedValue([item('a')]);
    const { result } = renderHook(() => useCatalogRefresh('pk'));

    for (let i = 0; i < 10; i++) window.dispatchEvent(new Event('bouquet-catalog-changed'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // One cache prefill + one debounced projection for the whole burst.
    expect(queryCatalogTimeline).toHaveBeenCalledTimes(2);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.state).toBe('complete');
  });
});
