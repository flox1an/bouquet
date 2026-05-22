import type { EventTemplate, SignedEvent } from 'blossom-client-sdk';
import { nip19 } from 'nostr-tools';
import type { NostrEvent, Filter } from 'nostr-tools';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

// Applesauce imports
import { AccountManager } from 'applesauce-accounts';
import { registerCommonAccountTypes, ReadonlyAccount } from 'applesauce-accounts/accounts';
import { AccountsProvider, EventStoreProvider } from 'applesauce-react/providers';
import { useActiveAccount } from 'applesauce-react/hooks';

// Local imports
import { eventStore, relayPool, connectToRelays, mergeRelays } from '../nostr/core';
import { restoreAccountsToManager } from '../nostr/accountPersistence';
import { useBatchedProfileLoader } from '../hooks/useBatchedProfiles';
import useEvent from './useEvent';

// User type
export type ApplesauceUser = {
  pubkey: string;
  npub: string;
  relayUrls: string[];
  profile?: {
    image?: string;
    name?: string;
    displayName?: string;
  };
};

type NostrContextType = {
  user?: ApplesauceUser;
  relaysReady: boolean; // Indicates if user's relay list (10002) has been loaded
  setUserFromPubkey: (pubkey: string) => void;
  clearUser: () => void;
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>;
  publishSignedEvent: (signedEvent: SignedEvent) => Promise<void>;
};

// Create AccountManager at module level
const accountManager = new AccountManager();
registerCommonAccountTypes(accountManager);

// Export for use elsewhere
export { accountManager };

export const NostrContext = createContext<NostrContextType>({
  relaysReady: false,
  setUserFromPubkey: () => {},
  clearUser: () => {},
  signEventTemplate: () => Promise.reject(),
  publishSignedEvent: () => Promise.reject(),
});

function AccountRestoreInit({ onRestore }: { onRestore: (pubkey: string) => void }) {
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!restored) {
      restoreAccountsToManager(accountManager).then(() => {
        setRestored(true);
        const active = accountManager.active;
        if (active) {
          onRestore(active.pubkey);
        }
      });
    }
  }, [restored, onRestore]);

  return null;
}

function BatchedProfileLoaderInit() {
  useBatchedProfileLoader();
  return null;
}

// NIP-65 Relay List Metadata kind
const RELAY_LIST_METADATA_KIND = 10002;

function UserRelayLoader({
  user,
  onRelaysLoaded,
  onRelaysReady,
}: {
  user?: ApplesauceUser;
  onRelaysLoaded: (relays: string[]) => void;
  onRelaysReady: () => void;
}) {
  const hasLoadedRef = React.useRef(false);
  const currentPubkeyRef = React.useRef<string | undefined>(undefined);

  // Fetch user's relay list (NIP-65)
  // Important: Set waitForRelays: false to avoid circular dependency
  const relayListEvent = useEvent({ kinds: [RELAY_LIST_METADATA_KIND], authors: [user?.pubkey || ''] } as Filter, {
    disable: !user?.pubkey,
    waitForRelays: false, // Don't wait for relays when fetching the relay list itself
  });

  // Reset loaded flag when user changes
  if (currentPubkeyRef.current !== user?.pubkey) {
    hasLoadedRef.current = false;
    currentPubkeyRef.current = user?.pubkey;
  }

  useEffect(() => {
    if (relayListEvent.isSuccess && relayListEvent.data && !hasLoadedRef.current) {
      // Extract relay URLs from 'r' tags
      const relayUrls = relayListEvent.data.tags.filter(tag => tag[0] === 'r' && tag[1]).map(tag => tag[1]);

      hasLoadedRef.current = true;

      if (relayUrls.length > 0) {
        console.log('📡 Loaded user relays from NIP-65:', relayUrls);
        onRelaysLoaded(relayUrls);
      } else {
        console.log('📡 No relays found in 10002 event, using defaults');
        onRelaysReady();
      }
    }
  }, [relayListEvent.isSuccess, relayListEvent.data, onRelaysLoaded, onRelaysReady]);

  // Timeout: If 10002 event is not received within 3 seconds, proceed with default relays
  useEffect(() => {
    if (!user?.pubkey || hasLoadedRef.current) return;

    const timeout = setTimeout(() => {
      if (!relayListEvent.isSuccess && !hasLoadedRef.current) {
        console.log('📡 10002 event timeout - proceeding with default relays');
        hasLoadedRef.current = true;
        onRelaysReady();
      }
    }, 3000);

    return () => clearTimeout(timeout);
  }, [user?.pubkey, relayListEvent.isSuccess, onRelaysReady]);

  return null;
}

export const NostrProvider = ({ children }: { children: React.ReactElement }) => {
  const [user, setUser] = useState<ApplesauceUser | undefined>(undefined);
  const [relaysReady, setRelaysReady] = useState(false);

  const createUserFromPubkey = useCallback((pubkey: string): ApplesauceUser => {
    return {
      pubkey,
      npub: nip19.npubEncode(pubkey),
      relayUrls: [], // Start empty, will be loaded from NIP-65
    };
  }, []);

  const setUserFromPubkey = useCallback(
    (pubkey: string) => {
      setUser(createUserFromPubkey(pubkey));
      setRelaysReady(false); // Reset relays state when user changes
    },
    [createUserFromPubkey]
  );

  const clearUser = useCallback(() => {
    setUser(undefined);
    setRelaysReady(false); // Reset relays state when user logs out
  }, []);

  const handleAccountRestore = useCallback(
    (pubkey: string) => {
      setUser(createUserFromPubkey(pubkey));
    },
    [createUserFromPubkey]
  );

  const handleRelaysLoaded = useCallback((relays: string[]) => {
    console.log('📡 User relays loaded from NIP-65:', relays);
    setUser(prev => {
      if (!prev) return prev;
      // Only update if relays have actually changed
      const currentRelays = prev.relayUrls.join(',');
      const newRelays = relays.join(',');
      if (currentRelays === newRelays) {
        return prev; // No change, return same object to prevent re-render
      }
      return { ...prev, relayUrls: relays };
    });
    setRelaysReady(true);
  }, []);

  const signEventTemplate = useCallback(async (template: EventTemplate): Promise<SignedEvent> => {
    const activeAccount = accountManager.active;
    if (!activeAccount) {
      throw new Error('No active account');
    }

    if (activeAccount instanceof ReadonlyAccount) {
      throw new Error('Cannot sign with read-only account');
    }

    const eventTemplate = {
      kind: template.kind,
      content: template.content,
      tags: template.tags,
      created_at: template.created_at,
    };

    const signedEvent = await activeAccount.signer.signEvent(eventTemplate);
    return signedEvent as SignedEvent;
  }, []);

  const publishSignedEvent = useCallback(
    async (signedEvent: SignedEvent) => {
      const relays = mergeRelays(user?.relayUrls);
      await relayPool.publish(relays, signedEvent as NostrEvent);
    },
    [user]
  );

  // Connect to relays on mount and when user relays change
  useEffect(() => {
    const relays = mergeRelays(user?.relayUrls);
    connectToRelays(relays);
  }, [user?.relayUrls]);

  const value = {
    user,
    relaysReady,
    setUserFromPubkey,
    clearUser,
    signEventTemplate,
    publishSignedEvent,
  };

  return (
    <AccountsProvider manager={accountManager}>
      <EventStoreProvider eventStore={eventStore}>
        <NostrContext.Provider value={value}>
          <AccountRestoreInit onRestore={handleAccountRestore} />
          <BatchedProfileLoaderInit />
          <UserRelayLoader
            user={user}
            onRelaysLoaded={handleRelaysLoaded}
            onRelaysReady={() => setRelaysReady(true)}
          />
          {children}
        </NostrContext.Provider>
      </EventStoreProvider>
    </AccountsProvider>
  );
};

export const useNostr = () => useContext(NostrContext);

export const useSigner = () => {
  const activeAccount = useActiveAccount();
  return activeAccount?.signer;
};
