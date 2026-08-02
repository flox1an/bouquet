import { useEffect, useState } from 'react';
import type { CatalogStatus } from './catalog';
import { getCatalog } from './catalog';

export function useCatalogStatus(pubkey: string | undefined) {
  const [status, setStatus] = useState<CatalogStatus>();

  useEffect(() => {
    if (!pubkey) {
      setStatus(undefined);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      getCatalog().getCatalogStatus(pubkey).then(nextStatus => {
        if (!cancelled) setStatus(nextStatus);
      });
    };
    refresh();
    window.addEventListener('bouquet-catalog-changed', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('bouquet-catalog-changed', refresh);
    };
  }, [pubkey]);

  return status;
}
