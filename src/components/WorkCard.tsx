import type {Work} from '../data';
import type {TFn} from '../i18n';
import {factsOf} from '../facts';
import {useSettings} from '../settings';

export type PosterLookup = { ids: Set<string>; version: number; /** File type of a cover that is not a JPEG (png, webp). */ types?: Record<string, string> };

export function posterUrl(workId: string, posters: PosterLookup) {
  return posters.ids.has(workId) ? `/posters/${workId}.${posters.types?.[workId] ?? 'jpg'}?v=${posters.version}` : null;
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
  const poster = posterUrl(work.id, posters);
  const unspecified = work.memberships[0]?.continuity === 'Continuity not specified';
  const continuity = work.medium === 'text' && unspecified ? undefined : work.memberships[0]?.continuity;
  const yearMark = work.yearImported && <span className="imported-mark" title={t(work.medium === 'text' ? 'detail.yearImportedText' : 'detail.yearImported')}>*</span>;
  if (cardStyle === 'text') {
    const franchise = work.memberships[0]?.franchise;
    return <button className="card text-card" onClick={() => onSelect(work.id)}>
      <span className="card-title">{work.title} <span>
        {work.year === null ? `(${t('detail.yearUnknown').toLowerCase()})` : <> ({work.year}{yearMark})</>}
      </span></span>
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
    </span></span>
    {continuity && <span className="badge">{continuity}</span>}
  </button>;
}

export function MiniWork({work, t, posters, onSelect, id, focus = false, badge, note}: {
  work: Work; t: TFn; posters: PosterLookup; onSelect: (id: string) => void;
  /** DOM id (lanes scroll to it), highlight, a corner badge (position) and a line replacing the format. */
  id?: string; focus?: boolean; badge?: React.ReactNode; note?: string;
}) {
  const {cardStyle} = useSettings();
  const poster = posterUrl(work.id, posters);
  const textOnly = cardStyle === 'text';
  return <button id={id} className={`mini-work ${focus ? 'focus' : ''} ${textOnly ? 'text-only' : ''}`} onClick={() => onSelect(work.id)}>
    {badge !== undefined && <span className="mini-badge">{badge}</span>}
    {!textOnly && <span className="mini-poster" style={{'--poster': work.color} as React.CSSProperties}>
      {poster ? <img src={poster} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }}/> : <span>{work.title.slice(0, 2)}</span>}
    </span>}
    <span className="mini-text">
      <strong>{work.title}</strong>
      <small>{note ?? `${work.year ?? t('detail.yearUnknown')} · ${t(`format.${work.format}`)}`}</small>
      {textOnly && <Facts work={work} t={t}/>}
    </span>
  </button>;
}
