import React, { useState } from 'react';
import useLocalStorageState from '../../utils/useLocalStorageState';
import { useCurrentUser, ExtensionMissingError } from '../../hooks/useCurrentUser';

type LoginMethod = 'extension' | 'bunker' | 'nsec';

const Login: React.FC = () => {
  const { loginWithExtension, loginWithBunker, loginWithNsec } = useCurrentUser();
  const [, setAutoLogin] = useLocalStorageState('autologin', { defaultValue: false });

  const [activeTab, setActiveTab] = useState<LoginMethod>('extension');
  const [bunkerUri, setBunkerUri] = useState('');
  const [nsecKey, setNsecKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleExtensionLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await loginWithExtension();
      setAutoLogin(true);
    } catch (err) {
      if (err instanceof ExtensionMissingError) {
        setError('No Nostr extension found. Please install Alby, nos2x, or another NIP-07 extension.');
      } else {
        setError(err instanceof Error ? err.message : 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBunkerLogin = async () => {
    if (!bunkerUri.trim()) {
      setError('Please enter a bunker URI');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await loginWithBunker(bunkerUri);
      setAutoLogin(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bunker login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleNsecLogin = async () => {
    if (!nsecKey.trim()) {
      setError('Please enter your nsec key');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await loginWithNsec(nsecKey);
      // Don't auto-login with nsec for security
      setAutoLogin(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nsec login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col justify-center items-center h-[80vh] gap-4">
      <img src="/bouquet.png" alt="logo" className="w-28" />
      <h1 className="text-4xl font-bold">bouquet</h1>
      <h2 className="text-xl">organize assets your way</h2>

      <div className="card bg-base-200 w-96 mt-8">
        <div className="card-body">
          <div role="tablist" className="tabs tabs-boxed">
            <button
              role="tab"
              className={`tab ${activeTab === 'extension' ? 'tab-active' : ''}`}
              onClick={() => { setActiveTab('extension'); setError(null); }}
            >
              Extension
            </button>
            <button
              role="tab"
              className={`tab ${activeTab === 'bunker' ? 'tab-active' : ''}`}
              onClick={() => { setActiveTab('bunker'); setError(null); }}
            >
              Bunker
            </button>
            <button
              role="tab"
              className={`tab ${activeTab === 'nsec' ? 'tab-active' : ''}`}
              onClick={() => { setActiveTab('nsec'); setError(null); }}
            >
              Nsec
            </button>
          </div>

          {error && (
            <div className="alert alert-error mt-4">
              <span>{error}</span>
            </div>
          )}

          <div className="mt-4">
            {activeTab === 'extension' && (
              <div className="flex flex-col gap-4">
                <p className="text-sm opacity-70">
                  Login using a browser extension like Alby, nos2x, or Nostr Connect.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={handleExtensionLogin}
                  disabled={loading}
                >
                  {loading ? <span className="loading loading-spinner" /> : 'Login with Extension'}
                </button>
              </div>
            )}

            {activeTab === 'bunker' && (
              <div className="flex flex-col gap-4">
                <p className="text-sm opacity-70">
                  Login using a NIP-46 bunker connection string.
                </p>
                <input
                  type="text"
                  placeholder="bunker://..."
                  className="input input-bordered w-full"
                  value={bunkerUri}
                  onChange={(e) => setBunkerUri(e.target.value)}
                  disabled={loading}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleBunkerLogin}
                  disabled={loading || !bunkerUri.trim()}
                >
                  {loading ? <span className="loading loading-spinner" /> : 'Connect to Bunker'}
                </button>
              </div>
            )}

            {activeTab === 'nsec' && (
              <div className="flex flex-col gap-4">
                <p className="text-sm opacity-70">
                  Login with your private key. Your key is never stored.
                </p>
                <input
                  type="password"
                  placeholder="nsec1... or ncryptsec1..."
                  className="input input-bordered w-full"
                  value={nsecKey}
                  onChange={(e) => setNsecKey(e.target.value)}
                  disabled={loading}
                />
                <div className="alert alert-warning">
                  <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-sm">For security, you'll need to re-enter your key each session.</span>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleNsecLogin}
                  disabled={loading || !nsecKey.trim()}
                >
                  {loading ? <span className="loading loading-spinner" /> : 'Login with Nsec'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
