import type { EventTemplate, SignedEvent } from 'blossom-client-sdk';
import NDK, {
  NDKCacheAdapter,
  NDKEvent,
  NDKNip07Signer,
  NDKNip46Signer,
  NDKPrivateKeySigner,
  NDKUser,
} from '@nostr-dev-kit/ndk';
import { generateSecretKey, nip19 } from 'nostr-tools';
import { decrypt } from 'nostr-tools/nip49';
import { bytesToHex } from '@noble/hashes/utils';
import React, { createContext, useContext, useEffect, useState } from 'react';

// @ts-expect-error ndk-cache-dexie has no type definitions
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie';

type NDKContextType = {
  ndk: NDK;
  user?: NDKUser;
  logout: () => void;
  loginWithExtension: () => Promise<void>;
  loginWithNostrAddress: (connectionString: string) => Promise<void>;
  loginWithPrivateKey: (key: string) => Promise<void>;
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>;
  publishSignedEvent: (signedEvent: SignedEvent) => Promise<void>;
};

const defaultRelays = [
  // 'ws://localhost:4869',
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://relay.snort.social',
  'wss://nos.lol',
  'wss://nostr.wine',
  'wss://relay.primal.net',
  'wss://purplepag.es/', // needed for user profiles
];

const dexieAdapter = new NDKCacheAdapterDexie({ dbName: 'ndk-cache-3' });

const ndk = new NDK({
  cacheAdapter: dexieAdapter as NDKCacheAdapter,
  autoConnectUserRelays: true,
  enableOutboxModel: true,
  explicitRelayUrls: defaultRelays,
});

export const NDKContext = createContext<NDKContextType>({
  ndk,
  logout: () => {},
  loginWithExtension: () => Promise.reject(),
  loginWithNostrAddress: () => Promise.reject(),
  loginWithPrivateKey: () => Promise.reject(),
  signEventTemplate: () => Promise.reject(),
  publishSignedEvent: () => Promise.reject(),
});

export const NDKContextProvider = ({ children }: { children: React.ReactElement }) => {
  const [user, setUser] = useState(ndk.activeUser);

  const fetchUserData = async function () {
    if (!ndk.signer) return;

    console.log('Fetching user');
    const user = await ndk.signer.user();
    console.log('Fetching profile');
    user.fetchProfile();
    setUser(user);
  };

  const loginWithExtension = async function () {
    const signer: NDKNip07Signer = new NDKNip07Signer();
    console.log('Waiting for NIP-07 signer');
    await signer.blockUntilReady();
    await signer.user();
    ndk.signer = signer;

    await fetchUserData();
  };

  const loginWithNostrAddress = async function (connectionString: string) {
    const localKey = localStorage.getItem('local-signer') || bytesToHex(generateSecretKey());
    const localSigner = new NDKPrivateKeySigner(localKey);

    let signer: NDKNip46Signer;

    // manually set remote user and pubkey if using NIP05
    if (connectionString.includes('@')) {
      const user = await ndk.getUserFromNip05(connectionString);
      if (!user?.pubkey) throw new Error('Cant find user');
      console.log('Found user', user);

      signer = new NDKNip46Signer(ndk, connectionString, localSigner);
    } else if (connectionString.startsWith('bunker://')) {
      const uri = new URL(connectionString);

      const pubkey = uri.host || uri.pathname.replace('//', '');
      const relays = uri.searchParams.getAll('relay');
      for (const relay of relays) ndk.addExplicitRelay(relay);
      if (relays.length === 0) throw new Error('Missing relays');
      signer = new NDKNip46Signer(ndk, pubkey, localSigner);
      signer.relayUrls = relays;
    } else {
      signer = new NDKNip46Signer(ndk, connectionString, localSigner);
    }

    signer.rpc.on('authUrl', (url: string) => {
      window.open(url, '_blank');
    });

    await signer.blockUntilReady();
    await signer.user();
    ndk.signer = signer;
    localStorage.setItem('local-signer', localSigner.privateKey ?? '');

    await fetchUserData();
  };

  const loginWithPrivateKey = async function (key: string) {
    if (key.startsWith('ncryptsec')) {
      const password = prompt('Enter your private key password');
      if (password === null) throw new Error('No password provided');
      const plaintext = bytesToHex(decrypt(key, password));
      console.log(plaintext);

      ndk.signer = new NDKPrivateKeySigner(plaintext);
      await ndk.signer.blockUntilReady();
      localStorage.setItem('private-key', key);
    } else if (key.startsWith('nsec')) {
      const decoded = nip19.decode(key);
      if (decoded.type !== 'nsec') throw new Error('Not nsec');
      ndk.signer = new NDKPrivateKeySigner(bytesToHex(decoded.data));
      await ndk.signer.blockUntilReady();
    } else throw new Error('Unknown private format');

    await fetchUserData();
  };

  const logout = function logout() {
    localStorage.clear();
    location.reload();
  };

  const signEventTemplate = async function signEventTemplate(template: EventTemplate): Promise<SignedEvent> {
    console.log('signEventTemplate called');
    const e = new NDKEvent(ndk);
    e.kind = template.kind;
    e.content = template.content;
    e.tags = template.tags;
    e.created_at = template.created_at;
    await e.sign();
    return e.rawEvent() as SignedEvent;
  };

  const publishSignedEvent = async function (signedEvent: SignedEvent) {
    const e = new NDKEvent(ndk);
    e.content = signedEvent.content;
    e.tags = signedEvent.tags;
    e.created_at = signedEvent.created_at;
    e.kind = signedEvent.kind;
    e.id = signedEvent.id;
    e.pubkey = signedEvent.pubkey;
    e.sig = signedEvent.sig;
    await e.publish();
  };

  ndk.connect();

  const performAutoLogin = async () => {
    const autoLogin = localStorage.getItem('auto-login');
    if (autoLogin) {
      try {
        if (autoLogin === 'nip07') {
          await loginWithExtension().catch(() => {});
        } else if (autoLogin === 'nsec') {
          const key = localStorage.getItem('private-key');
          if (key) await loginWithPrivateKey(key);
        } else if (autoLogin.includes('@') || autoLogin.startsWith('bunker://') || autoLogin.includes('#')) {
          await loginWithNostrAddress(autoLogin).catch(() => {});
        }
      } catch (e) {}
    }
  };

  useEffect(() => {
    performAutoLogin();
  }, []);

  const value = {
    ndk,
    user,
    logout,
    loginWithExtension,
    loginWithNostrAddress,
    loginWithPrivateKey,
    signEventTemplate,
    publishSignedEvent,
  };

  return <NDKContext.Provider value={value}>{children}</NDKContext.Provider>;
};

export const useNDK = () => useContext(NDKContext);
