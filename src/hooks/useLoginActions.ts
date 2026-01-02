import { nip19 } from 'nostr-tools';
import { decrypt } from 'nostr-tools/nip49';
import { bytesToHex } from '@noble/hashes/utils';
import { useAccountManager } from 'applesauce-react/hooks';
import {
  ExtensionAccount,
  NostrConnectAccount,
  PrivateKeyAccount,
} from 'applesauce-accounts/accounts';
import { ExtensionSigner, NostrConnectSigner } from 'applesauce-signers';
import {
  saveAccountToStorage,
  saveActiveAccount,
  removeAccountFromStorage,
  clearAllAccounts,
} from '../nostr/accountPersistence';

export class ExtensionMissingError extends Error {
  constructor() {
    super('Nostr extension not found. Please install a NIP-07 extension like Alby or nos2x.');
    this.name = 'ExtensionMissingError';
  }
}

export function useLoginActions() {
  const accountManager = useAccountManager();

  const extension = async (): Promise<void> => {
    // Check if window.nostr exists (NIP-07 spec)
    if (!('nostr' in window) || !window.nostr) {
      throw new ExtensionMissingError();
    }

    const signer = new ExtensionSigner();
    const pubkey = await signer.getPublicKey();
    const account = new ExtensionAccount(pubkey, signer);

    accountManager.addAccount(account);
    accountManager.setActive(account);

    saveAccountToStorage(account, 'extension');
    saveActiveAccount(pubkey);
  };

  const bunker = async (uri: string): Promise<void> => {
    if (!uri.trim()) {
      throw new Error('Bunker URI is required');
    }

    if (!uri.startsWith('bunker://')) {
      throw new Error('Bunker URI must start with bunker://');
    }

    const signer = await NostrConnectSigner.fromBunkerURI(uri, {
      onAuth: async (authUrl: string) => {
        window.open(authUrl, 'auth', 'width=600,height=600');
      },
    });

    const pubkey = await signer.getPublicKey();
    const account = new NostrConnectAccount(pubkey, signer);

    accountManager.addAccount(account);
    accountManager.setActive(account);

    saveAccountToStorage(account, 'bunker', uri);
    saveActiveAccount(pubkey);
  };

  const nsec = async (key: string): Promise<void> => {
    if (!key.trim()) {
      throw new Error('Private key is required');
    }

    let hexPrivkey: string;

    if (key.startsWith('ncryptsec')) {
      const password = prompt('Enter your private key password');
      if (password === null) {
        throw new Error('Password is required for encrypted keys');
      }
      hexPrivkey = bytesToHex(decrypt(key, password));
    } else if (key.startsWith('nsec')) {
      try {
        const decoded = nip19.decode(key);
        if (decoded.type !== 'nsec') {
          throw new Error('Invalid nsec format');
        }
        hexPrivkey = bytesToHex(decoded.data);
      } catch {
        throw new Error('Failed to decode nsec. Please check the format.');
      }
    } else {
      throw new Error('Unknown private key format. Use nsec or ncryptsec.');
    }

    const account = PrivateKeyAccount.fromKey(hexPrivkey);
    const pubkey = await account.signer.getPublicKey();

    accountManager.addAccount(account);
    accountManager.setActive(account);

    // Note: nsec is NOT stored for security - user must re-enter on reload
    saveAccountToStorage(account, 'nsec');
    saveActiveAccount(pubkey);
  };

  const logout = (pubkey?: string): void => {
    const targetPubkey = pubkey || accountManager.active?.pubkey;
    if (!targetPubkey) return;

    const account = accountManager.accounts.find(acc => acc.pubkey === targetPubkey);
    if (account) {
      removeAccountFromStorage(targetPubkey);
      accountManager.removeAccount(account);
    }

    // If we logged out the active account, clear active
    if (accountManager.active?.pubkey === targetPubkey) {
      accountManager.clearActive();
    }
  };

  const logoutAll = (): void => {
    clearAllAccounts();
    for (const account of [...accountManager.accounts]) {
      accountManager.removeAccount(account);
    }
    accountManager.clearActive();
  };

  return {
    extension,
    bunker,
    nsec,
    logout,
    logoutAll,
  };
}
