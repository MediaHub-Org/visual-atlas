import type {Dataset, Work} from '../data';
import type {TFn} from '../i18n';
import {MiniWork, type PosterLookup} from './WorkCard';
import {axisGroups, formatSpan, formatYear, gapFor, orderConflicts, primaryOf, type Period} from '../chronology';

export type AxisScale = 'equal' | 'proportional';

/**
 * One universe on its own calendar: works sit on an axis by the start of their
 * primary in-world period, ties share a row, and works without a date are listed
 * apart (never dropped). Where the seed's list order disagrees with the dates the
 * pair is flagged; the dates never rewrite the list.
 */
export function AxisView({dataset, works, calendarId, scale, onScale, t, posters, onSelect}: {
  dataset: Dataset;
  posters: PosterLookup;
  works: Work[];
  calendarId: string;
  scale: AxisScale;
  onScale: (scale: AxisScale) => void;
  t: TFn;
  onSelect: (id: string) => void;
}) {
  const calendar = dataset.calendars.get(calendarId);
  if (!calendar) return null;
  const members = works.filter(work => work.memberships.some(m => m.franchise === calendar.franchise));
  if (members.length === 0) return null;
  const periodsOf = (work: Work): Period[] => work.inWorld?.calendarId === calendarId ? work.inWorld.periods : [];
  const {groups, undated} = axisGroups(members.map(work => ({id: work.id, periods: periodsOf(work)})));
  const byId = new Map(members.map(work => [work.id, work]));

  const startById = new Map<string, number>();
  for (const work of members) {
    const start = primaryOf(periodsOf(work))?.start;
    if (start !== null && start !== undefined) startById.set(work.id, start);
  }
  const conflicts = dataset.sequences
    .filter(sequence => sequence.franchise === calendar.franchise)
    .flatMap(sequence => orderConflicts(sequence.items.map(item => item.workId), startById)
      .map(pair => ({...pair, key: `${sequence.id}:${pair.earlier}:${pair.later}`})));

  const link = (id: string) => <button className="person" onClick={() => onSelect(id)}>{byId.get(id)?.title ?? dataset.worksById.get(id)?.title ?? id}</button>;

  return <section className="axis">
    <header className="axis-head">
      <h3>{calendar.franchise} · {calendar.name}</h3>
      <div className="segmented" role="group" aria-label={t('timeline.scale')}>
        {(['equal', 'proportional'] as AxisScale[]).map(option =>
          <button key={option} className={scale === option ? 'selected' : ''} aria-pressed={scale === option} onClick={() => onScale(option)}>
            {t(`timeline.${option}`)}
          </button>)}
      </div>
    </header>
    <p className="muted">{t('axis.note')}</p>
    {dataset.chronologySources.length > 0 && <p className="muted axis-source">
      {t('inworld.footer')} {dataset.chronologySources.map(source =>
        <a key={source.name} href={source.licenceUrl || undefined} target="_blank" rel="noreferrer">{source.name} · {source.licence}</a>)}
    </p>}

    {conflicts.length > 0 && <ul className="axis-conflicts">
      {conflicts.map(conflict => <li key={conflict.key}>
        {t('axis.conflict')} {link(conflict.earlier)} → {link(conflict.later)}
      </li>)}
    </ul>}

    {groups.length === 0 ? <div className="empty">{t('axis.empty')}</div> : <div className="axis-track">
      {groups.map((group, index) => {
        const delta = index === 0 ? 0 : group.start - groups[index - 1].start;
        return <section className="axis-row" key={group.start} style={{marginTop: gapFor(delta, scale)}}>
          <div className="axis-year"><span className="tl-dot" aria-hidden="true"/><strong>{formatYear(group.start, calendar)}</strong>
            {group.ids.length > 1 && <small>{t('axis.tie', {n: group.ids.length})}</small>}
          </div>
          <div className="axis-works">{group.ids.map(id => {
            const work = byId.get(id)!;
            const period = primaryOf(periodsOf(work))!;
            const span = period.end !== null && period.start !== null ? Math.max(0, period.end - period.start) : 0;
            const note = `${period.qualifier === 'circa' ? 'c. ' : ''}${formatSpan(period, calendar)}${period.qualifier === 'open_after' ? ` ${t('inworld.openAfter')}` : ''} · ${t(`format.${work.format}`)}`;
            return <div key={id} className="axis-item">
              <span className="axis-bar" aria-hidden="true" style={{height: 10 + (scale === 'proportional' ? span * 10 : Math.min(span, 1) * 14), opacity: period.qualifier === 'open_after' ? 0.45 : 1}}/>
              <MiniWork work={work} t={t} posters={posters} onSelect={onSelect} note={note}/>
            </div>;
          })}</div>
        </section>;
      })}
    </div>}

    {undated.length > 0 && <details className="axis-undated" open>
      <summary>{t('axis.undated', {n: undated.length})}</summary>
      <div className="lane-works wide">{undated.map(id => <MiniWork key={id} work={byId.get(id)!} t={t} posters={posters} onSelect={onSelect}/>)}</div>
    </details>}
  </section>;
}
