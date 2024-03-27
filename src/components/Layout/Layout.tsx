import { Outlet, useNavigate } from 'react-router-dom';
import { useNDK } from '../../ndk';
import './Layout.css';
import { ArrowUpOnSquareIcon } from '@heroicons/react/24/outline';

export const Layout = () => {
  const { user } = useNDK();
  const navigate = useNavigate();

  return (
    <div className="main">
      <div className="title">
        <a className="logo" onClick={() => navigate('/')}>
          <img src="/bouquet.png" /> <span>bouquet</span>
        </a>
        <div>
          <a className='action' onClick={() => navigate('/upload')}>
            <ArrowUpOnSquareIcon />
          </a>
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
