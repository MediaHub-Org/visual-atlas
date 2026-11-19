import type {Dataset} from '../data';
import type {TFn} from '../i18n';
import {CompanySidebar} from './CompanyTree';

export function Sidebar({dataset, t, franchise, tag, tags, onFranchise, onCompany, onAllCompanies, onTag, onView, onSettings}: {
  dataset: Dataset;
  t: TFn;
  franchise: string;
  tag: string;
  tags: {id: string; name: string; count: number}[];
  onFranchise: (name: string) => void;
  onCompany: (id: string) => void;
  onAllCompanies: () => void;
  onTag: (id: string) => void;
  onView: (view: 'cards' | 'sequence' | 'timeline' | 'hierarchy') => void;
  onSettings: () => void;
}) {
  return <aside className="sidebar">
    <div className="brand"><span className="brand-icon">✳</span> FRAME<span className="brand-dot">.</span></div>
    <div className="sidebar-label">{t('brand.sub')}</div>

    <div className="side-scroll">
      <div className="side-section">{t('nav.discover')}</div>
      <button className="side-link" onClick={() => onView('cards')}>◈ <span>{t('nav.explore')}</span></button>
      <button className="side-link" onClick={() => onView('sequence')}>↝ <span>{t('nav.sequences')}</span></button>
      <button className="side-link" onClick={() => onView('timeline')}>◷ <span>{t('nav.timeline')}</span></button>

      <div className="side-section">{t('nav.companies')}</div>
      <CompanySidebar dataset={dataset} t={t} onFranchise={onFranchise} onCompany={onCompany} onAll={onAllCompanies}/>
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
