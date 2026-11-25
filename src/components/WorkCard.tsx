import type {Work} from '../data';
import type {TFn} from '../i18n';
import {factsOf} from '../facts';
import {useSettings} from '../settings';
import {BASE} from '../base';

export type PosterLookup = { ids: Set<string>; version: number; /** File type of a cover that is not a JPEG (png, webp). */ types?: Record<string, string> };

/** The work's own poster; a remaster without one shows the poster of the film or series it re-releases. */
export function posterUrl(work: {id: string; remasterOf?: string}, posters: PosterLookup) {
  const id = posters.ids.has(work.id) ? work.id : work.remasterOf && posters.ids.has(work.remasterOf) ? work.remasterOf : null;
  return id ? `${BASE}posters/${id}.${posters.types?.[id] ?? 'jpg'}?v=${posters.version}` : null;
}

/** A remaster (3D, restoration, special edition) or an announced work says so next to its title. */
export function Marks({work, t}: {work: Work; t: TFn}) {
  if (!work.remasterKind && !work.announced) return null;
  return <>
    {work.remasterKind && <span className="mark" title={t('remaster.hint')}>{t(`remaster.${work.remasterKind}`)}</span>}
    {work.announced && <span className="mark" title={t('status.announcedHint')}>{t('status.announced')}</span>}
  </>;
}

/** Icons and a people line for the text card style; a fact that is not known draws nothing. */
function Facts({work, t}: {work: Work; t: TFn}) {
  const facts = factsOf(work);
  return <span className="facts">
    <span className="fact" title={t(`format.${work.format}`)}><i aria-hidden="true">{facts.icon}</i>{t(`format.${work.format}`)}</span>
    {facts.anime && <span className="fact" title={t('format.Anime')}><i aria-hidden="true">✦</i>{t('format.Anime')}</span>}
    {facts.inWorld && <span className="fact" title={t('facts.inWorld')}><i aria-hidden="true">◷</i></span>}
    {facts.links > 0 && <span className="fact" title={t('facts.links', {n: facts.links})}><i aria-hidden="true">⇄</i>{facts.links}</span>}
    {facts.people && <span className="fact people" title={facts.people}><i aria-hidden="true">{facts.peopleKind === 'director' ? '☰' : '✎'}</i>{facts.people}</span>}
  </span>;
}

export function WorkCard({work, t, posters, onSelect}: {work: Work; t: TFn; posters: PosterLookup; onSelect: (id: string) => void}) {
  const {cardStyle} = useSettings();
  const poster = posterUrl(work, posters);
  const unspecified = work.memberships[0]?.continuity === 'Continuity not specified';
  const continuity = work.medium === 'text' && unspecified ? undefined : work.memberships[0]?.continuity;
  const yearMark = work.yearImported && <span className="imported-mark" title={t(work.medium === 'text' ? 'detail.yearImportedText' : 'detail.yearImported')}>*</span>;
  if (cardStyle === 'text') {
    const franchise = work.memberships[0]?.franchise;
    return <button className="card text-card" onClick={() => onSelect(work.id)}>
      <span className="card-title">{work.title} <span>
        {work.year === null ? `(${t('detail.yearUnknown').toLowerCase()})` : <> ({work.year}{yearMark})</>}
      </span> <Marks work={work} t={t}/></span>
      {franchise && <span className="text-franchise">{franchise}{!unspecified ? ` / ${work.memberships[0].continuity}` : ''}</span>}
      <Facts work={work} t={t}/>
    </button>;
  }
  return <button className="card" onClick={() => onSelect(work.id)}>
    <span className="poster" style={{'--poster': work.color} as React.CSSProperties}>
      {poster && <img className="local-poster" src={poster} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }}/>}
      <span className="poster-top">FRAME / {work.format.toUpperCase()}</span>
      <span className="poster-title">{work.title}</span>
      <span className="poster-bottom">{work.year ?? '—'} <span>✳</span></span>
    </span>
    <span className="card-title">{work.title} <span>
      {work.year === null ? `(${t('detail.yearUnknown').toLowerCase()})` : <> ({work.year}{yearMark})</>}
    </span> <Marks work={work} t={t}/></span>
    {continuity && <span className="badge">{continuity}</span>}
  </button>;
}

export function MiniWork({work, t, posters, onSelect, id, focus = false, badge, note}: {
  work: Work; t: TFn; posters: PosterLookup; onSelect: (id: string) => void;
  /** DOM id (lanes scroll to it), highlight, a corner badge (position) and a line replacing the format. */
  id?: string; focus?: boolean; badge?: React.ReactNode; note?: string;
}) {
  const {cardStyle} = useSettings();
  const poster = posterUrl(work, posters);
  const textOnly = cardStyle === 'text';
  return <button id={id} className={`mini-work ${focus ? 'focus' : ''} ${textOnly ? 'text-only' : ''}`} onClick={() => onSelect(work.id)}>
    {badge !== undefined && <span className="mini-badge">{badge}</span>}
    {!textOnly && <span className="mini-poster" style={{'--poster': work.color} as React.CSSProperties}>
      {poster ? <img src={poster} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }}/> : <span>{work.title.slice(0, 2)}</span>}
    </span>}
    <span className="mini-text">
      <strong>{work.title}</strong>
      <small>{note ?? `${work.year ?? t('detail.yearUnknown')} · ${t(`format.${work.format}`)}`}</small>
      {(work.remasterKind || work.announced) && <small><Marks work={work} t={t}/></small>}
      {textOnly && <Facts work={work} t={t}/>}
    </span>
  </button>;
}
