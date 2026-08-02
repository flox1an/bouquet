import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface PasswordPromptOptions {
  title?: string;
  description?: string;
  confirmLabel?: string;
}

interface PasswordPromptContextValue {
  promptPassword: (opts?: PasswordPromptOptions) => Promise<string | null>;
}

const PasswordPromptContext = createContext<PasswordPromptContextValue | null>(null);

export function usePasswordPrompt(): PasswordPromptContextValue {
  const ctx = useContext(PasswordPromptContext);
  if (!ctx) throw new Error('usePasswordPrompt must be used within a PasswordPromptProvider');
  return ctx;
}

/**
 * Imperative password prompt. Components call `promptPassword()` and await the
 * resolved value (the password) or `null` if the user cancelled. Replaces the
 * blocking, insecure browser `prompt()` used for ncryptsec decryption.
 */
export function PasswordPromptProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PasswordPromptOptions>({});
  const [value, setValue] = useState('');
  const resolver = useRef<((value: string | null) => void) | null>(null);

  const settle = useCallback((result: string | null) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpen(false);
  }, []);

  const promptPassword = useCallback((opts: PasswordPromptOptions = {}) => {
    setOptions(opts);
    setValue('');
    setOpen(true);
    return new Promise<string | null>(resolve => {
      resolver.current = resolve;
    });
  }, []);

  return (
    <PasswordPromptContext.Provider value={{ promptPassword }}>
      {children}
      <Dialog
        open={open}
        onOpenChange={next => {
          if (!next) settle(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <form
            onSubmit={e => {
              e.preventDefault();
              if (!value) return;
              settle(value);
            }}
          >
            <DialogHeader>
              <DialogTitle>{options.title ?? 'Enter password'}</DialogTitle>
              {options.description && <DialogDescription>{options.description}</DialogDescription>}
            </DialogHeader>
            <Input
              type="password"
              autoComplete="current-password"
              autoFocus
              className="mt-3"
              placeholder="Password"
              value={value}
              onChange={e => setValue(e.target.value)}
            />
            <DialogFooter className="mt-4 gap-2 sm:gap-2">
              <Button type="button" variant="ghost" onClick={() => settle(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!value}>
                {options.confirmLabel ?? 'Unlock'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PasswordPromptContext.Provider>
  );
}
