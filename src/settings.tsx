import {createContext, useContext, useEffect, useMemo, useState, type ReactNode} from 'react';
import {translate, type Language, type MessageKey} from './i18n';

export type Theme = 'dark' | 'light' | 'system';
export type CalendarId = 'gregory' | 'hebrew' | 'islamic-civil' | 'islamic-umalqura' | 'islamic-tbla';
export type TimelineScale = 'equal' | 'proportional' | 'log';

export type Preferences = {
  language: Language;
  theme: Theme;
  calendar: CalendarId;
  timelineScale: TimelineScale;
};

export const CALENDARS: {id: CalendarId; en: string; es: string}[] = [
  {id: 'gregory', en: 'Gregorian', es: 'Gregoriano'},
  {id: 'hebrew', en: 'Hebrew', es: 'Hebreo'},
  {id: 'islamic-civil', en: 'Islamic civil (tabular)', es: 'Islámico civil (tabular)'},
  {id: 'islamic-umalqura', en: 'Islamic Umm al-Qura', es: 'Islámico Umm al-Qura'},
  {id: 'islamic-tbla', en: 'Islamic astronomical tabular', es: 'Islámico astronómico tabular'},
];

const DEFAULTS: Preferences = {language: 'en', theme: 'dark', calendar: 'gregory', timelineScale: 'proportional'};
const STORAGE_KEY = 'atlas.preferences.v1';

function readPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      language: parsed.language === 'es' ? 'es' : 'en',
      theme: parsed.theme === 'light' || parsed.theme === 'system' ? parsed.theme : 'dark',
      calendar: CALENDARS.some(entry => entry.id === parsed.calendar) ? parsed.calendar! : DEFAULTS.calendar,
      timelineScale: parsed.timelineScale === 'equal' || parsed.timelineScale === 'log' ? parsed.timelineScale : 'proportional',
    };
  } catch {
    return DEFAULTS;
  }
}

type SettingsValue = Preferences & {
  set: (patch: Partial<Preferences>) => void;
  reset: () => void;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
};

const Context = createContext<SettingsValue | null>(null);

export function SettingsProvider({children}: {children: ReactNode}) {
  const [preferences, setPreferences] = useState<Preferences>(readPreferences);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);
  useEffect(() => {
    const root = document.documentElement;
    root.lang = preferences.language;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const resolved = preferences.theme === 'system' ? (media.matches ? 'light' : 'dark') : preferences.theme;
      root.dataset.theme = resolved;
      root.dataset.themePreference = preferences.theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preferences.language, preferences.theme]);
  const value = useMemo<SettingsValue>(() => ({
    ...preferences,
    set: patch => setPreferences(current => ({...current, ...patch})),
    reset: () => setPreferences(DEFAULTS),
    t: (key, values) => translate(preferences.language, key, values),
  }), [preferences]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSettings(): SettingsValue {
  const value = useContext(Context);
  if (!value) throw new Error('useSettings must be used inside SettingsProvider');
  return value;
}
