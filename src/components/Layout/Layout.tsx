import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useNDK } from '../../utils/ndk';
import './Layout.css';
import { ArrowUpOnSquareIcon, MagnifyingGlassIcon, ServerStackIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import ThemeSwitcher from '../ThemeSwitcher';
import AudioPlayer from '../AudioPlayer';
import BottomNavbar from '../BottomNavBar/BottomNavBar';
import { useGlobalContext } from '../../GlobalState';
import Login from './Login';
import useLocalStorageState from '../../utils/useLocalStorageState';

export const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loginWithExtension, logout } = useNDK();
  const { state } = useGlobalContext();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [autoLogin, setAutoLogin] = useLocalStorageState('autologin', { defaultValue: false });

  useEffect(() => {
    if (!user && autoLogin) loginWithExtension();
  }, []);

  const navItems = (
    <>
      <button
        className={`btn ${location.pathname == '/upload' ? 'btn-neutral' : ''} `}
        onClick={() => navigate('/upload')}
      >
        <ArrowUpOnSquareIcon /> Upload
      </button>
      <button
        className={`btn ${location.pathname == '/browse' ? 'btn-neutral' : ''} `}
        onClick={() => navigate('/browse')}
      >
        <MagnifyingGlassIcon /> Browse
      </button>
      <button className={`btn ${location.pathname == '/sync' ? 'btn-neutral' : ''} `} onClick={() => navigate('/sync')}>
        <ServerStackIcon /> Sync
      </button>
    </>
  );

  return (
    <div className="main">
      <div className="navbar bg-base-300">
        <div className="navbar-start">
          <div className="flex-none md:hidden">
            <div className="dropdown dropdown-bottom">
              <button className="btn btn-square btn-ghost" onClick={() => setShowMobileMenu(!showMobileMenu)}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  className="inline-block w-5 h-5 stroke-current"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
                </svg>
              </button>
            </div>
          </div>
          <button className="btn btn-ghost text-xl">
            <a className="logo" onClick={() => navigate('/browse')}>
              <img className="w-8" src="/bouquet.png" />{' '}
            </a>
            <span>bouquet</span>
          </button>
        </div>
        <div className="navbar-center hidden md:flex gap-2">{navItems}</div>
        <div className="navbar-end">
          <ThemeSwitcher />
          {user && (
            <div className="avatar px-4">
              <div className="w-12 rounded-full">
                <a
                  className="link"
                  onClick={() => {
                    setAutoLogin(false);
                    logout();
                  }}
                >
                  <img src={user?.profile?.image} />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
      {showMobileMenu && (
        <div className="navbar bg-base-300 md:hidden">
          <div className="navbar-center gap-2">{navItems}</div>
        </div>
      )}
      <div className="content">{user ? <Outlet /> : <Login />}</div>
      {state.currentSong && (
        <BottomNavbar>
          <AudioPlayer />
        </BottomNavbar>
      )}
      <div className="footer">
        <span className="flex flex-row gap-1 items-center">
          made with <span>💜</span>by
          <a
            href="https://njump.me/npub1klr0dy2ul2dx9llk58czvpx73rprcmrvd5dc7ck8esg8f8es06qs427gxc"
            className="flex flex-row gap-1 items-center"
          >
            <div className="avatar">
              <div className="w-8 rounded-full">
                <img src="https://image.nostr.build/0ebb55ed4d269015f2c6fb7119e8ff8686110cad690443894b31287866758a5e.jpg" />
              </div>
            </div>
            Florian
          </a>
        </span>
      </div>
    </div>
  );
};
