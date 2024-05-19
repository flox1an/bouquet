import { Outlet, useNavigate } from 'react-router-dom';
import { useNDK } from '../../utils/ndk';
import './Layout.css';
import { ArrowUpOnSquareIcon, MagnifyingGlassIcon, ServerStackIcon } from '@heroicons/react/24/outline';
import { useEffect } from 'react';
import ThemeSwitcher from '../ThemeSwitcher';
import AudioPlayer from '../AudioPlayer';
import BottomNavbar from '../BottomNavBar/BottomNavBar';

export const Layout = () => {
  const navigate = useNavigate();
  const { loginWithExtension, user } = useNDK();

  useEffect(() => {
    if (!user) loginWithExtension();
  }, []);

  const navItems = (
    <>
      <button className="btn" onClick={() => navigate('/upload')}>
        <ArrowUpOnSquareIcon /> Upload
      </button>
      <button className="btn" onClick={() => navigate('/')}>
        <MagnifyingGlassIcon /> Browse
      </button>
      <button className="btn" onClick={() => navigate('/transfer')}>
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
              <button className="btn btn-square btn-ghost">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  className="inline-block w-5 h-5 stroke-current"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
                </svg>
              </button>{' '}
              <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-[11em]">
                {navItems}
              </ul>
            </div>
          </div>
          <button className="btn btn-ghost text-xl">
            <a className="logo" onClick={() => navigate('/')}>
              <img className="w-8" src="/bouquet.png" />{' '}
            </a>
            <span>bouquet</span>
          </button>
        </div>
        <div className="navbar-center hidden md:block">{navItems}</div>
        <div className="navbar-end">

          <ThemeSwitcher />
          <div className="avatar px-4">
            <div className="w-12 rounded-full">
              <img src={user?.profile?.image} />
            </div>
          </div>
        </div>
      </div>

      <div className="content">{<Outlet />}</div>
      <BottomNavbar>
      <AudioPlayer />

      </BottomNavbar>
      <div className="footer">
        <span className="whitespace-nowrap block">
          made with 💜 by{' '}
          <a href="https://njump.me/npub1klr0dy2ul2dx9llk58czvpx73rprcmrvd5dc7ck8esg8f8es06qs427gxc">florian</a>
        </span>
      </div>
    </div>
  );
};
