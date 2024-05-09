import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import React from 'react';

const ThemeSwitcher = () => {
  const [theme, setTheme] = React.useState('mydark');
  const toggleTheme = () => {
    setTheme(theme === 'mydark' ? 'mylight' : 'mydark');
  };
  // initially set the theme and "listen" for changes to apply them to the HTML tag
  React.useEffect(() => {
    document.querySelector('html')?.setAttribute('data-theme', theme);
  }, [theme]);
  return (
    <div className="tooltip tooltip-bottom" data-tip="Switch theme">
      <label className="swap swap-rotate">
        <input onClick={toggleTheme} type="checkbox" />
        <MoonIcon className="w-8 tooltip swap-on" />
        <SunIcon className="w-8 *:tooltip swap-off" />
      </label>
    </div>
  );
};

export default ThemeSwitcher;
