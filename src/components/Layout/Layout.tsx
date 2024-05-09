import { Outlet, useNavigate } from 'react-router-dom';
import { useNDK } from '../../utils/ndk';
import './Layout.css';
import { ArrowUpOnSquareIcon, MagnifyingGlassIcon, ServerStackIcon } from '@heroicons/react/24/outline';
import { useEffect } from 'react';
import ThemeSwitcher from '../ThemeSwitcher';

export const Layout = () => {
  const navigate = useNavigate();
  const { loginWithExtension, user } = useNDK();

  useEffect(() => {
    if (!user) loginWithExtension();
  }, []);

  return (
    <div className="main">
      <div className="navbar bg-base-300">
        <div className="navbar-start">
          <button className="btn btn-ghost text-xl">
            <a className="logo" onClick={() => navigate('/')}>
              <img className="w-8" src="/bouquet.png" />{' '}
            </a>
            <span>bouquet</span>
          </button>
        </div>
        <div className="navbar-center">
          <button className=" btn btn-ghost" onClick={() => navigate('/upload')}>
            <ArrowUpOnSquareIcon /> Upload
          </button>
          <button className=" btn btn-ghost" onClick={() => navigate('/')}>
            <MagnifyingGlassIcon /> Browse
          </button>
          <button className=" btn btn-ghost" onClick={() => navigate('/transfer')}>
            <ServerStackIcon /> Sync
          </button>
        </div>
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
      <div className="footer">
        made with 💜 by{' '}
        <a href="https://njump.me/npub1klr0dy2ul2dx9llk58czvpx73rprcmrvd5dc7ck8esg8f8es06qs427gxc">florian</a>
      </div>
    </div>
  );
};
