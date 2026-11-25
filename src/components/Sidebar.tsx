import type {Dataset} from '../data';
import {BASE} from '../base';
import type {TFn} from '../i18n';
import {facetLists, matchesFormat, type Medium} from '../medium';

/** Video | Text catalogue switch, in the sidebar and in the explore header. */
export function MediaSwitch({medium, onMedium, t}: {medium: Medium; onMedium: (medium: Medium) => void; t: TFn}) {
  return <div className="segmented media-switch" role="group" aria-label={t('media.label')}>
    {(['video', 'text'] as const).map(option => <button key={option} className={medium === option ? 'selected' : ''} aria-pressed={medium === option} title={t(`media.${option}Hint`)} onClick={() => onMedium(option)}>
      {t(`media.${option}`)}
    </button>)}
  </div>;
}

export function Sidebar({dataset, t, franchise, universe, onUniverse, medium, onMedium, format, onFormat, onHome, onFranchise, onView, onSettings}: {
  dataset: Dataset;
  t: TFn;
  franchise: string;
  /** Family id (Marvel, DC) or '' for none. */
  universe: string;
  onUniverse: (id: string) => void;
  medium: Medium;
  onMedium: (medium: Medium) => void;
  format: string;
  onFormat: (format: string) => void;
  onHome: () => void;
  onFranchise: (name: string) => void;
  onView: (view: 'cards' | 'sequence' | 'timeline' | 'hierarchy') => void;
  onSettings: () => void;
}) {
  // Watch and Read share one structure: Discover, Format, Series & sagas. The two lists narrow
  // each other, so choosing a format changes the series list and the reverse. Companies and
  // collections and companies are pills above the results, not sidebar lists.
  const family = dataset.families.find(entry => entry.id === universe);
  const facets = facetLists(dataset.works, medium, format, franchise, family?.franchiseIds ?? null);
  const total = dataset.works.filter(work => work.medium === medium
    && (!family || work.memberships.some(m => family.franchiseIds.includes(m.franchiseId)))
    && (franchise === 'All' || work.memberships.some(m => m.franchise === franchise))).length;
  // Universe list: a family (Marvel, DC) groups its franchises; the rest stand alone.
  const inFamily = new Set(dataset.families.flatMap(entry => entry.franchiseIds));
  const groups = dataset.families.map(entry => {
    const children = facets.franchises.filter(item => entry.franchiseIds.includes(item.id));
    const count = dataset.works.filter(work => work.medium === medium && matchesFormat(work, format) && work.memberships.some(m => entry.franchiseIds.includes(m.franchiseId))).length;
    return {entry, children, count};
  }).filter(group => group.count > 0 || group.entry.id === universe);
  const single = facets.franchises.filter(item => !inFamily.has(item.id));
  const row = (item: {id: string; name: string; count: number}, child = false) =>
    <button key={item.id} className={`side-link ${child ? 'side-child' : ''} ${franchise === item.name ? 'current' : ''}`} onClick={() => onFranchise(item.name)}>
      <span>{item.name}</span><small className="side-count">{item.count}</small>
    </button>;
  return <aside className="sidebar">
    <a className="brand" href={BASE} aria-label={t('nav.home')} onClick={event => { event.preventDefault(); onHome(); }}><span className="brand-icon">✳</span> FRAME<span className="brand-dot">.</span></a>
    <div className="sidebar-label">{t('brand.sub')}</div>

    <div className="side-scroll">
      <MediaSwitch medium={medium} onMedium={onMedium} t={t}/>
      <div className="side-section">{t('nav.discover')}</div>
      <button className="side-link" onClick={() => onView('cards')}>◈ <span>{t('nav.explore')}</span></button>
      <button className="side-link" onClick={() => onView('sequence')}>↝ <span>{t('nav.sequences')}</span></button>
      <button className="side-link" onClick={() => onView('timeline')}>◷ <span>{t('nav.timeline')}</span></button>

      <div className="side-filters">
      <div className="side-section">{t('nav.formats')}</div>
      <button className={`side-link ${format === 'All' ? 'current' : ''}`} aria-pressed={format === 'All'} onClick={() => onFormat('All')}>
        <span>{t('filter.all')}</span><small className="side-count">{total}</small>
      </button>
      {facets.formats.map(entry => <button key={entry.id} className={`side-link ${format === entry.id ? 'current' : ''}`} aria-pressed={format === entry.id} onClick={() => onFormat(entry.id)}>
        <span>{t(`format.${entry.id}` as 'format.Manga')}</span><small className="side-count">{entry.count}</small>
      </button>)}
      <div className="side-section">{t('nav.universes')}</div>
      <div className="side-list">
        {groups.map(({entry, children, count}) => {
          const open = universe === entry.id || children.some(item => item.name === franchise);
          return <div key={entry.id}>
            <button className={`side-link side-family ${universe === entry.id && franchise === 'All' ? 'current' : ''}`} aria-expanded={open} onClick={() => onUniverse(universe === entry.id ? '' : entry.id)}>
              <span className={`chevron small ${open ? 'open' : ''}`} aria-hidden="true"/>
              <span>{entry.name}</span><small className="side-count">{count}</small>
            </button>
            {open && children.map(item => row(item, true))}
          </div>;
        })}
        {single.map(item => row(item))}
      </div>
      {(franchise !== 'All' || universe) && <button className="side-link clear" onClick={() => { onUniverse(''); onFranchise('All'); }}>✕ <span>{franchise !== 'All' ? franchise : family?.name}</span></button>}
      </div>
    </div>

    <div className="sidebar-footer">
      <button className="side-link settings-link" onClick={onSettings}>⚙ <span>{t('nav.settings')}</span></button>
      <div className="footer-note"><span>✳</span><div>{t('side.footer')}<small>{t('side.footerSub')}</small></div></div>
    </div>
  </aside>;
}
