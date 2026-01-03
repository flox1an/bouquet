import { Moon, Sun } from 'lucide-react';
import React from 'react';
import { Button } from '@/components/ui/button';

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
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      title="Switch theme"
    >
      {theme === 'mydark' ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
    </Button>
  );
};

export default ThemeSwitcher;
