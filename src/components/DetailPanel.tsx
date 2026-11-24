import {useEffect, useRef, useState} from 'react';
import type {Work} from '../data';
import type {TFn} from '../i18n';
import {posterUrl, type PosterLookup} from './WorkCard';
import {formatSpan, type Calendar} from '../chronology';

type Candidate = {id: number; title: string; date?: string; poster: string};

export function DetailPanel({work, t, tags, onPerson, calendar, universe, onOpenOrder, onWork, posters, tmdbConfigured, onPosterSaved, onClose}: {
  work: Work;
  t: TFn;
  tags: {id: string; name: string}[];
  onPerson: (id: number) => void;
  calendar?: Calendar;
  universe: {id: string; label: string; position: number; total: number; prev?: {id: string; title: string}; next?: {id: string; title: string}}[];
  onOpenOrder: (sequenceId: string, workId: string) => void;
  onWork: (id: string) => void;
  posters: PosterLookup;
  tmdbConfigured: boolean;
  onPosterSaved: (id: string) => void;
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
        <button className="poster-jump" onClick={() => {
          const editor = document.getElementById('poster-editor');
          editor?.scrollIntoView({behavior: 'smooth', block: 'center'});
          editor?.querySelector('input')?.focus({preventScroll: true});
        }}>{t('poster.change')}</button>
      </div>
      <div className="detail-body">
        <span className="eyebrow">{t('detail.collection')} / {t('detail.seed')}</span>
        <h2 id="detail-title">{work.title}</h2>
        <p className="detail-meta">
          {work.year ?? t('detail.yearUnknown')} · {t(`format.${work.format}`)}{work.anime && ` · ${t('format.Anime')}`}
        </p>
        {work.yearImported && <p className="muted">{t('detail.yearImported')}</p>}
        {work.memberships.map(membership => <p key={`${membership.franchise}/${membership.continuity}`}>
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
        <h3>{t('detail.story')}</h3>
        <p>{work.description}</p>
        <Credits work={work} t={t} onPerson={onPerson}/>
        {tags.length > 0 && <>
          <h3>{t('detail.tags')}</h3>
          <div className="franchise-chips">{tags.map(entry => <span className="chip" key={entry.id}>{entry.name}</span>)}</div>
          <p className="muted">{t('detail.tagsNote')}</p>
        </>}
        <PosterEditor work={work} t={t} configured={tmdbConfigured} onSaved={onPosterSaved}/>
        <h3>{t('detail.note')}</h3>
        <p>{t('detail.noteBody')}</p>
      </div>
    </aside>
  </div>;
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

function PosterEditor({work, t, configured, onSaved}: {work: Work; t: TFn; configured: boolean; onSaved: (id: string) => void}) {
  const [query, setQuery] = useState(work.title);
  const [results, setResults] = useState<Candidate[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function search() {
    setBusy(true);
    setMessage(t('poster.searching'));
    setResults([]);
    try {
      const params = new URLSearchParams({q: query, kind: work.format === 'Film' ? 'movie' : 'tv'});
      const response = await fetch(`/api/posters/search?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResults(data.results);
      setMessage(data.results.length ? t('poster.choose') : t('poster.none'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('poster.none'));
    } finally {
      setBusy(false);
    }
  }

  async function save(candidate: Candidate) {
    if (!window.confirm(t('poster.confirm', {
      title: candidate.title,
      date: candidate.date || t('poster.dateUnknown'),
      work: work.title,
    }))) return;
    setBusy(true);
    setMessage(t('poster.saving'));
    try {
      const response = await fetch('/api/posters/save', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({workId: work.id, poster: candidate.poster}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onSaved(work.id);
      setMessage(t('poster.saved'));
      setResults([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('poster.none'));
    } finally {
      setBusy(false);
    }
  }

  return <section className="poster-editor" id="poster-editor">
    <h3>{t('poster.title')}</h3>
    <p>{t('poster.note')}</p>
    {!configured && <p>{t('poster.noKey')}</p>}
    <div className="poster-search">
      <input aria-label={t('poster.search')} value={query} onChange={event => setQuery(event.target.value)}/>
      <button disabled={!configured || busy || !query.trim()} onClick={search}>{t('poster.search')}</button>
    </div>
    <p aria-live="polite">{message}</p>
    <div className="poster-results">{results.map(result => <button key={result.id} onClick={() => save(result)} disabled={busy}>
      <img src={`https://image.tmdb.org/t/p/w92${result.poster}`} alt="" loading="lazy"/>
      <span>{result.title}<small>{result.date || t('poster.dateUnknown')} · TMDB #{result.id}</small></span>
    </button>)}</div>
    <p className="poster-attribution"><a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">TMDB</a> · {t('poster.attribution')}</p>
  </section>;
}
