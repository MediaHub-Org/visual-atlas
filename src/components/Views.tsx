import {useEffect, useState} from 'react';
import type {Dataset, Work} from '../data';
import type {TFn} from '../i18n';
import {CompanyTree} from './CompanyTree';
import {AxisView, type AxisScale} from './AxisView';

export function TableView({works, t, onSelect}: {works: Work[]; t: TFn; onSelect: (id: string) => void}) {
  return <div className="table-wrap"><table>
    <thead><tr><th>{t('common.work')}</th><th>{t('common.year')}</th><th>{t('filter.format')}</th><th>{t('common.continuity')}</th></tr></thead>
    <tbody>{works.map(work => <tr key={work.id}>
      <td><button onClick={() => onSelect(work.id)}>{work.title}</button></td>
      <td>{work.year ?? '—'}</td>
      <td>{t(`format.${work.format}`)}</td>
      <td>{work.memberships.map(m => `${m.franchise} / ${m.continuity}`).join('; ') || '—'}</td>
    </tr>)}</tbody>
  </table></div>;
}

export function SequenceView({dataset, works, t, onSelect, openId = '', focusWork = '', axis = false, onAxis, scale = 'proportional', onScale}: {
  dataset: Dataset;
  works: Work[];
  t: TFn;
  onSelect: (id: string) => void;
  /** Show each universe on its own calendar axis instead of the editorial lists. */
  axis?: boolean;
  onAxis?: (axis: boolean) => void;
  scale?: AxisScale;
  onScale?: (scale: AxisScale) => void;
  /** The one sequence to show open (arriving from a work's card); none opens by default. */
  openId?: string;
  focusWork?: string;
}) {
  useEffect(() => {
    if (!openId) return;
    document.getElementById(`seq-${openId}`)?.scrollIntoView({block: 'start'});
    document.getElementById(`seq-${openId}-${focusWork}`)?.scrollIntoView({block: 'center'});
  }, [openId, focusWork]);
  const visible = new Set(works.map(work => work.id));
  const sequences = dataset.sequences
    .map(sequence => ({...sequence, items: sequence.items.filter(item => visible.has(item.workId))}))
    .filter(sequence => sequence.items.length > 0);
  const placed = new Set(sequences.flatMap(sequence => sequence.items.map(item => item.workId)));
  const unplaced = works.filter(work => !placed.has(work.id));
  const calendars = [...dataset.calendars.keys()];
  const showAxis = axis && calendars.length > 0;
  return <div className="groups">
    {calendars.length > 0 && onAxis && <div className="segmented" role="group" aria-label={t('view.sequence')}>
      <button className={!showAxis ? 'selected' : ''} aria-pressed={!showAxis} onClick={() => onAxis(false)}>{t('view.list')}</button>
      <button className={showAxis ? 'selected' : ''} aria-pressed={showAxis} onClick={() => onAxis(true)}>{t('view.axis')}</button>
    </div>}
    {showAxis && calendars.map(id => <AxisView key={id} dataset={dataset} works={works} calendarId={id} scale={scale}
      onScale={next => onScale?.(next)} t={t} onSelect={onSelect}/>)}
    {!showAxis && <>
    <p>{t('sequence.note')}</p>
    {sequences.map(sequence => <details key={`${sequence.id}:${openId}`} id={`seq-${sequence.id}`} open={sequence.id === openId}>
      <summary>
        {sequence.franchise} / {sequence.continuity}
        <span className="badge proposal" title={t('sequence.badgeHint')}>{t('sequence.badge')}</span>
        <small className="basis">{sequence.basis.replace(/_/g, ' ')} · {sequence.items.length}</small>
      </summary>
      <div className="group-items">{sequence.items.map(item => {
        const work = dataset.worksById.get(item.workId);
        return work && <button key={work.id} id={`seq-${sequence.id}-${work.id}`} className={work.id === focusWork && sequence.id === openId ? 'focus' : ''} onClick={() => onSelect(work.id)}>
          <span>{item.position}</span>{work.title} <small>({work.year ?? t('detail.yearUnknown')}) · {t('sequence.review')}</small>
        </button>;
      })}</div>
    </details>)}
    {unplaced.length > 0 && <details>
      <summary>{t('sequence.unpositioned')}</summary>
      <div className="group-items">{unplaced.map(work => <button key={work.id} onClick={() => onSelect(work.id)}>
        {work.title} <small>· {t('sequence.positionUnknown')}</small>
      </button>)}</div>
    </details>}
    </>}
  </div>;
}

export function HierarchyView({dataset, t, onFranchise, focusCompany}: {
  dataset: Dataset;
  t: TFn;
  onFranchise: (name: string) => void;
  focusCompany?: string;
}) {
  const [mode, setMode] = useState<'corporate' | 'studio'>('corporate');
  return <section className="hierarchy">
    <div className="hierarchy-head">
      <div className="segmented" role="group" aria-label={t('hierarchy.groupBy')}>
        <button className={mode === 'corporate' ? 'selected' : ''} aria-pressed={mode === 'corporate'} onClick={() => setMode('corporate')}>{t('hierarchy.corporate')}</button>
        <button className={mode === 'studio' ? 'selected' : ''} aria-pressed={mode === 'studio'} onClick={() => setMode('studio')}>{t('hierarchy.studioAssociations')}</button>
      </div>
      <p>{t('hierarchy.note')}</p>
      {mode === 'studio' && <p>{t('hierarchy.modeNote')}</p>}
    </div>
    <CompanyTree dataset={dataset} mode={mode} t={t} onFranchise={onFranchise} focusId={focusCompany}/>
  </section>;
}
