import {useEffect, useState} from 'react';
import type {Dataset} from '../data';
import type {TFn} from '../i18n';

type Mode = 'corporate' | 'studio';

export function CompanyTree({dataset, mode, t, onFranchise, focusId}: {
  dataset: Dataset;
  mode: Mode;
  t: TFn;
  onFranchise: (name: string) => void;
  focusId?: string;
}) {
  const franchisesById = new Map(dataset.franchises.map(franchise => [franchise.id, franchise]));
  const studioIds = [...dataset.companies.values()]
    .filter(company => company.franchiseIds.length > 0)
    .sort((a, b) => b.franchiseIds.length - a.franchiseIds.length || a.name.localeCompare(b.name))
    .map(company => company.id);
  // Open the focused company and every ancestor so the URL state is visible.
  const autoOpen = new Set<string>();
  let focus: string | undefined = focusId;
  while (focus && !autoOpen.has(focus)) {
    autoOpen.add(focus);
    focus = dataset.companies.get(focus)?.parentId ?? undefined;
  }

  const renderFranchises = (ids: string[]) => ids.length
    ? <div className="franchise-chips">{ids.map(id => franchisesById.get(id)).filter(Boolean).map(franchise =>
        <button key={franchise!.id} className="chip" onClick={() => onFranchise(franchise!.name)}>
          {franchise!.name}<span>{franchise!.workIds.length}</span>
        </button>)}
      </div>
    : <p className="muted">{t('hierarchy.noFranchises')}</p>;

  return <div className="company-tree">
    {mode === 'corporate'
      ? dataset.roots.map(rootId => <CompanyNode key={rootId} id={rootId} dataset={dataset} t={t} onFranchise={onFranchise} renderFranchises={renderFranchises} autoOpen={autoOpen}/>)
      : studioIds.map(id => {
          const company = dataset.companies.get(id)!;
          return <CompanyNode key={id} id={id} dataset={dataset} t={t} onFranchise={onFranchise} renderFranchises={renderFranchises} autoOpen={autoOpen} flat/>;
        })}
  </div>;
}

function CompanyNode({id, dataset, t, onFranchise, renderFranchises, autoOpen, flat = false}: {
  id: string;
  dataset: Dataset;
  t: TFn;
  onFranchise: (name: string) => void;
  renderFranchises: (ids: string[]) => React.ReactNode;
  autoOpen: Set<string>;
  flat?: boolean;
}) {
  const company = dataset.companies.get(id);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (autoOpen.has(id)) setOpen(true);
  }, [autoOpen, id]);
  if (!company) return null;
  const franchiseIds = flat ? company.franchiseIds : company.subtreeFranchiseIds;
  const parent = company.parentId ? dataset.companies.get(company.parentId) : undefined;
  return <section className="company">
    <button className="company-head" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span className={`chevron ${open ? 'open' : ''}`} aria-hidden="true"/>
      <span className="company-name">{company.name}</span>
      {!flat && parent && <span className="claim-tag">{t('hierarchy.claimedParent', {name: parent.name})}</span>}
      <span className="company-count">{franchiseIds.length === 1 ? t('hierarchy.franchiseOne') : t('hierarchy.franchises', {n: franchiseIds.length})}</span>
    </button>
    {open && <div className="company-body">
      {!flat && company.childIds.map(childId => <CompanyNode key={childId} id={childId} dataset={dataset} t={t} onFranchise={onFranchise} renderFranchises={renderFranchises} autoOpen={autoOpen}/>)}
      {renderFranchises(franchiseIds)}
    </div>}
  </section>;
}

export function CompanySidebar({dataset, t, onFranchise, onCompany, onAll}: {
  dataset: Dataset;
  t: TFn;
  onFranchise: (name: string) => void;
  onCompany: (id: string) => void;
  onAll: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const franchisesById = new Map(dataset.franchises.map(franchise => [franchise.id, franchise]));
  const roots = dataset.roots.slice(0, 8);
  return <div className="side-companies">
    {roots.map(rootId => {
      const company = dataset.companies.get(rootId);
      if (!company) return null;
      const open = openId === rootId;
      const franchises = company.subtreeFranchiseIds.map(id => franchisesById.get(id)).filter(Boolean);
      return <div key={rootId}>
        <button className="side-link side-company" aria-expanded={open} onClick={() => setOpenId(open ? null : rootId)}>
          <span className={`chevron small ${open ? 'open' : ''}`} aria-hidden="true"/>
          <span>{company.name}</span>
          <small>{franchises.length}</small>
        </button>
        {open && <div className="side-sub">
          <button className="side-parent" onClick={() => onCompany(rootId)}>{t('nav.allCompanies')} · {company.name}</button>
          {company.childIds.map(childId => {
            const child = dataset.companies.get(childId);
            return child ? <button key={childId} className="side-child" onClick={() => onCompany(childId)}>↳ {child.name}</button> : null;
          })}
          {franchises.map(franchise => <button key={franchise!.id} onClick={() => onFranchise(franchise!.name)}>{franchise!.name}</button>)}
        </div>}
      </div>;
    })}
    {dataset.roots.length > 8 && <button className="side-link side-more" onClick={onAll}>+{dataset.roots.length - 8} {t('nav.more')}</button>}
  </div>;
}
