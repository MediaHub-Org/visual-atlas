import type {Work} from '../data';
import type {TFn} from '../i18n';

export type PosterLookup = { ids: Set<string>; version: number };

export function posterUrl(workId: string, posters: PosterLookup) {
  return posters.ids.has(workId) ? `/posters/${workId}.jpg?v=${posters.version}` : null;
}

export function WorkCard({work, t, posters, onSelect}: {work: Work; t: TFn; posters: PosterLookup; onSelect: (id: string) => void}) {
  const poster = posterUrl(work.id, posters);
  const continuity = work.memberships[0]?.continuity;
  return <button className="card" onClick={() => onSelect(work.id)}>
    <span className="poster" style={{'--poster': work.color} as React.CSSProperties}>
      {poster && <img className="local-poster" src={poster} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }}/>}
      <span className="poster-top">FRAME / {work.format.toUpperCase()}</span>
      <span className="poster-title">{work.title}</span>
      <span className="poster-bottom">{work.year ?? '—'} <span>✳</span></span>
    </span>
    <span className="card-title">{work.title} <span>
      {work.year === null
        ? `(${t('detail.yearUnknown').toLowerCase()})`
        : <> ({work.year}{work.yearImported && <span className="imported-mark" title={t(work.medium === 'text' ? 'detail.yearImportedText' : 'detail.yearImported')}>*</span>})</>}
    </span></span>
    {continuity && <span className="badge">{continuity}</span>}
  </button>;
}

export function MiniWork({work, t, posters, onSelect}: {work: Work; t: TFn; posters: PosterLookup; onSelect: (id: string) => void}) {
  const poster = posterUrl(work.id, posters);
  return <button className="mini-work" onClick={() => onSelect(work.id)}>
    <span className="mini-poster" style={{'--poster': work.color} as React.CSSProperties}>
      {poster ? <img src={poster} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }}/> : <span>{work.title.slice(0, 2)}</span>}
    </span>
    <span className="mini-text"><strong>{work.title}</strong><small>{work.year ?? t('detail.yearUnknown')} · {t(`format.${work.format}`)}</small></span>
  </button>;
}
