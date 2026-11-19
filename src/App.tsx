import {useCallback, useEffect, useMemo, useState} from 'react';
import {loadAtlas, type Dataset, type Work} from './data';
import {useSettings} from './settings';
import {qty} from './i18n';
import {Sidebar} from './components/Sidebar';
import {WorkCard, type PosterLookup} from './components/WorkCard';
import {TimelineView} from './components/TimelineView';
import {HierarchyView, SequenceView, TableView} from './components/Views';
import {DetailPanel} from './components/DetailPanel';
import {SettingsPanel} from './components/SettingsPanel';

type View = 'cards' | 'list' | 'hierarchy' | 'sequence' | 'timeline';
type Sort = 'releaseAsc' | 'releaseDesc' | 'title';
type Format = 'All' | 'Film' | 'Series' | 'Anime';

const VIEWS: View[] = ['cards', 'list', 'hierarchy', 'sequence', 'timeline'];
const SORTS: Sort[] = ['releaseAsc', 'releaseDesc', 'title'];

function readUrl() {
  const params = new URLSearchParams(location.search);
  const view = params.get('view') as View | null;
  const sort = params.get('sort') as Sort | null;
  const format = params.get('format') as Format | null;
  return {
    query: params.get('q') ?? '',
    franchise: params.get('franchise') ?? 'All',
    company: params.get('company') ?? '',
    tag: params.get('tag') ?? '',
    format: format && ['All', 'Film', 'Series', 'Anime'].includes(format) ? format : 'All' as Format,
    sort: sort && SORTS.includes(sort) ? sort : 'releaseAsc' as Sort,
    view: view && VIEWS.includes(view) ? view : 'cards' as View,
    density: params.get('density') === 'compact' ? 'compact' as const : 'comfortable' as const,
    work: params.get('work') ?? '',
    needsPoster: params.get('noposter') === '1',
  };
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
  const [tag, setTag] = useState(initial.tag);
  const [format, setFormat] = useState<Format>(initial.format);
  const [sort, setSort] = useState<Sort>(initial.sort);
  const [view, setView] = useState<View>(initial.view);
  const [density, setDensity] = useState<'compact' | 'comfortable'>(initial.density);
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

  useEffect(() => {
    fetch('/api/posters/status')
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!data) return;
        setPosters({ids: new Set<string>(data.posters), version: Date.now()});
        setTmdbConfigured(data.configured);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (franchise !== 'All') params.set('franchise', franchise);
    if (company) params.set('company', company);
    if (tag) params.set('tag', tag);
    if (format !== 'All') params.set('format', format);
    if (sort !== 'releaseAsc') params.set('sort', sort);
    if (view !== 'cards') params.set('view', view);
    if (density !== 'comfortable') params.set('density', density);
    if (selected) params.set('work', selected);
    if (needsPoster) params.set('noposter', '1');
    const next = `${location.pathname}${params.size ? `?${params}` : ''}`;
    if (next !== `${location.pathname}${location.search}`) history.replaceState(null, '', next);
  }, [query, franchise, company, tag, format, sort, view, density, selected, needsPoster]);

  useEffect(() => {
    const onPop = () => {
      const next = readUrl();
      setQuery(next.query); setFranchise(next.franchise); setCompany(next.company); setTag(next.tag);
      setFormat(next.format); setSort(next.sort); setView(next.view);
      setDensity(next.density); setSelected(next.work); setNeedsPoster(next.needsPoster);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const closeDetail = useCallback(() => setSelected(''), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const companyNode = company ? dataset?.companies.get(company) : undefined;
  const allowedFranchises = useMemo(() => companyNode ? new Set(companyNode.subtreeFranchiseIds) : null, [companyNode]);

  const filtered = useMemo(() => {
    if (!dataset) return [] as Work[];
    const needle = query.trim().toLowerCase();
    return dataset.works
      .filter(work =>
        (franchise === 'All' || work.memberships.some(m => m.franchise === franchise)) &&
        (!allowedFranchises || work.memberships.some(m => allowedFranchises.has(m.franchiseId))) &&
        (format === 'All' || (format === 'Anime' ? work.anime : work.format === format)) &&
        (!tag || dataset.workTags.get(work.id)?.includes(tag)) &&
        (!needsPoster || !posters.ids.has(work.id)) &&
        (!needle || `${work.title} ${work.memberships.map(m => m.franchise).join(' ')}`.toLowerCase().includes(needle)))
      .sort((a, b) => {
        if (sort === 'title') return a.title.localeCompare(b.title);
        if (a.year === null && b.year === null) return a.title.localeCompare(b.title);
        if (a.year === null) return 1;
        if (b.year === null) return -1;
        return sort === 'releaseDesc' ? b.year - a.year : a.year - b.year;
      });
  }, [dataset, query, franchise, allowedFranchises, format, tag, needsPoster, posters, sort]);

  const tagOptions = useMemo(() => {
    if (!dataset) return [];
    return dataset.tags
      .map(entry => ({...entry, count: [...dataset.workTags.values()].filter(list => list.includes(entry.id)).length}))
      .filter(entry => entry.count > 0);
  }, [dataset]);

  const selectedWork = selected && dataset ? dataset.worksById.get(selected) : undefined;
  const selectedTags = selectedWork && dataset
    ? dataset.tags.filter(entry => dataset.workTags.get(selectedWork.id)?.includes(entry.id))
    : [];
  const showHero = view === 'cards' && !query && franchise === 'All' && !company && !tag && !needsPoster;

  function pickFranchise(name: string) {
    setFranchise(name === franchise ? 'All' : name);
    setCompany('');
    setView('cards');
    setSelected('');
  }

  function pickCompany(id: string) {
    setCompany(id === company ? '' : id);
    setFranchise('All');
    setView('cards');
    setSelected('');
  }

  return <div className="app">
    <Sidebar
      dataset={dataset ?? {works: [], worksById: new Map(), franchises: [], companies: new Map(), roots: [], sequences: [], tags: [], workTags: new Map(), stats: {films: 0, series: 0, franchises: 0, companies: 0}}}
      t={t}
      franchise={franchise}
      tag={tag}
      tags={tagOptions}
      onTag={id => { setTag(tag === id ? '' : id); setView('cards'); }}
      onFranchise={pickFranchise}
      onCompany={pickCompany}
      onAllCompanies={() => { setView('hierarchy'); setCompany(''); setFranchise('All'); }}
      onView={target => setView(target)}
      onSettings={() => setSettingsOpen(true)}
    />
    <main>
      <header className="topbar">
        <div className="crumb">
          <button onClick={() => { setFranchise('All'); setCompany(''); setView('cards'); }}>Atlas</button>
          <span>/</span>
          <strong>{companyNode?.name ?? (franchise === 'All' ? t('nav.explore') : franchise)}</strong>
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
                    <p>{t('hero.body')}</p>
                    <div className="stats">
                      <div><strong>{dataset.stats.films}</strong><span>{t('stats.films')}</span></div>
                      <div><strong>{dataset.stats.series}</strong><span>{t('stats.series')}</span></div>
                      <div><strong>{dataset.stats.franchises}</strong><span>{t('stats.worlds')}</span></div>
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
                    <h2>{companyNode?.name ?? (franchise === 'All' ? t('collection.title') : franchise)}</h2>
                    <p aria-live="polite">{filtered.length ? [
                      qty(t, filtered.length, 'noun.work', 'noun.works'),
                      qty(t, filtered.filter(work => work.format === 'Film').length, 'noun.film', 'noun.films'),
                      qty(t, filtered.filter(work => work.format === 'Series').length, 'noun.seriesOne', 'noun.seriesMany'),
                    ].join(' · ') : t('collection.body')}</p>
                  </div>
                </div>

                <div className="toolbar">
                  <label className="search">⌕
                    <input aria-label={t('search.label')} placeholder={t('search.placeholder')} value={query} onChange={event => setQuery(event.target.value)}/>
                  </label>
                  <label><span className="sr">{t('filter.franchise')}</span>
                    <select value={franchise} onChange={event => { setFranchise(event.target.value); setCompany(''); }}>
                      <option value="All">{t('filter.franchise')}: {t('filter.all')}</option>
                      {dataset.franchises.map(entry => <option key={entry.id} value={entry.name}>{entry.name}</option>)}
                    </select>
                  </label>
                  <label><span className="sr">{t('filter.tag')}</span>
                    <select value={tag} onChange={event => setTag(event.target.value)}>
                      <option value="">{t('filter.tag')}: {t('filter.all')}</option>
                      {tagOptions.map(entry => <option key={entry.id} value={entry.id}>{entry.name} ({entry.count})</option>)}
                    </select>
                  </label>
                  <label><span className="sr">{t('filter.format')}</span>
                    <select value={format} onChange={event => setFormat(event.target.value as Format)}>
                      <option value="All">{t('filter.format')}: {t('filter.all')}</option>
                      <option value="Film">{t('format.Film')}</option>
                      <option value="Series">{t('format.Series')}</option>
                      <option value="Anime">{t('format.Anime')}</option>
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
                  <button className="density" onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}>
                    {t('density.label')}: {t(`density.${density}`)}
                  </button>
                </div>

                {(companyNode || franchise !== 'All' || tag) && <div className="active-filters">
                  {companyNode && <button className="chip active" onClick={() => setCompany('')}>{companyNode.name} ✕</button>}
                  {franchise !== 'All' && <button className="chip active" onClick={() => setFranchise('All')}>{franchise} ✕</button>}
                  {tag && <button className="chip active" onClick={() => setTag('')}>{tagOptions.find(entry => entry.id === tag)?.name ?? tag} ✕</button>}
                </div>}

                <div className="viewbar">
                  <div className="views">
                    {VIEWS.map(option => <button key={option} className={view === option ? 'selected' : ''} aria-pressed={view === option} onClick={() => setView(option)}>
                      {t(`view.${option}`)}
                    </button>)}
                  </div>
                </div>

                {filtered.length === 0
                  ? <div className="empty">{t('common.empty')}</div>
                  : view === 'cards'
                    ? <div className={`grid ${density}`}>{filtered.map(work => <WorkCard key={work.id} work={work} t={t} posters={posters} onSelect={setSelected}/>)}</div>
                    : view === 'list'
                      ? <TableView works={filtered} t={t} onSelect={setSelected}/>
                      : view === 'timeline'
                        ? <TimelineView works={filtered} scale={settings.timelineScale} onScale={scale => settings.set({timelineScale: scale})} t={t} posters={posters} onSelect={setSelected}/>
                        : view === 'sequence'
                          ? <SequenceView dataset={dataset} works={filtered} t={t} onSelect={setSelected}/>
                          : <HierarchyView dataset={dataset} t={t} onFranchise={pickFranchise} focusCompany={company}/>}
              </section>

              <footer>
                <span>FRAME ✳</span>
                <p>{t('footer.warning')}</p>
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
      posters={posters}
      tmdbConfigured={tmdbConfigured}
      onPosterSaved={id => setPosters(current => ({ids: new Set(current.ids).add(id), version: Date.now()}))}
      onClose={closeDetail}
    />}
    {settingsOpen && <SettingsPanel onClose={closeSettings} posterCount={posters.ids.size} configured={tmdbConfigured}/>}
  </div>;
}
