import { useActiveAccount, useAccountManager } from 'applesauce-react/hooks';
import { useNDK } from '../utils/ndk';
import { useLoginActions, ExtensionMissingError } from './useLoginActions';

export { ExtensionMissingError };

export function useCurrentUser() {
  const { user, setUserFromPubkey, clearUser } = useNDK();
  const activeAccount = useActiveAccount();
  const accountManager = useAccountManager();
  const loginActions = useLoginActions();

  const loginWithExtension = async (): Promise<void> => {
    await loginActions.extension();
    const account = accountManager.active;
    if (account) {
      setUserFromPubkey(account.pubkey);
    }
  };

  const loginWithBunker = async (uri: string): Promise<void> => {
    await loginActions.bunker(uri);
    const account = accountManager.active;
    if (account) {
      setUserFromPubkey(account.pubkey);
    }
  };

  const loginWithNsec = async (nsec: string): Promise<void> => {
    await loginActions.nsec(nsec);
    const account = accountManager.active;
    if (account) {
      setUserFromPubkey(account.pubkey);
    }
  };

  const logout = (): void => {
    loginActions.logout();
    // Check if there are remaining accounts
    if (accountManager.accounts.length > 0 && accountManager.active) {
      setUserFromPubkey(accountManager.active.pubkey);
    } else {
      clearUser();
    }
  };

  const logoutAll = (): void => {
    loginActions.logoutAll();
    clearUser();
  };

  return {
    user,
    activeAccount,
    accounts: accountManager.accounts,
    loginWithExtension,
    loginWithBunker,
    loginWithNsec,
    logout,
    logoutAll,
  };
}
