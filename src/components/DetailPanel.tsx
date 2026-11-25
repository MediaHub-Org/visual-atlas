import {useEffect, useRef, useState} from 'react';
import type {Work} from '../data';
import type {TFn} from '../i18n';
import {posterUrl, type PosterLookup} from './WorkCard';
import {formatSpan, type Calendar} from '../chronology';

export type AdaptationLink = {workId: string; title: string; year: number | null; kind: string; certainty: 'unknown' | 'estimated' | 'confirmed'};

export function DetailPanel({work, t, tags, onPerson, calendar, universe, onOpenOrder, onWork, links, onAdaptation, posters, remasterOriginal, onPosterSaved, onClose}: {
  work: Work;
  t: TFn;
  tags: {id: string; name: string}[];
  onPerson: (id: number) => void;
  calendar?: Calendar;
  universe: {id: string; label: string; position: number; total: number; prev?: {id: string; title: string}; next?: {id: string; title: string}}[];
  onOpenOrder: (sequenceId: string, workId: string) => void;
  onWork: (id: string) => void;
  links: {asSource: AdaptationLink[]; asAdapted: AdaptationLink[]};
  onAdaptation: (id: string) => void;
  posters: PosterLookup;
  /** The film or series this work re-releases, when it is a remaster. */
  remasterOriginal?: Work;
  onPosterSaved: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const panel = closeRef.current?.closest('.detail') as HTMLElement | null;
      if (!panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>('button, a[href], input, select, [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.hasAttribute('disabled'));
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

  const poster = posterUrl(work.id, posters);
  return <div className="overlay" onClick={onClose}>
    <aside className="detail" role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={event => event.stopPropagation()}>
      <button ref={closeRef} className="close" aria-label={t('detail.close')} onClick={onClose}>✕</button>
      <div className="detail-art" style={{'--poster': work.color} as React.CSSProperties}>
        {poster && <img className="detail-poster" src={poster} alt=""/>}
        <span>FRAME / {work.format.toUpperCase()}</span>
        <strong>{work.title}</strong>
        {work.medium === 'text' && <CoverUpload work={work} t={t} onSaved={onPosterSaved}/>}
      </div>
      <div className="detail-body">
        <span className="eyebrow">{t('detail.collection')} / {t('detail.seed')}</span>
        <h2 id="detail-title">{work.title}</h2>
        <p className="detail-meta">
          {work.year ?? t('detail.yearUnknown')} · {t(`format.${work.format}`)}{work.anime && ` · ${t('format.Anime')}`}{work.cartoon && ` · ${t('format.Cartoon')}`}
        </p>
        {work.remasterKind && <p className="muted">{t(`remaster.${work.remasterKind}`)}{remasterOriginal && <> · {t('remaster.of')} <button className="linklike" onClick={() => onWork(remasterOriginal.id)}>{remasterOriginal.title}</button></>}. {t('remaster.hint')}</p>}
        {work.announced && <p className="muted"><span className="mark">{t('status.announced')}</span> {t('status.announcedHint')}</p>}
        {work.yearImported && <p className="muted">{t(work.medium === 'text' ? 'detail.yearImportedText' : 'detail.yearImported')}</p>}
        {work.medium === 'text' && !work.creators.startsWith('Not supplied') && <p className="muted">{t('detail.creators')}: {work.creators}</p>}
        {work.memberships.filter(m => work.medium === 'video' || m.continuity !== 'Continuity not specified').map(membership => <p key={`${membership.franchise}/${membership.continuity}`}>
          <span className="badge">{membership.franchise} / {membership.continuity}</span>
        </p>)}
        {work.inWorld && calendar && <InWorldDates work={work} calendar={calendar} t={t}/>}
        {universe.length > 0 && <section className="universe">
          <h3>{t('universe.title')}</h3>
          {universe.map(entry => <div className="universe-row" key={entry.id}>
            <strong>{entry.label}</strong>
            <span className="muted">{t('universe.position', {n: entry.position, total: entry.total})}</span>
            <div className="universe-nav">
              <button disabled={!entry.prev} onClick={() => entry.prev && onWork(entry.prev.id)} title={entry.prev?.title}>← {t('universe.prev')}</button>
              <button disabled={!entry.next} onClick={() => entry.next && onWork(entry.next.id)} title={entry.next?.title}>{t('universe.next')} →</button>
              <button className="primary" onClick={() => onOpenOrder(entry.id, work.id)}>{t('universe.open')}</button>
            </div>
          </div>)}
          <p className="muted">{t('universe.note')}</p>
        </section>}
        <Adaptations work={work} links={links} t={t} onOpen={onAdaptation}/>
        <h3>{t('detail.story')}</h3>
        <p>{work.description}</p>
        {work.medium === 'video' && <Credits work={work} t={t} onPerson={onPerson}/>}
        {tags.length > 0 && <>
          <h3>{t('detail.tags')}</h3>
          <div className="franchise-chips">{tags.map(entry => <span className="chip" key={entry.id}>{entry.name}</span>)}</div>
          <p className="muted">{t('detail.tagsNote')}</p>
        </>}
        <h3>{t('detail.note')}</h3>
        <p>{t('detail.noteBody')}</p>
      </div>
    </aside>
  </div>;
}

/** "Add cover": the owner picks an image file for a comic or manga; the local server stores it. */
function CoverUpload({work, t, onSaved}: {work: Work; t: TFn; onSaved: () => void}) {
  const [message, setMessage] = useState('');
  async function upload(file: File | undefined) {
    if (!file) return;
    setMessage('');
    try {
      const response = await fetch(`/api/posters/upload?workId=${encodeURIComponent(work.id)}`, {method: 'POST', headers: {'Content-Type': file.type}, body: file});
      if (!response.ok) throw new Error();
      onSaved();
    } catch {
      setMessage(t('cover.error'));
    }
  }
  return <label className="poster-jump cover-upload">{t('cover.add')}
    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }}/>
    {message && <small role="alert">{message}</small>}
  </label>;
}

/** "Adapted as" / "Based on": links between a text work and a video work, both ways. */
function Adaptations({work, links, t, onOpen}: {work: Work; links: {asSource: AdaptationLink[]; asAdapted: AdaptationLink[]}; t: TFn; onOpen: (id: string) => void}) {
  const groups = [
    {key: 'adapt.adaptedAs' as const, items: links.asSource},
    {key: 'adapt.basedOn' as const, items: links.asAdapted},
  ].filter(group => group.items.length > 0);
  if (groups.length === 0) return work.medium === 'text' ? <section className="adaptations"><h3>{t('adapt.title')}</h3><p className="muted">{t('adapt.none')}</p></section> : null;
  return <section className="adaptations">
    <h3>{t('adapt.title')}</h3>
    {groups.map(group => <div key={group.key}>
      <strong>{t(group.key)}</strong>
      <div className="group-items">{group.items.map(link => <button key={`${group.key}:${link.workId}:${link.kind}`} onClick={() => onOpen(link.workId)}>
        {link.title} <small>({link.year ?? t('detail.yearUnknown')}) · {t(`adapt.kind.${link.kind}` as 'adapt.kind.other')}</small>
        <span className={`badge ${link.certainty === 'unknown' ? 'proposal' : ''}`} title={t('sequence.badgeHint')}>{t(`adapt.certainty.${link.certainty}`)}</span>
      </button>)}</div>
    </div>)}
  </section>;
}

const QUALIFIER_KEYS = {
  circa: 'inworld.circa', open_after: 'inworld.openAfter', days_before: 'inworld.daysBefore',
} as const;

function InWorldDates({work, calendar, t}: {work: Work; calendar: Calendar; t: TFn}) {
  const inWorld = work.inWorld!;
  return <section className="inworld">
    <h3>{t('inworld.title')}</h3>
    <ul>{inWorld.periods.map((period, index) => <li key={index}>
      <strong>{formatSpan(period, calendar)}</strong>
      {period.qualifier !== 'exact' && <small> · {t(QUALIFIER_KEYS[period.qualifier])}</small>}
      {period.label && <small> · {period.label}</small>}
    </li>)}</ul>
    <p className="muted">{t('inworld.source')} <a href={inWorld.url} target="_blank" rel="noreferrer">{inWorld.page}</a>{inWorld.licence && ` (${inWorld.licence})`}</p>
  </section>;
}

function PersonLinks({people, t, onPerson}: {people: {id: number; name: string; character?: string | null}[]; t: TFn; onPerson: (id: number) => void}) {
  return <>{people.map((entry, index) => <span key={entry.id}>
    {index > 0 && ', '}
    <button className="person" title={t('credits.filter', {name: entry.name})} onClick={() => onPerson(entry.id)}>{entry.name}</button>
    {entry.character && <small> {t('credits.as')} {entry.character}</small>}
  </span>)}</>;
}

function Credits({work, t, onPerson}: {work: Work; t: TFn; onPerson: (id: number) => void}) {
  const credits = work.credits;
  if (!credits) return <>
    <h3>{t('detail.credits')}</h3>
    <p className="muted">{t('credits.none')}</p>
  </>;
  const creators = credits.kind === 'tv';
  return <>
    <h3>{t('detail.credits')}</h3>
    <dl className="credits">
      {credits.directors.length > 0 && <><dt>{t('credits.director')}</dt><dd><PersonLinks people={credits.directors} t={t} onPerson={onPerson}/></dd></>}
      {credits.writers.length > 0 && <><dt>{creators ? t('credits.creator') : t('credits.writer')}</dt><dd><PersonLinks people={credits.writers} t={t} onPerson={onPerson}/></dd></>}
      {credits.cast.length > 0 && <><dt>{t('credits.cast')}</dt><dd><PersonLinks people={credits.cast} t={t} onPerson={onPerson}/></dd></>}
    </dl>
    <p className="muted">{t('credits.source')} <a href={`https://www.themoviedb.org/${credits.kind}/${credits.tmdbId}`} target="_blank" rel="noreferrer">TMDB #{credits.tmdbId}</a></p>
  </>;
}
