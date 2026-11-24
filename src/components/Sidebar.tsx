import type {Dataset} from '../data';
import type {TFn} from '../i18n';
import {CompanySidebar} from './CompanyTree';
import {facetLists, type Medium} from '../medium';

/** Video | Text catalogue switch, in the sidebar and in the explore header. */
export function MediaSwitch({medium, onMedium, t}: {medium: Medium; onMedium: (medium: Medium) => void; t: TFn}) {
  return <div className="segmented media-switch" role="group" aria-label={t('media.label')}>
    {(['video', 'text'] as const).map(option => <button key={option} className={medium === option ? 'selected' : ''} aria-pressed={medium === option} title={t(`media.${option}Hint`)} onClick={() => onMedium(option)}>
      {t(`media.${option}`)}
    </button>)}
  </div>;
}

export function Sidebar({dataset, t, franchise, medium, onMedium, format, onFormat, onHome, tag, tags, onFranchise, onCompany, onAllCompanies, onTag, onView, onSettings}: {
  dataset: Dataset;
  t: TFn;
  franchise: string;
  medium: Medium;
  onMedium: (medium: Medium) => void;
  format: string;
  onFormat: (format: string) => void;
  onHome: () => void;
  tag: string;
  tags: {id: string; name: string; count: number}[];
  onFranchise: (name: string) => void;
  onCompany: (id: string) => void;
  onAllCompanies: () => void;
  onTag: (id: string) => void;
  onView: (view: 'cards' | 'sequence' | 'timeline' | 'hierarchy') => void;
  onSettings: () => void;
}) {
  // Watch and Read share one structure: Discover, Format, Series & sagas. The two lists narrow
  // each other, so choosing a format changes the series list and the reverse. Companies and
  // collections only exist for Watch (no publisher or editorial-tag data for comics yet).
  const facets = facetLists(dataset.works, medium, format, franchise);
  const total = dataset.works.filter(work => work.medium === medium && (franchise === 'All' || work.memberships.some(m => m.franchise === franchise))).length;
  return <aside className="sidebar">
    <a className="brand" href="/" aria-label={t('nav.home')} onClick={event => { event.preventDefault(); onHome(); }}><span className="brand-icon">✳</span> FRAME<span className="brand-dot">.</span></a>
    <div className="sidebar-label">{t('brand.sub')}</div>

    <div className="side-scroll">
      <MediaSwitch medium={medium} onMedium={onMedium} t={t}/>
      <div className="side-section">{t('nav.discover')}</div>
      <button className="side-link" onClick={() => onView('cards')}>◈ <span>{t('nav.explore')}</span></button>
      {medium === 'video' && <button className="side-link" onClick={() => onView('sequence')}>↝ <span>{t('nav.sequences')}</span></button>}
      <button className="side-link" onClick={() => onView('timeline')}>◷ <span>{t('nav.timeline')}</span></button>

      <div className="side-section">{t('nav.formats')}</div>
      <button className={`side-link ${format === 'All' ? 'current' : ''}`} aria-pressed={format === 'All'} onClick={() => onFormat('All')}>
        <span>{t('filter.all')}</span><small className="side-count">{total}</small>
      </button>
      {facets.formats.map(entry => <button key={entry.id} className={`side-link ${format === entry.id ? 'current' : ''}`} aria-pressed={format === entry.id} onClick={() => onFormat(entry.id)}>
        <span>{t(`format.${entry.id}` as 'format.Manga')}</span><small className="side-count">{entry.count}</small>
      </button>)}
      <div className="side-section">{t('nav.series')}</div>
      <div className="side-list">
        {facets.franchises.map(entry => <button key={entry.id} className={`side-link ${franchise === entry.name ? 'current' : ''}`} onClick={() => onFranchise(entry.name)}>
          <span>{entry.name}</span><small className="side-count">{entry.count}</small>
        </button>)}
      </div>
      {medium === 'video' && <>
        <div className="side-section">{t('nav.companies')}</div>
        <CompanySidebar dataset={dataset} t={t} onFranchise={onFranchise} onCompany={onCompany} onAll={onAllCompanies}/>
      </>}
      {franchise !== 'All' && <button className="side-link clear" onClick={() => onFranchise('All')}>✕ <span>{franchise}</span></button>}

      {tags.length > 0 && <>
        <div className="side-section">{t('nav.collections')}</div>
        {tags.map(entry => <button key={entry.id} className={`side-link ${tag === entry.id ? 'current' : ''}`} onClick={() => onTag(entry.id)}>
          <span className="side-dot" style={{background: 'var(--accent)'}}/>
          <span>{entry.name}</span><small>{entry.count}</small>
        </button>)}
      </>}
    </div>

    <div className="sidebar-footer">
      <button className="side-link settings-link" onClick={onSettings}>⚙ <span>{t('nav.settings')}</span></button>
      <div className="footer-note"><span>✳</span><div>{t('side.footer')}<small>{t('side.footerSub')}</small></div></div>
    </div>
  </aside>;
}
