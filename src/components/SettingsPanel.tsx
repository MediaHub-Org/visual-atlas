import {useEffect, useRef, useState} from 'react';
import type {TFn} from '../i18n';
import {CALENDARS, useSettings, type CalendarId} from '../settings';

function formatInCalendar(date: Date, calendar: CalendarId): string {
  return new Intl.DateTimeFormat('en', {
    calendar,
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    era: 'short',
  }).format(date);
}

function CalendarConverter({t}: {t: TFn}) {
  const {calendar, language} = useSettings();
  const [date, setDate] = useState('');
  const [target, setTarget] = useState<CalendarId>(calendar);
  useEffect(() => setTarget(calendar), [calendar]);
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  let result = '';
  if (parts) {
    const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
    const value = new Date(0);
    value.setUTCFullYear(year, month - 1, day);
    value.setUTCHours(12, 0, 0, 0);
    if (value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day) {
      try {
        result = formatInCalendar(value, target);
      } catch {
        result = '';
      }
    }
  }
  return <section className="converter">
    <p>{t('settings.converterNote')}</p>
    <div className="calendar-controls">
      <label>{t('settings.date')} <input type="date" value={date} onChange={event => setDate(event.target.value)}/></label>
      <label>{t('settings.displayCalendar')}
        <select value={target} onChange={event => setTarget(event.target.value as CalendarId)}>
          {CALENDARS.map(entry => <option key={entry.id} value={entry.id}>{language === 'es' ? entry.es : entry.en}</option>)}
        </select>
      </label>
    </div>
    <output aria-live="polite">{result || (date ? t('settings.invalidDate') : t('settings.chooseDate'))}</output>
    <p>{t('settings.converterCaveat')}</p>
  </section>;
}

export function SettingsPanel({onClose, posterCount, configured}: {onClose: () => void; posterCount: number; configured: boolean}) {
  const settings = useSettings();
  const {t} = settings;
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const panel = closeRef.current?.closest('.detail');
      if (!panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>('button, a[href], input, select')].filter(element => !element.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('locked');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('locked');
      previous?.focus();
    };
  }, [onClose]);

  return <div className="overlay" onClick={onClose}>
    <aside className="detail settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={event => event.stopPropagation()}>
      <button ref={closeRef} className="close" aria-label={t('settings.close')} onClick={onClose}>✕</button>
      <div className="settings-body">
        <span className="eyebrow">{t('brand.sub')}</span>
        <h2 id="settings-title">{t('settings.title')}</h2>

        <h3>{t('settings.appearance')}</h3>
        <label className="setting-row">{t('settings.language')}
          <select value={settings.language} onChange={event => settings.set({language: event.target.value as 'en' | 'es'})}>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </label>
        <label className="setting-row">{t('settings.theme')}
          <select value={settings.theme} onChange={event => settings.set({theme: event.target.value as 'dark' | 'light' | 'system'})}>
            <option value="dark">{t('settings.dark')}</option>
            <option value="light">{t('settings.light')}</option>
            <option value="system">{t('settings.system')}</option>
          </select>
        </label>

        <h3>{t('settings.calendar')}</h3>
        <label className="setting-row">{t('settings.calendar')}
          <select value={settings.calendar} onChange={event => settings.set({calendar: event.target.value as CalendarId})}>
            {CALENDARS.map(entry => <option key={entry.id} value={entry.id}>{settings.language === 'es' ? entry.es : entry.en}</option>)}
          </select>
        </label>
        <p className="muted">{t('settings.calendarNote')}</p>

        <h3>{t('settings.cards')}</h3>
        <label className="setting-row">{t('card.style')}
          <select value={settings.cardStyle} onChange={event => settings.set({cardStyle: event.target.value === 'text' ? 'text' : 'poster'})}>
            <option value="poster">{t('card.poster')}</option>
            <option value="text">{t('card.text')}</option>
          </select>
        </label>

        <h3>{t('settings.converter')}</h3>
        <CalendarConverter t={t}/>

        <h3>{t('settings.offline')}</h3>
        <p className="muted">{t('settings.offlineNote')}</p>
        <p className="muted">{t('settings.posterCount', {n: posterCount})} {configured ? t('settings.keyYes') : t('settings.keyNo')}</p>

        <button className="reset" onClick={settings.reset}>{t('settings.reset')}</button>
      </div>
    </aside>
  </div>;
}
