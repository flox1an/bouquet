import type { EventTemplate, SignedEvent } from 'blossom-client-sdk';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from 'nostr-tools';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

// Applesauce imports
import { AccountManager } from 'applesauce-accounts';
import { registerCommonAccountTypes, ReadonlyAccount } from 'applesauce-accounts/accounts';
import { EventFactory } from 'applesauce-core';
import { AccountsProvider, EventStoreProvider, FactoryProvider } from 'applesauce-react/providers';
import { useActiveAccount } from 'applesauce-react/hooks';

// Local imports
import { eventStore, relayPool, connectToRelays, DEFAULT_RELAYS } from '../nostr/core';
import { restoreAccountsToManager } from '../nostr/accountPersistence';
import { useBatchedProfileLoader } from '../hooks/useBatchedProfiles';

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
  setUserFromPubkey: (pubkey: string) => void;
  clearUser: () => void;
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>;
  publishSignedEvent: (signedEvent: SignedEvent) => Promise<void>;
};

// Create AccountManager and EventFactory at module level
const accountManager = new AccountManager();
registerCommonAccountTypes(accountManager);
const factory = new EventFactory({ signer: accountManager.signer });

// Export for use elsewhere
export { accountManager, factory };

export const NostrContext = createContext<NostrContextType>({
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

export const NostrProvider = ({ children }: { children: React.ReactElement }) => {
  const [user, setUser] = useState<ApplesauceUser | undefined>(undefined);

  const createUserFromPubkey = useCallback((pubkey: string): ApplesauceUser => {
    return {
      pubkey,
      npub: nip19.npubEncode(pubkey),
      relayUrls: DEFAULT_RELAYS,
    };
  }, []);

  const setUserFromPubkey = useCallback((pubkey: string) => {
    setUser(createUserFromPubkey(pubkey));
  }, [createUserFromPubkey]);

  const clearUser = useCallback(() => {
    setUser(undefined);
  }, []);

  const handleAccountRestore = useCallback((pubkey: string) => {
    setUser(createUserFromPubkey(pubkey));
  }, [createUserFromPubkey]);

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

  const publishSignedEvent = useCallback(async (signedEvent: SignedEvent) => {
    await relayPool.publish(DEFAULT_RELAYS, signedEvent as NostrEvent);
  }, []);

  // Connect to relays on mount
  useEffect(() => {
    connectToRelays();
  }, []);

  const value = {
    user,
    setUserFromPubkey,
    clearUser,
    signEventTemplate,
    publishSignedEvent,
  };

  return (
    <AccountsProvider manager={accountManager}>
      <EventStoreProvider eventStore={eventStore}>
        <FactoryProvider factory={factory}>
          <NostrContext.Provider value={value}>
            <AccountRestoreInit onRestore={handleAccountRestore} />
            <BatchedProfileLoaderInit />
            {children}
          </NostrContext.Provider>
        </FactoryProvider>
      </EventStoreProvider>
    </AccountsProvider>
  );
};

export const useNostr = () => useContext(NostrContext);

export const useSigner = () => {
  const activeAccount = useActiveAccount();
  return activeAccount?.signer;
};
