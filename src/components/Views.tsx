import {useEffect, useState} from 'react';
import type {Dataset, Work} from '../data';
import {qty, type TFn} from '../i18n';
import {CompanyTree} from './CompanyTree';
import {AxisView} from './AxisView';
import {useSettings} from '../settings';
import type {Medium} from '../medium';
import {buildBlocks} from '../families';
import {MiniWork, type PosterLookup} from './WorkCard';

export function SequenceView({dataset, works, t, posters, medium = 'video', onSelect, openId = '', focusWork = '', axis = false, onAxis}: {
  dataset: Dataset;
  works: Work[];
  t: TFn;
  posters: PosterLookup;
  /** Read mode has no in-world order yet: it lists works grouped by series, unordered. */
  medium?: Medium;
  onSelect: (id: string) => void;
  /** Show each universe on its own calendar axis instead of the editorial lists. */
  axis?: boolean;
  onAxis?: (axis: boolean) => void;
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
  const calendars = [...dataset.calendars.values()];
  const {density} = useSettings();
  const read = medium === 'text';
  const showAxis = axis && calendars.length > 0 && !read;
  const franchiseOf = new Map(dataset.franchises.map(franchise => [franchise.id, franchise]));
  const continuityLabel = new Map(dataset.sequences.map(sequence => [sequence.continuityId, `${sequence.franchise} / ${sequence.continuity}`]));

  // One block per family (Marvel, DC) or franchise; one lane per continuity. Blocks
  // with no visible work are not shown, and lanes are never merged.
  const blocks = buildBlocks(dataset.franchises, dataset.families).map(block => {
    const ids = new Set(block.franchiseIds);
    const lanes = block.franchiseIds.flatMap(id => sequences.filter(sequence => sequence.franchiseId === id));
    const members = works.filter(work => work.memberships.some(m => ids.has(m.franchiseId)));
    const unplaced = members.filter(work => !placed.has(work.id));
    const calendar = calendars.find(entry => block.franchiseIds.some(id => franchiseOf.get(id)?.name === entry.franchise));
    const notes = new Map((dataset.families.find(family => family.id === block.id)?.sameWorld ?? []).map(note => [note.continuityId, note.asContinuityId]));
    return {...block, lanes, members, unplaced, calendar, notes};
  }).filter(block => block.members.length > 0 || block.lanes.length > 0);
  const orphans = works.filter(work => !placed.has(work.id) && !blocks.some(block => block.members.includes(work)));
  const openByDefault = blocks.length <= 3;
  const hasDates = calendars.some(calendar => works.some(work => work.inWorld?.calendarId === calendar.id));
  // The same cards as the release timeline; a lane card carries its position.
  const card = (work: Work | undefined, key: string, sequenceId = '', position?: number, extra = '') => work && <MiniWork key={key}
    work={work} t={t} posters={posters} onSelect={onSelect}
    id={sequenceId ? `seq-${sequenceId}-${work.id}` : undefined}
    focus={work.id === focusWork && sequenceId === openId}
    badge={position} note={`${work.year ?? t('detail.yearUnknown')} · ${t(`format.${work.format}`)}${extra}`}/>;

  return <div className={`groups universe-blocks ${density}`}>
    {calendars.length > 0 && onAxis && !read && <div className="segmented" role="group" aria-label={t('view.sequence')}>
      <button className={!showAxis ? 'selected' : ''} aria-pressed={!showAxis} onClick={() => onAxis(false)}>{t('universe.lanes')}</button>
      <button className={showAxis ? 'selected' : ''} aria-pressed={showAxis} onClick={() => onAxis(true)}>{t('view.axis')}</button>
    </div>}
    <p>{t(read ? 'universe.readNote' : 'sequence.note')}</p>
    {showAxis && !hasDates && <div className="empty">{t('axis.none')}</div>}
    {blocks.map(block => {
      const onAxisNow = showAxis && block.calendar !== undefined;
      return <details key={`${block.id}:${openId}`} id={`block-${block.id}`} className="universe-block"
        open={openByDefault || block.lanes.some(lane => lane.id === openId) || onAxisNow}>
        <summary>
          <strong>{block.name}</strong>
          <small className="basis">{read ? '' : `${block.lanes.length} ${t('universe.lanesCount')} · `}{qty(t, block.members.length, 'noun.work', 'noun.works')}</small>
          {block.family && (dataset.families.find(family => family.id === block.id)?.theory
            ? <span className="badge proposal" title={t('universe.theoryHint')}>{t('universe.theory')}</span>
            : <span className="badge" title={t('universe.familyHint')}>{t('universe.family')}</span>)}
          {!read && <span className="badge proposal" title={t('sequence.badgeHint')}>{t('sequence.badge')}</span>}
        </summary>
        {onAxisNow && block.calendar && <AxisView dataset={dataset} works={works} calendarId={block.calendar.id} posters={posters} t={t} onSelect={onSelect}/>}
        {!onAxisNow && <>
          {!block.calendar && !read && <p className="lane-note">{t('universe.noDates')}</p>}
          <div className="lanes">
            {block.lanes.map(lane => {
              const same = block.notes.get(lane.continuityId);
              return <section key={lane.id} id={`seq-${lane.id}`} className={`lane ${lane.id === openId ? 'open' : ''}`}>
                <h4>{block.franchiseIds.length > 1 && <small>{lane.franchise}</small>}{lane.continuity}
                  <small className="basis">{lane.basis.replace(/_/g, ' ')} · {lane.items.length}</small></h4>
                {same && <p className="lane-note">{t('universe.sameWorld')} {continuityLabel.get(same) ?? same}</p>}
                <div className="lane-works">{lane.items.map(item => card(dataset.worksById.get(item.workId), item.workId, lane.id, item.position))}</div>
              </section>;
            })}
          </div>
          {/* Read mode has no order at all, so its works are the content, not a hidden leftover. */}
          {read && <div className="lane-works wide">{block.unplaced.map(work => card(work, work.id))}</div>}
          {!read && block.unplaced.length > 0 && <details>
            <summary>{t('sequence.unpositioned')} · {block.unplaced.length}</summary>
            <div className="lane-works wide">{block.unplaced.map(work => card(work, work.id, '', undefined, ` · ${t('sequence.positionUnknown')}`))}</div>
          </details>}
        </>}
      </details>;
    })}
    {orphans.length > 0 && <details>
      <summary>{t('sequence.unpositioned')} · {orphans.length}</summary>
      <div className="lane-works wide">{orphans.map(work => card(work, work.id, '', undefined, ` · ${t('sequence.positionUnknown')}`))}</div>
    </details>}
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
