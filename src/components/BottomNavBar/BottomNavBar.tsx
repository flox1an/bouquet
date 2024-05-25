import React, { ReactNode } from 'react';

interface BottomNavbarProps {
  children: ReactNode;
}

const BottomNavbar: React.FC<BottomNavbarProps> = ({ children }) => {
  return (
    <div className="fixed bottom-0 left-0 w-full bg-base-300 shadow-[0px_0px_4px_0px_rgba(0,0,0,.4)] ">
      <div className="navbar">{children}</div>
    </div>
  );
};

export default BottomNavbar;
