import {useCallback, useEffect, useMemo, useState} from 'react';
import {loadAtlas, type Dataset, type Work} from './data';
import {useSettings} from './settings';
import {qty} from './i18n';
import {adaptationsFor, catalogueFranchises, clampFormat, clampView, FORMATS_BY_MEDIUM, matchesFormat, parseMedium, type Medium} from './medium';
import {MediaSwitch, Sidebar} from './components/Sidebar';
import {WorkCard, type PosterLookup} from './components/WorkCard';
import {TimelineView} from './components/TimelineView';
import {HierarchyView, SequenceView} from './components/Views';
import {DetailPanel} from './components/DetailPanel';
import {SettingsPanel} from './components/SettingsPanel';
import {DensityPanel} from './components/DensityPanel';

type View = 'cards' | 'hierarchy' | 'sequence' | 'timeline';
type Sort = 'releaseAsc' | 'releaseDesc' | 'title';
type Format = 'All' | 'Film' | 'Series' | 'Anime' | 'Cartoon' | 'Comic' | 'Manga' | 'Graphic novel';
const FORMATS = FORMATS_BY_MEDIUM as Record<Medium, Exclude<Format, 'All'>[]>;
/** Tabs per catalogue: text media has no in-world order yet. */
const VIEWS_BY_MEDIUM: Record<Medium, View[]> = {video: ['cards', 'sequence', 'timeline'], text: ['cards', 'sequence', 'timeline']};

/** The dashboard's tabs. Hierarchy is no longer a tab: only the sidebar's "+N more" companies link opens it. */
const VIEWS: View[] = ['cards', 'sequence', 'timeline'];
const ROUTABLE: View[] = [...VIEWS, 'hierarchy'];
const SORTS: Sort[] = ['releaseAsc', 'releaseDesc', 'title'];

function readUrl() {
  const params = new URLSearchParams(location.search);
  const view = params.get('view') as View | null;
  const sort = params.get('sort') as Sort | null;
  const format = params.get('format');
  // The catalogue decides which views and formats exist: a URL cannot ask for a hidden one.
  const media = parseMedium(params.get('media'));
  return {
    query: params.get('q') ?? '',
    franchise: params.get('franchise') ?? 'All',
    company: params.get('company') ?? '',
    universe: params.get('universe') ?? '',
    tag: params.get('tag') ?? '',
    person: params.get('person') ?? '',
    seq: params.get('seq') ?? '',
    at: params.get('at') ?? '',
    axis: params.get('axis') === '1',
    media,
    format: clampFormat(format ?? 'All', media) as Format,
    sort: sort && SORTS.includes(sort) ? sort : 'releaseAsc' as Sort,
    view: clampView(view && ROUTABLE.includes(view) ? view : 'cards', media) as View,
    work: params.get('work') ?? '',
    needsPoster: params.get('noposter') === '1',
  };
}

function hasPerson(work: Work, id: number) {
  const credits = work.credits;
  return !!credits && [...credits.directors, ...credits.writers, ...credits.cast].some(entry => entry.id === id);
}

/** What the search box matches: title, franchises and the imported credits. */
function searchText(work: Work) {
  const credits = work.credits;
  const people = credits ? [...credits.directors, ...credits.writers, ...credits.cast].map(entry => entry.name) : [];
  return `${work.title} ${work.memberships.map(m => m.franchise).join(' ')} ${people.join(' ')}`.toLowerCase();
}

export default function App() {
  const settings = useSettings();
  const {t} = settings;
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const initial = useMemo(readUrl, []);
  const [query, setQuery] = useState(initial.query);
  const [franchise, setFranchise] = useState(initial.franchise);
  const [company, setCompany] = useState(initial.company);
  const [universe, setUniverse] = useState(initial.universe);
  const [tag, setTag] = useState(initial.tag);
  const [person, setPerson] = useState(initial.person);
  const [seq, setSeq] = useState(initial.seq);
  const [at, setAt] = useState(initial.at);
  const [axis, setAxis] = useState(initial.axis);
  const [medium, setMedium] = useState<Medium>(initial.media);
  const [format, setFormat] = useState<Format>(initial.format);
  const [sort, setSort] = useState<Sort>(initial.sort);
  const [view, setView] = useState<View>(initial.view);
  const density = settings.density;
  const [densityOpen, setDensityOpen] = useState(false);
  const [allCompanies, setAllCompanies] = useState(false);
  const [selected, setSelected] = useState(initial.work);
  const [needsPoster, setNeedsPoster] = useState(initial.needsPoster);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [posters, setPosters] = useState<PosterLookup>({ids: new Set(), version: 0});
  const [tmdbConfigured, setTmdbConfigured] = useState(false);

  useEffect(() => {
    let alive = true;
    setError(false);
    loadAtlas().then(data => { if (alive) setDataset(data); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [attempt]);

  const refreshPosters = useCallback(() => {
    fetch('/api/posters/status')
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!data) return;
        setPosters({ids: new Set<string>(data.posters), types: data.types ?? {}, version: Date.now()});
        setTmdbConfigured(data.configured);
      })
      .catch(() => {});
  }, []);
  useEffect(refreshPosters, [refreshPosters]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (franchise !== 'All') params.set('franchise', franchise);
    if (company) params.set('company', company);
    if (universe) params.set('universe', universe);
    if (tag) params.set('tag', tag);
    if (person) params.set('person', person);
    if (seq) params.set('seq', seq);
    if (at) params.set('at', at);
    if (axis) params.set('axis', '1');
    if (medium === 'text') params.set('media', 'text');
    if (format !== 'All') params.set('format', format);
    if (sort !== 'releaseAsc') params.set('sort', sort);
    if (view !== 'cards') params.set('view', view);
    if (selected) params.set('work', selected);
    if (needsPoster) params.set('noposter', '1');
    const next = `${location.pathname}${params.size ? `?${params}` : ''}`;
    if (next !== `${location.pathname}${location.search}`) history.replaceState(null, '', next);
  }, [query, franchise, company, universe, tag, person, seq, at, axis, medium, format, sort, view, selected, needsPoster]);

  useEffect(() => {
    const onPop = () => {
      const next = readUrl();
      setQuery(next.query); setFranchise(next.franchise); setCompany(next.company); setUniverse(next.universe); setTag(next.tag); setPerson(next.person); setSeq(next.seq); setAt(next.at); setAxis(next.axis);
      setMedium(next.media); setFormat(next.format); setSort(next.sort); setView(next.view);
      setSelected(next.work); setNeedsPoster(next.needsPoster);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const closeDetail = useCallback(() => setSelected(''), []);

  /** Open one universe's in-world order at a work, clearing filters that would hide part of it. */
  function openOrder(sequenceId: string, workId: string) {
    setMedium('video'); setSeq(sequenceId); setAt(workId); setAxis(false); setView('sequence'); setSelected('');
    setQuery(''); setFranchise('All'); setCompany(''); setUniverse(''); setTag(''); setPerson(''); setFormat('All'); setNeedsPoster(false);
  }
  // A link or reload can name a work or franchise of the other catalogue: follow the work's medium
  // and drop a franchise this catalogue does not have, once the data is known.
  useEffect(() => {
    if (!dataset) return;
    const work = selected ? dataset.worksById.get(selected) : undefined;
    const next = work ? work.medium : medium;
    if (next !== medium) setMedium(next);
    if (franchise !== 'All' && !catalogueFranchises(dataset.franchises, dataset.works, next).some(entry => entry.name === franchise)) setFranchise('All');
    setView(current => clampView(current, next) as View);
  }, [dataset, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The brand link: back to the root index, as a fresh visit (Watch, no filters). */
  function goHome() {
    setMedium('video'); setQuery(''); setFranchise('All'); setCompany(''); setUniverse(''); setTag(''); setPerson(''); setFormat('All');
    setSeq(''); setAt(''); setAxis(false); setSort('releaseAsc'); setView('cards'); setSelected(''); setNeedsPoster(false);
    setSettingsOpen(false);
    window.scrollTo({top: 0});
  }

  /** Switch catalogue: filters of the other catalogue no longer apply, and a hidden view falls back to cards. */
  function switchMedium(next: Medium) {
    if (next === medium) return;
    setMedium(next);
    setFranchise('All'); setCompany(''); setUniverse(''); setTag(''); setPerson(''); setFormat('All'); setNeedsPoster(false);
    setSeq(''); setAt(''); setAxis(false); setSelected('');
    if (!VIEWS_BY_MEDIUM[next].includes(view)) setView('cards');
  }
  /** Open a work from an adaptation link, in whichever catalogue it lives. */
  function openAdaptation(id: string) {
    const target = dataset?.worksById.get(id);
    if (!target) return;
    if (target.medium !== medium) switchMedium(target.medium);
    setSelected(id);
  }
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const companyNode = company ? dataset?.companies.get(company) : undefined;
  const family = dataset?.families.find(entry => entry.id === universe);
  const allowedFranchises = useMemo(() => companyNode ? new Set(companyNode.subtreeFranchiseIds) : null, [companyNode]);

  const filtered = useMemo(() => {
    if (!dataset) return [] as Work[];
    const needle = query.trim().toLowerCase();
    return dataset.works
      .filter(work =>
        work.medium === medium &&
        (franchise === 'All' || work.memberships.some(m => m.franchise === franchise)) &&
        (!family || work.memberships.some(m => family.franchiseIds.includes(m.franchiseId))) &&
        (!allowedFranchises || work.memberships.some(m => allowedFranchises.has(m.franchiseId))) &&
        matchesFormat(work, format) &&
        (!tag || dataset.workTags.get(work.id)?.includes(tag)) &&
        (!person || hasPerson(work, Number(person))) &&
        (!needsPoster || !posters.ids.has(work.id)) &&
        (!needle || searchText(work).includes(needle)))
      .sort((a, b) => {
        if (sort === 'title') return a.title.localeCompare(b.title);
        if (a.year === null && b.year === null) return a.title.localeCompare(b.title);
        if (a.year === null) return 1;
        if (b.year === null) return -1;
        return sort === 'releaseDesc' ? b.year - a.year : a.year - b.year;
      });
  }, [dataset, medium, query, franchise, family, allowedFranchises, format, tag, person, needsPoster, posters, sort]);

  // Universe families as pills: the sidebar list is hidden on narrow screens (see .narrow-only).
  const universePills = useMemo(() => {
    if (!dataset) return [];
    return dataset.families.map(entry => ({id: entry.id, name: entry.name, count: dataset.works.filter(work => work.medium === medium && work.memberships.some(m => entry.franchiseIds.includes(m.franchiseId))).length})).filter(entry => entry.count > 0);
  }, [dataset, medium]);

  // Companies: the top-level owners, each with the number of works under it (Watch only).
  const companyPills = useMemo(() => {
    if (!dataset) return [];
    return dataset.roots.map(id => dataset.companies.get(id)).filter(Boolean).map(node => {
      const ids = new Set(node!.subtreeFranchiseIds);
      return {id: node!.id, name: node!.name, count: dataset.works.filter(work => work.medium === 'video' && work.memberships.some(m => ids.has(m.franchiseId))).length};
    }).filter(entry => entry.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [dataset]);

  const tagOptions = useMemo(() => {
    if (!dataset) return [];
    const inMedium = [...dataset.workTags.entries()].filter(([id]) => dataset.worksById.get(id)?.medium === medium).map(([, list]) => list);
    return dataset.tags
      .map(entry => ({...entry, count: inMedium.filter(list => list.includes(entry.id)).length}))
      .filter(entry => entry.count > 0);
  }, [dataset, medium]);
  const franchiseOptions = useMemo(() => dataset ? catalogueFranchises(dataset.franchises, dataset.works, medium) : [], [dataset, medium]);
  const links = useMemo(() => {
    if (!selected || !dataset) return {asSource: [], asAdapted: []};
    const found = adaptationsFor(selected, dataset.adaptations, id => dataset.worksById.has(id));
    const view = (link: (typeof dataset.adaptations)[number], other: string) => {
      const work = dataset.worksById.get(other)!;
      return {workId: other, title: work.title, year: work.year, kind: link.kind, certainty: link.certainty};
    };
    return {
      asSource: found.asSource.map(link => view(link, link.adaptedId)),
      asAdapted: found.asAdapted.map(link => view(link, link.sourceId)),
    };
  }, [selected, dataset]);

  const selectedWork = selected && dataset ? dataset.worksById.get(selected) : undefined;
  const selectedUniverse = useMemo(() => {
    if (!selectedWork || !dataset) return [];
    return dataset.sequences.flatMap(sequence => {
      const index = sequence.items.findIndex(item => item.workId === selectedWork.id);
      if (index < 0) return [];
      const near = (offset: number) => {
        const work = dataset.worksById.get(sequence.items[index + offset]?.workId ?? '');
        return work ? {id: work.id, title: work.title} : undefined;
      };
      return [{
        id: sequence.id,
        label: `${sequence.franchise} / ${sequence.continuity}`,
        position: index + 1,
        total: sequence.items.length,
        prev: near(-1),
        next: near(1),
      }];
    });
  }, [selectedWork, dataset]);
  const selectedTags = selectedWork && dataset
    ? dataset.tags.filter(entry => dataset.workTags.get(selectedWork.id)?.includes(entry.id))
    : [];
  const showHero = view === 'cards' && !query && franchise === 'All' && !universe && !company && !tag && !needsPoster;

  function pickFranchise(name: string) {
    setFranchise(name === franchise ? 'All' : name);
    // a franchise outside the chosen universe replaces it; one inside keeps it
    const id = dataset?.franchises.find(entry => entry.name === name)?.id;
    if (!dataset?.families.some(entry => entry.id === universe && id && entry.franchiseIds.includes(id))) setUniverse('');
    setCompany('');
    setView('cards');
    setSelected('');
  }

  function pickCompany(id: string) {
    setCompany(id === company ? '' : id);
    setFranchise('All'); setUniverse('');
    setView('cards');
    setSelected('');
  }

  return <div className="app">
    <Sidebar
      dataset={dataset ?? {works: [], worksById: new Map(), people: new Map(), calendars: new Map(), families: [], adaptations: [], textSources: [], chronologySources: [], franchises: [], companies: new Map(), roots: [], sequences: [], tags: [], workTags: new Map(), stats: {films: 0, series: 0, textWorks: 0, franchises: 0, companies: 0}}}
      t={t}
      franchise={franchise}
      universe={universe}
      onUniverse={id => { setUniverse(id); setFranchise('All'); setCompany(''); setView('cards'); setSelected(''); }}
      medium={medium}
      onMedium={switchMedium}
      format={format}
      onFormat={id => { setFormat(id === format ? 'All' : id as Format); setView('cards'); setSelected(''); }}
      onHome={goHome}
      onFranchise={pickFranchise}
      onView={target => { setView(target); if (target === 'sequence') { setSeq(''); setAt(''); } }}
      onSettings={() => setSettingsOpen(true)}
    />
    <main>
      <header className="topbar">
        <div className="crumb">
          <button onClick={() => { setFranchise('All'); setCompany(''); setView('cards'); }}>Atlas</button>
          <span>/</span>
          <strong>{companyNode?.name ?? (franchise === 'All' ? (family?.name ?? t('nav.explore')) : franchise)}</strong>
        </div>
        <div className="top-actions">
          <span className="top-note">{t('top.note')} <b>✳</b></span>
          <button className="icon-button" aria-label={t('nav.settings')} onClick={() => setSettingsOpen(true)}>⚙</button>
        </div>
      </header>

      <div className="content">
        {error
          ? <div className="state"><p>{t('common.error')}</p><button onClick={() => setAttempt(value => value + 1)}>{t('common.retry')}</button></div>
          : !dataset
            ? <div className="state"><p>{t('common.loading')}</p></div>
            : <>
              {showHero && <>
                <section className="intro">
                  <div>
                    <div className="eyebrow"><span/>{t('hero.eyebrow')}</div>
                    <h1>{t('hero.title')}<br/><em>{t('hero.titleEm')}</em></h1>
                    <p>{t(medium === 'text' ? 'hero.bodyText' : 'hero.body')}</p>
                    <div className="stats">
                      {medium === 'text'
                        ? <>
                          <div><strong>{dataset.stats.textWorks}</strong><span>{t('stats.textWorks')}</span></div>
                          <div><strong>{franchiseOptions.length}</strong><span>{t('stats.sagas')}</span></div>
                        </>
                        : <>
                          <div><strong>{dataset.stats.films}</strong><span>{t('stats.films')}</span></div>
                          <div><strong>{dataset.stats.series}</strong><span>{t('stats.series')}</span></div>
                          <div><strong>{dataset.stats.franchises}</strong><span>{t('stats.worlds')}</span></div>
                        </>}
                    </div>
                  </div>
                  <div className="hero-art" aria-hidden="true">
                    <div className="orbit orbit-one"/><div className="orbit orbit-two"/>
                    <div className="planet">✳</div>
                    <span className="hero-caption">{t('hero.caption')}</span>
                  </div>
                </section>
              </>}

              <section className="collection">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow"><span/>{t('collection.eyebrow')}</div>
                    <h2>{companyNode?.name ?? (franchise === 'All' ? (family?.name ?? t('collection.title')) : franchise)}</h2>
                    <p aria-live="polite">{filtered.length ? [
                      qty(t, filtered.length, 'noun.work', 'noun.works'),
                      ...(medium === 'text'
                        ? FORMATS.text.map(option => `${filtered.filter(work => work.format === option).length} ${t(`format.${option}`)}`)
                        : [
                          qty(t, filtered.filter(work => work.format === 'Film').length, 'noun.film', 'noun.films'),
                          qty(t, filtered.filter(work => work.format === 'Series').length, 'noun.seriesOne', 'noun.seriesMany'),
                        ]),
                    ].join(' · ') : t('collection.body')}</p>
                  </div>
                  <MediaSwitch medium={medium} onMedium={switchMedium} t={t}/>
                </div>

                <div className="toolbar">
                  <label className="search">⌕
                    <input aria-label={t('search.label')} placeholder={t('search.placeholder')} value={query} onChange={event => setQuery(event.target.value)}/>
                  </label>
                  <label><span className="sr">{t('filter.franchise')}</span>
                    <select value={franchise} onChange={event => { setFranchise(event.target.value); setCompany(''); }}>
                      <option value="All">{t('filter.franchise')}: {t('filter.all')}</option>
                      {franchiseOptions.map(entry => <option key={entry.id} value={entry.name}>{entry.name}</option>)}
                    </select>
                  </label>
                  <label><span className="sr">{t('filter.format')}</span>
                    <select value={format} onChange={event => setFormat(event.target.value as Format)}>
                      <option value="All">{t('filter.format')}: {t('filter.all')}</option>
                      {FORMATS[medium].map(option => <option key={option} value={option}>{t(`format.${option}`)}</option>)}
                    </select>
                  </label>
                  <label><span className="sr">{t('filter.sort')}</span>
                    <select value={sort} onChange={event => setSort(event.target.value as Sort)}>
                      {SORTS.map(option => <option key={option} value={option}>{t(`sort.${option}`)}</option>)}
                    </select>
                  </label>
                  <button className={`chip ${needsPoster ? 'active' : ''}`} aria-pressed={needsPoster} onClick={() => setNeedsPoster(value => !value)}>
                    {t('filter.noPoster')}
                  </button>
                  <button className="chip" onClick={() => settings.set({cardStyle: settings.cardStyle === 'text' ? 'poster' : 'text'})}>
                    {t('card.style')}: {t(`card.${settings.cardStyle}`)}
                  </button>
                  <button className="chip" aria-haspopup="dialog" onClick={() => setDensityOpen(true)}>
                    {t('density.label')}: {t(`density.${density}`)} · {t(`timeline.${settings.timelineScale}`)}
                  </button>
                </div>

                {universePills.length > 0 && <div className="pill-row narrow-only" role="group" aria-label={t('nav.universes')}>
                  <span className="pill-label">{t('nav.universes')}</span>
                  {universePills.map(entry => <button key={entry.id} className={`chip ${universe === entry.id ? 'active' : ''}`} aria-pressed={universe === entry.id} onClick={() => { setUniverse(universe === entry.id ? '' : entry.id); setFranchise('All'); setCompany(''); }}>
                    {entry.name} <span>{entry.count}</span>
                  </button>)}
                </div>}

                {medium === 'video' && companyPills.length > 0 && <div className="pill-row" role="group" aria-label={t('nav.companies')}>
                  <span className="pill-label">{t('nav.companies')}</span>
                  {(allCompanies ? companyPills : companyPills.filter((entry, index) => index < 12 || entry.id === company)).map(entry => <button key={entry.id} className={`chip ${company === entry.id ? 'active' : ''}`} aria-pressed={company === entry.id} onClick={() => pickCompany(entry.id)}>
                    {entry.name} <span>{entry.count}</span>
                  </button>)}
                  {companyPills.length > 12 && <button className="chip" aria-expanded={allCompanies} onClick={() => setAllCompanies(value => !value)}>{allCompanies ? t('pills.fewer') : t('pills.more', {n: companyPills.length - 12})}</button>}
                </div>}

                {tagOptions.length > 0 && <div className="pill-row" role="group" aria-label={t('nav.collections')}>
                  <span className="pill-label">{t('nav.collections')}</span>
                  {tagOptions.map(entry => <button key={entry.id} className={`chip ${tag === entry.id ? 'active' : ''}`} aria-pressed={tag === entry.id} onClick={() => setTag(tag === entry.id ? '' : entry.id)}>
                    {entry.name} <span>{entry.count}</span>
                  </button>)}
                </div>}

                {(companyNode || family || franchise !== 'All' || tag || person) && <div className="active-filters">
                  {family && <button className="chip active" onClick={() => setUniverse('')}>{family.name} ✕</button>}
                  {companyNode && <button className="chip active" onClick={() => setCompany('')}>{companyNode.name} ✕</button>}
                  {franchise !== 'All' && <button className="chip active" onClick={() => setFranchise('All')}>{franchise} ✕</button>}
                  {tag && <button className="chip active" onClick={() => setTag('')}>{tagOptions.find(entry => entry.id === tag)?.name ?? tag} ✕</button>}
                  {person && <button className="chip active" onClick={() => setPerson('')}>{dataset.people.get(Number(person)) ?? person} ✕</button>}
                </div>}

                <div className="viewbar">
                  <div className="views">
                    {VIEWS_BY_MEDIUM[medium].map(option => <button key={option} className={view === option ? 'selected' : ''} aria-pressed={view === option} onClick={() => setView(option)}>
                      {t(`view.${option}`)}
                    </button>)}
                  </div>
                </div>

                {filtered.length === 0
                  ? <div className="empty">{t('common.empty')}</div>
                  : view === 'cards'
                    ? <div className={`grid ${density} ${settings.cardStyle === 'text' ? 'text-style' : ''}`}>{filtered.map(work => <WorkCard key={work.id} work={work} t={t} posters={posters} onSelect={setSelected}/>)}</div>
                    : view === 'timeline'
                      ? <TimelineView works={filtered} t={t} posters={posters} onSelect={setSelected}/>
                      : view === 'sequence'
                        ? <SequenceView dataset={dataset} works={filtered} t={t} posters={posters} medium={medium} onSelect={setSelected} openId={seq} focusWork={at}
                          axis={axis} onAxis={setAxis}/>
                        : <HierarchyView dataset={dataset} t={t} onFranchise={pickFranchise} focusCompany={company}/>}
              </section>

              <footer>
                <span>FRAME ✳</span>
                <p>{t('footer.warning')}</p>
                {medium === 'video' && dataset.chronologySources.length > 0 && <p className="chronology-attribution">
                  {t('inworld.footer')} {dataset.chronologySources.map(source =>
                    <a key={source.name} href={source.licenceUrl || undefined} target="_blank" rel="noreferrer">{source.name} · {source.licence}</a>)}
                </p>}
                {medium === 'text' && dataset.textSources.length > 0 && <p className="chronology-attribution">
                  {dataset.textSources.map(source => <a key={source} href={source === 'anilist' ? 'https://anilist.co/' : 'https://comicvine.gamespot.com/'} target="_blank" rel="noreferrer">{t(`textSource.${source}`)} </a>)}
                </p>}
                <div className="tmdb-attribution">
                  <a href="https://www.themoviedb.org/"><img src="/tmdb-logo.svg" alt="TMDB" width="60"/></a><br/>
                  {t('poster.attribution')}
                </div>
              </footer>
            </>}
      </div>
    </main>

    {selectedWork && <DetailPanel
      work={selectedWork}
      t={t}
      tags={selectedTags}
      onPerson={id => { setPerson(String(id)); setSelected(''); setView('cards'); }}
      universe={selectedUniverse}
      calendar={selectedWork?.inWorld ? dataset?.calendars.get(selectedWork.inWorld.calendarId) : undefined}
      onOpenOrder={openOrder}
      onWork={setSelected}
      links={links}
      onAdaptation={openAdaptation}
      posters={posters}
      onPosterSaved={refreshPosters}
      onClose={closeDetail}
    />}
    {densityOpen && <DensityPanel t={t} onClose={() => setDensityOpen(false)}/>}
    {settingsOpen && <SettingsPanel onClose={closeSettings} posterCount={posters.ids.size} configured={tmdbConfigured}/>}
  </div>;
}
