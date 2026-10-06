import { useEffect } from 'react';
import type { Theme } from '../state/types';

export function useTheme(theme: Theme) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
}
