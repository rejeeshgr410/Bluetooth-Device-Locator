import { useState, useEffect, useCallback } from 'react';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

export type ThemeMode = 'light' | 'dark';

/** Colour for a proximity band; both screens use it so the list and the hunt agree. */
export function proximityColor(proximity: string): string {
  switch (proximity) {
    case 'VERY CLOSE':
      return 'var(--c-success)';
    case 'NEARBY':
      return 'var(--c-primary)';
    case 'MID RANGE':
      return 'var(--c-warning)';
    case 'FAR':
      return 'var(--c-danger)';
    default:
      return 'var(--c-text-muted)';
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('bld_theme');
    return (saved === 'dark' || saved === 'light') ? saved : 'light'; // Light mode is default
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bld_theme', theme);
    // Edge-to-edge: the status bar sits on the app's own background, so its icons must
    // flip with the theme or they vanish (dark icons on the dark header).
    if (Capacitor.isNativePlatform()) {
      void SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, toggleTheme };
}
