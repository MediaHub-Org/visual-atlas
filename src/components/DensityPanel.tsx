import {useEffect, useRef} from 'react';
import type {TFn} from '../i18n';
import {useSettings, type Density, type TimelineScale} from '../settings';

/**
 * Right-hand panel for card size and timeline spacing. Both are saved preferences, so
 * they apply the same way in Cards, In-universe order and Release timeline.
 */
export function DensityPanel({t, onClose}: {t: TFn; onClose: () => void}) {
  const settings = useSettings();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('locked');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('locked');
      previous?.focus();
    };
  }, [onClose]);
  const group = <V extends string>(label: string, value: V, options: V[], text: (option: V) => string, set: (option: V) => void) =>
    <div className="setting-row">{label}
      <div className="segmented" role="group" aria-label={label}>
        {options.map(option => <button key={option} className={value === option ? 'selected' : ''} aria-pressed={value === option} onClick={() => set(option)}>{text(option)}</button>)}
      </div>
    </div>;
  return <div className="overlay" onClick={onClose}>
    <aside className="detail settings-panel" role="dialog" aria-modal="true" aria-labelledby="density-title" onClick={event => event.stopPropagation()}>
      <button ref={closeRef} className="close" aria-label={t('settings.close')} onClick={onClose}>✕</button>
      <div className="settings-body">
        <span className="eyebrow">{t('brand.sub')}</span>
        <h2 id="density-title">{t('density.title')}</h2>
        {group<Density>(t('density.cards'), settings.density, ['comfortable', 'compact'], option => t(`density.${option}`), option => settings.set({density: option}))}
        {group<TimelineScale>(t('density.spacing'), settings.timelineScale, ['equal', 'proportional', 'log'], option => t(`timeline.${option}`), option => settings.set({timelineScale: option}))}
        <p className="muted">{t('density.note')}</p>
      </div>
    </aside>
  </div>;
}
