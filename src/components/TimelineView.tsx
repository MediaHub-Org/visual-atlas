import {useState} from 'react';
import type {Work} from '../data';
import {qty, type TFn} from '../i18n';
import type {TimelineScale} from '../settings';
import {MiniWork, type PosterLookup} from './WorkCard';

function gapFor(delta: number, scale: TimelineScale): number {
  if (scale === 'equal') return 30;
  if (scale === 'log') return Math.min(260, Math.max(24, Math.log2(delta + 1) * 46));
  return Math.min(340, Math.max(24, delta * 16));
}

export function TimelineView({works, scale, onScale, t, posters, onSelect}: {
  works: Work[];
  scale: TimelineScale;
  onScale: (scale: TimelineScale) => void;
  t: TFn;
  posters: PosterLookup;
  onSelect: (id: string) => void;
}) {
  const dated = works.filter((work): work is Work & {year: number} => work.year !== null);
  const years = [...new Set(dated.map(work => work.year))].sort((a, b) => a - b);
  const undated = works.filter(work => work.year === null);
  const [openYears, setOpenYears] = useState<Set<number>>(new Set());
  const toggle = (year: number) => setOpenYears(current => {
    const next = new Set(current);
    if (next.has(year)) next.delete(year); else next.add(year);
    return next;
  });

  return <section className="timeline">
    <header className="timeline-head">
      <p>{t('timeline.note')}</p>
      <div className="segmented" role="group" aria-label={t('timeline.scale')}>
        {(['equal', 'proportional', 'log'] as TimelineScale[]).map(option =>
          <button key={option} className={scale === option ? 'selected' : ''} aria-pressed={scale === option} onClick={() => onScale(option)}>
            {t(`timeline.${option}`)}
          </button>)}
      </div>
    </header>
    {years.length === 0 ? <div className="empty">{t('timeline.empty')}</div> : <>
      <p className="timeline-count">{qty(t, years.length, 'noun.year', 'noun.years')}</p>
      <div className="timeline-track">
        {years.map((year, index) => {
          const delta = index === 0 ? 0 : year - years[index - 1];
          const yearWorks = dated.filter(work => work.year === year);
          const expanded = openYears.has(year);
          const visible = expanded ? yearWorks : yearWorks.slice(0, 6);
          return <section className="tl-row" key={year} style={{marginTop: gapFor(delta, scale)}}>
            {delta > 0 && <span className="tl-delta" aria-hidden="true">{t('timeline.gap', {n: delta})}</span>}
            <div className="tl-year">
              <span className="tl-dot" aria-hidden="true"/>
              <strong>{year}</strong>
              <small>{yearWorks.length}</small>
            </div>
            <div className="tl-works">
              {visible.map(work => <MiniWork key={work.id} work={work} t={t} posters={posters} onSelect={onSelect}/>)}
              {yearWorks.length > 6 && <button className="tl-more" onClick={() => toggle(year)} aria-expanded={expanded}>
                {expanded ? '−' : `+${yearWorks.length - 6}`}
              </button>}
            </div>
          </section>;
        })}
      </div>
    </>}
    {undated.length > 0 && <p className="timeline-undated">{t('timeline.undated', {n: qty(t, undated.length, 'noun.work', 'noun.works')})}</p>}
  </section>;
}
