/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { describe, expect, it } from 'vitest';
import { useAssetSelection } from './useAssetSelection';

const click = (shiftKey: boolean) => ({ shiftKey }) as unknown as ReactMouseEvent<HTMLElement>;

describe('useAssetSelection shift-click ranges', () => {
  it('selects the range between the anchor and the shift-clicked item', () => {
    const { result } = renderHook(() => useAssetSelection(['a', 'b', 'c', 'd', 'e']));

    act(() => result.current.handleSelectAsset('a', click(false)));
    expect(result.current.selectedAssetIds).toEqual({ a: true });

    act(() => result.current.handleSelectAsset('c', click(true)));
    expect(result.current.selectedAssetIds).toEqual({ a: true, b: true, c: true });

    // Anchor moves on a plain click; the range then runs from the new anchor.
    act(() => result.current.handleSelectAsset('e', click(false)));
    act(() => result.current.handleSelectAsset('b', click(true)));
    expect(result.current.selectedAssetIds).toEqual({ a: true, b: true, c: true, d: true, e: true });
  });

  it('falls back to a plain toggle when the anchor or target is not in the visible order', () => {
    const { result } = renderHook(() => useAssetSelection(['a', 'b', 'c']));

    act(() => result.current.handleSelectAsset('zzz', click(true)));
    expect(result.current.selectedAssetIds).toEqual({ zzz: true });

    act(() => result.current.handleSelectAsset('b', click(false)));
    act(() => result.current.handleSelectAsset('ghost', click(true)));
    expect(result.current.selectedAssetIds).toEqual({ zzz: true, b: true, ghost: true });
  });
});
