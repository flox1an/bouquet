import type { IAccount } from 'applesauce-accounts';
import { type AccountManager } from 'applesauce-accounts';
import { ExtensionAccount, NostrConnectAccount } from 'applesauce-accounts/accounts';
import { ExtensionSigner, NostrConnectSigner } from 'applesauce-signers';

const STORAGE_KEY_ACCOUNTS = 'bouquet:accounts';
const STORAGE_KEY_ACTIVE = 'bouquet:active-account';

export type AccountMethod = 'extension' | 'nsec' | 'bunker' | 'npub';

export interface PersistedAccount {
  pubkey: string;
  method: AccountMethod;
  data?: string;
  createdAt: number;
}

export function saveAccountToStorage(
  account: IAccount,
  method: AccountMethod,
  data?: string
): void {
  try {
    const accounts = loadAccountsFromStorage();
    const existingIndex = accounts.findIndex(acc => acc.pubkey === account.pubkey);

    const accountData: PersistedAccount = {
      pubkey: account.pubkey,
      method,
      data: method === 'nsec' ? undefined : data,
      createdAt: existingIndex >= 0 ? accounts[existingIndex].createdAt : Date.now(),
    };

    if (existingIndex >= 0) {
      accounts[existingIndex] = accountData;
    } else {
      accounts.push(accountData);
    }

    localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
  } catch (error) {
    console.error('Failed to save account to storage:', error);
  }
}

export function loadAccountsFromStorage(): PersistedAccount[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_ACCOUNTS);
    if (!stored) return [];

    const accounts = JSON.parse(stored) as PersistedAccount[];
    return Array.isArray(accounts) ? accounts : [];
  } catch (error) {
    console.error('Failed to load accounts from storage:', error);
    localStorage.removeItem(STORAGE_KEY_ACCOUNTS);
    return [];
  }
}

export function saveActiveAccount(pubkey: string | null): void {
  try {
    if (pubkey) {
      localStorage.setItem(STORAGE_KEY_ACTIVE, pubkey);
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE);
    }
  } catch (error) {
    console.error('Failed to save active account:', error);
  }
}

export function loadActiveAccount(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_ACTIVE);
  } catch (error) {
    console.error('Failed to load active account:', error);
    return null;
  }
}

export function removeAccountFromStorage(pubkey: string): void {
  try {
    const accounts = loadAccountsFromStorage();
    const filtered = accounts.filter(acc => acc.pubkey !== pubkey);
    localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(filtered));

    const active = loadActiveAccount();
    if (active === pubkey) {
      saveActiveAccount(null);
    }
  } catch (error) {
    console.error('Failed to remove account from storage:', error);
  }
}

export function canRestoreExtensionAccount(): boolean {
  return typeof window !== 'undefined' && 'nostr' in window && window.nostr !== undefined;
}

export function waitForExtension(timeoutMs: number = 3000): Promise<boolean> {
  return new Promise(resolve => {
    if (canRestoreExtensionAccount()) {
      resolve(true);
      return;
    }

    const startTime = Date.now();
    const checkInterval = 100;

    const check = () => {
      if (canRestoreExtensionAccount()) {
        resolve(true);
        return;
      }

      if (Date.now() - startTime >= timeoutMs) {
        resolve(false);
        return;
      }

      setTimeout(check, checkInterval);
    };

    check();
  });
}

export async function restoreAccount(
  accountData: PersistedAccount,
  skipExtensionWait: boolean = false
): Promise<IAccount | null> {
  try {
    switch (accountData.method) {
      case 'extension': {
        if (!skipExtensionWait && !canRestoreExtensionAccount()) {
          const extensionReady = await waitForExtension(3000);
          if (!extensionReady) {
            console.warn('Extension not available after waiting');
            return null;
          }
        } else if (skipExtensionWait && !canRestoreExtensionAccount()) {
          console.warn('Extension not available');
          return null;
        }
        const signer = new ExtensionSigner();
        const pubkey = await signer.getPublicKey();
        if (pubkey !== accountData.pubkey) {
          console.warn('Extension pubkey does not match stored pubkey');
          return null;
        }
        return new ExtensionAccount(pubkey, signer);
      }

      case 'nsec': {
        console.warn('Nsec accounts require re-authentication');
        return null;
      }

      case 'npub': {
        console.warn('Npub accounts are read-only and require re-login');
        return null;
      }

      case 'bunker': {
        if (!accountData.data) {
          console.warn('Bunker URI missing for account');
          return null;
        }
        try {
          const signer = await NostrConnectSigner.fromBunkerURI(accountData.data);
          const pubkey = await signer.getPublicKey();
          if (pubkey !== accountData.pubkey) {
            console.warn('Bunker pubkey does not match stored pubkey');
            return null;
          }
          return new NostrConnectAccount(pubkey, signer);
        } catch (error) {
          console.error('Failed to restore bunker account:', error);
          return null;
        }
      }

      default:
        console.warn('Unknown account method:', accountData.method);
        return null;
    }
  } catch (error) {
    console.error('Failed to restore account:', error);
    return null;
  }
}

export async function restoreAccountsToManager(accountManager: AccountManager): Promise<void> {
  const persistedAccounts = loadAccountsFromStorage();
  const activePubkey = loadActiveAccount();

  if (persistedAccounts.length === 0) {
    return;
  }

  const hasExtensionAccounts = persistedAccounts.some(acc => acc.method === 'extension');
  if (hasExtensionAccounts) {
    const extensionReady = await waitForExtension(3000);
    if (!extensionReady) {
      console.warn('Extension not available, extension accounts will not be restored');
    }
  }

  const restoredAccounts: IAccount[] = [];

  for (const accountData of persistedAccounts) {
    const account = await restoreAccount(accountData, true);
    if (account) {
      restoredAccounts.push(account);
      accountManager.addAccount(account);
    } else if (accountData.method !== 'nsec' && accountData.method !== 'npub') {
      removeAccountFromStorage(accountData.pubkey);
    }
  }

  if (activePubkey) {
    const activeAccount = restoredAccounts.find(acc => acc.pubkey === activePubkey);
    if (activeAccount) {
      accountManager.setActive(activeAccount);
    } else {
      saveActiveAccount(null);
    }
  }
}

export function clearAllAccounts(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_ACCOUNTS);
    localStorage.removeItem(STORAGE_KEY_ACTIVE);
  } catch (error) {
    console.error('Failed to clear accounts:', error);
  }
}
