import type {Dataset} from '../data';
import type {TFn} from '../i18n';
import {CompanySidebar} from './CompanyTree';
import {catalogueFranchises, type Medium} from '../medium';

/** Video | Text catalogue switch, in the sidebar and in the explore header. */
export function MediaSwitch({medium, onMedium, t}: {medium: Medium; onMedium: (medium: Medium) => void; t: TFn}) {
  return <div className="segmented media-switch" role="group" aria-label={t('media.label')}>
    {(['video', 'text'] as const).map(option => <button key={option} className={medium === option ? 'selected' : ''} aria-pressed={medium === option} title={t(`media.${option}Hint`)} onClick={() => onMedium(option)}>
      {t(`media.${option}`)}
    </button>)}
  </div>;
}

export function Sidebar({dataset, t, franchise, medium, onMedium, format, onFormat, tag, tags, onFranchise, onCompany, onAllCompanies, onTag, onView, onSettings}: {
  dataset: Dataset;
  t: TFn;
  franchise: string;
  medium: Medium;
  onMedium: (medium: Medium) => void;
  format: string;
  onFormat: (format: string) => void;
  tag: string;
  tags: {id: string; name: string; count: number}[];
  onFranchise: (name: string) => void;
  onCompany: (id: string) => void;
  onAllCompanies: () => void;
  onTag: (id: string) => void;
  onView: (view: 'cards' | 'sequence' | 'timeline' | 'hierarchy') => void;
  onSettings: () => void;
}) {
  // Read mode: formats and the franchise list replace the company tree (there is no publisher data yet).
  const textWorks = medium === 'text' ? dataset.works.filter(work => work.medium === 'text') : [];
  const textFormats = ['Manga', 'Comic', 'Graphic novel'].map(id => ({id, count: textWorks.filter(work => work.format === id).length})).filter(entry => entry.count > 0);
  const textFranchises = medium === 'text'
    ? catalogueFranchises(dataset.franchises, dataset.works, 'text')
      .map(entry => ({...entry, count: textWorks.filter(work => work.memberships.some(m => m.franchiseId === entry.id)).length}))
      .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  return <aside className="sidebar">
    <div className="brand"><span className="brand-icon">✳</span> FRAME<span className="brand-dot">.</span></div>
    <div className="sidebar-label">{t('brand.sub')}</div>

    <div className="side-scroll">
      <MediaSwitch medium={medium} onMedium={onMedium} t={t}/>
      <div className="side-section">{t('nav.discover')}</div>
      <button className="side-link" onClick={() => onView('cards')}>◈ <span>{t('nav.explore')}</span></button>
      {medium === 'video' && <button className="side-link" onClick={() => onView('sequence')}>↝ <span>{t('nav.sequences')}</span></button>}
      <button className="side-link" onClick={() => onView('timeline')}>◷ <span>{t('nav.timeline')}</span></button>

      {medium === 'text' && <>
        <div className="side-section">{t('nav.formats')}</div>
        {textFormats.map(entry => <button key={entry.id} className={`side-link ${format === entry.id ? 'current' : ''}`} aria-pressed={format === entry.id} onClick={() => onFormat(entry.id)}>
          <span>{t(`format.${entry.id}` as 'format.Manga')}</span><small className="side-count">{entry.count}</small>
        </button>)}
        <div className="side-section">{t('nav.series')}</div>
        {textFranchises.map(entry => <button key={entry.id} className={`side-link ${franchise === entry.name ? 'current' : ''}`} onClick={() => onFranchise(entry.name)}>
          <span>{entry.name}</span><small className="side-count">{entry.count}</small>
        </button>)}
      </>}
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
