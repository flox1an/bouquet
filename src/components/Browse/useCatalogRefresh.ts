import { useCallback, useEffect, useState } from 'react';
import { getCatalogClient } from '../../catalog/catalogClient';
import type { TimelineItem } from './browseConstants';

/**
 * One coalescing subscription to catalog changes drives the whole browse page:
 * a 500 ms single-flight debounce folds a relay sync's per-page change bursts
 * (25 events in under four seconds, measured) into one timeline re-query, so a
 * long sync cannot stack dozens of catalog-wide projections and wedge the
 * worker. The same completion bumps `version`, which filter-dependent catalog
 * lookups key on — the page's second, separately debounced subscription lived
 * here before the split.
 */
const REFRESH_DEBOUNCE_MS = 500;

export type RefreshState = 'idle' | 'projecting' | 'complete' | 'failed';

export function useCatalogRefresh(pubkey: string | undefined) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [state, setState] = useState<RefreshState>('idle');
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!pubkey) {
      setItems([]);
      setState('idle');
      return;
    }

    let active = true;
    const catalog = getCatalogClient();

    void catalog
      .queryCatalogTimeline(pubkey)
      .then(cached => {
        if (!active || cached.length === 0) return;
        setItems(cached);
        setState('complete');
      })
      .catch(() => {
        // The full projection below is the real source; a failed cache read only
        // costs a slower first paint, so it must not surface as an error.
      });

    let timer: number | undefined;
    let inFlight = false;
    let dirty = false;
    const runProjection = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!active) return;
        if (inFlight) {
          dirty = true;
          return;
        }
        inFlight = true;
        setState(current => (current === 'complete' ? current : 'projecting'));
        void catalog
          .queryCatalogTimeline(pubkey)
          .then(projected => {
            if (!active) return;
            setItems(projected);
            setError(undefined);
            setState('complete');
            setVersion(current => current + 1);
          })
          .catch(queryError => {
            if (!active) return;
            setError(queryError instanceof Error ? queryError.message : String(queryError));
            setState(current => (current === 'complete' ? current : 'failed'));
          })
          .finally(() => {
            inFlight = false;
            if (dirty && active) {
              dirty = false;
              runProjection();
            }
          });
      }, REFRESH_DEBOUNCE_MS);
    };

    runProjection();
    window.addEventListener('bouquet-catalog-changed', runProjection);

    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('bouquet-catalog-changed', runProjection);
    };
  }, [pubkey, attempt]);

  const retry = useCallback(() => setAttempt(current => current + 1), []);
  return { items, setItems, state, error, retry, version };
}
