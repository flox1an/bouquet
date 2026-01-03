import React, { ReactNode } from 'react';

interface BottomNavbarProps {
  children: ReactNode;
}

const BottomNavbar: React.FC<BottomNavbarProps> = ({ children }) => {
  return (
    <div className="fixed bottom-0 left-0 w-full bg-card border-t shadow-lg">
      <div className="navbar">{children}</div>
    </div>
  );
};

export default BottomNavbar;
