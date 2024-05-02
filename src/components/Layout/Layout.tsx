import { Outlet, useNavigate } from 'react-router-dom';
import { useNDK } from '../../utils/ndk';
import './Layout.css';
import { ArrowUpOnSquareIcon } from '@heroicons/react/24/outline';
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
      <div className="title">
        <a className="logo" onClick={() => navigate('/')}>
          <img src="/bouquet.png" /> <span>bouquet</span>
        </a>
        <div>
          <ThemeSwitcher />
          <div className="tooltip tooltip-bottom" data-tip="Upload">
            <button className=" btn btn-square btn-ghost" onClick={() => navigate('/upload')}>
              <ArrowUpOnSquareIcon />
            </button>
          </div>
        </div>
        <div className="avatar">
          <img src={user?.profile?.image} />
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
