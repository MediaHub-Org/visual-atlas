import React, {useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {works, type Work} from './data';
import './style.css';

type View = 'cards' | 'list' | 'hierarchy' | 'sequence';
const franchises = [...new Set(works.map(w => w.franchise))];
function App() {
  const initial = new URLSearchParams(location.search);
  const [query,setQuery] = useState(initial.get('q') || '');
  const [franchise,setFranchise] = useState(initial.get('franchise') || 'All');
  const [format,setFormat] = useState(initial.get('format') || 'All');
  const [sort,setSort] = useState(initial.get('sort') || 'release');
  const [view,setView] = useState<View>(['cards','list','hierarchy','sequence'].includes(initial.get('view') || '') ? initial.get('view') as View : 'cards');
  const [density,setDensity] = useState(initial.get('density') === 'compact' ? 'compact' : 'comfortable');
  const [selected,setSelected] = useState(initial.get('work') || '');
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelected('');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  useEffect(() => {
    const p = new URLSearchParams();
    if(query) p.set('q',query); if(franchise !== 'All') p.set('franchise',franchise);
    if(format !== 'All') p.set('format',format); if(sort !== 'release') p.set('sort',sort);
    if(view !== 'cards') p.set('view',view); if(density !== 'comfortable') p.set('density',density);
    if(selected) p.set('work',selected);
    history.replaceState(null,'',`${location.pathname}${p.size ? `?${p}` : ''}`);
  },[query,franchise,format,sort,view,density,selected]);
  const filtered = useMemo(() => works.filter(w =>
    (franchise === 'All' || w.franchise === franchise) &&
    (format === 'All' || (format === 'Anime' ? w.anime : w.format === format)) &&
    `${w.title} ${w.franchise} ${w.creators}`.toLowerCase().includes(query.toLowerCase())
  ).sort((a,b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'newest' ? b.year-a.year : a.year-b.year),[query,franchise,format,sort]);
  const selectedWork = works.find(w => w.id === selected);
  const grouped = [...new Set(filtered.map(w => view === 'sequence' ? `${w.franchise} / ${w.continuity}` : w.franchise))];
  function card(w: Work) {return <button className="card" key={w.id} onClick={() => setSelected(w.id)}>
    <span className="poster" style={{'--poster':w.color} as React.CSSProperties}><span className="poster-top">FRAME / {w.format.toUpperCase()}</span><span className="poster-title">{w.title}</span><span className="poster-bottom">{w.year} <span>✳</span></span></span>
    <span className="card-title">{w.title} <span>({w.year})</span></span><span className="badge">{w.continuity}</span>
  </button>}
  return <div className="app">
    <aside className="sidebar"><div className="brand"><span className="brand-icon">✳</span> FRAME<span className="brand-dot">.</span></div><div className="sidebar-label">THE VISUAL ATLAS</div>
      <div className="side-section">DISCOVER</div><button className="side-link active" onClick={() => {setFranchise('All');setView('cards')}}>◈ <span>Explore all</span></button><button className="side-link" onClick={() => setView('sequence')}>◷ <span>Narrative sequences</span></button>
      <div className="side-section">FRANCHISES <span>+</span></div>{franchises.filter(f => f !== 'Standalone').slice(0,7).map((f,i) => <button className={'side-link '+(franchise===f?'current':'')} key={f} onClick={() => setFranchise(f)}><span className="side-dot" style={{background:['#b98b69','#a5a4c4','#8d9c80','#d2a76f'][i%4]}}/> <span>{f}</span></button>)}
      <div className="sidebar-footer"><span>✳</span><div>Stories are connected.<small>Find your way through them.</small></div></div>
    </aside>
    <main><header className="topbar"><div className="crumb"><button onClick={() => setFranchise('All')}>Atlas</button><span> / </span><strong>{franchise === 'All' ? 'Explore' : franchise}</strong></div><span className="top-note">A WORLD OF STORIES, CONNECTED <b>✳</b></span></header>
      <div className="content"><section className="intro"><div><div className="eyebrow"><span/> THE VISUAL ATLAS OF STORIES</div><h1>Every story has<br/><em>a universe.</em></h1><p>Explore the films, series and worlds that connect us.<br/>One story at a time.</p><div className="stats"><div><strong>{works.filter(w=>w.format==='Film').length.toString().padStart(2,'0')}</strong><span>FILMS</span></div><div><strong>{works.filter(w=>w.format==='Series').length.toString().padStart(2,'0')}</strong><span>SERIES</span></div><div><strong>{franchises.length-1}</strong><span>WORLDS</span></div></div></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="planet">✳</div><span className="hero-caption">A UNIVERSE OF STORIES<br/>WAITING TO BE DISCOVERED</span><span className="hero-number">01 — 04</span></div></section>
      <section className="collection"><div className="section-heading"><div><div className="eyebrow"><span/> THE COLLECTION</div><h2>{franchise === 'All' ? 'Explore the atlas' : franchise}</h2><p>Discover the stories behind the worlds.</p></div><div className="results">{filtered.length} WORKS <span> / </span> {filtered.filter(w=>w.format==='Film').length} FILMS · {filtered.filter(w=>w.format==='Series').length} SERIES</div></div>
        <div className="toolbar"><label className="search">⌕ <input aria-label="Search titles, franchises and creators" placeholder="Search titles, people, worlds..." value={query} onChange={e=>setQuery(e.target.value)}/></label><label><span className="sr">Franchise</span><select value={franchise} onChange={e=>setFranchise(e.target.value)}><option>All</option>{franchises.map(f=><option key={f}>{f}</option>)}</select></label><label><span className="sr">Format</span><select value={format} onChange={e=>setFormat(e.target.value)}><option>All</option><option>Film</option><option>Series</option><option>Anime</option></select></label><label><span className="sr">Sort</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="release">Release: oldest</option><option value="newest">Release: newest</option><option value="title">Title: A–Z</option></select></label></div>
        <div className="viewbar"><div className="views">{(['cards','list','hierarchy','sequence'] as View[]).map(v=><button key={v} className={view===v?'selected':''} onClick={()=>setView(v)}>{({cards:'▦  Cards',list:'☰  List',hierarchy:'☷  Hierarchy',sequence:'↝  Sequence'})[v]}</button>)}</div><button className="density" onClick={()=>setDensity(density==='compact'?'comfortable':'compact')}>Density: {density} ◫</button></div>
        {filtered.length===0 ? <div className="empty">No works found. Try a different search or filter.</div> : view==='cards' ? <div className={'grid '+density}>{filtered.map(card)}</div> : view==='list' ? <div className="table-wrap"><table><thead><tr><th>WORK</th><th>YEAR</th><th>FORMAT</th><th>FRANCHISE</th><th>CONTINUITY</th></tr></thead><tbody>{filtered.map(w=><tr key={w.id} onClick={()=>setSelected(w.id)}><td><button onClick={()=>setSelected(w.id)}>{w.title}</button></td><td>{w.year}</td><td>{w.format}</td><td>{w.franchise}</td><td>{w.continuity}</td></tr>)}</tbody></table></div> : <div className="groups">{grouped.map(group=><details key={group} open><summary>{group}</summary><div className="group-items">{filtered.filter(w=>(view==='sequence'?`${w.franchise} / ${w.continuity}`:w.franchise)===group).sort((a,b)=>view==='sequence'?(a.sequence??Infinity)-(b.sequence??Infinity):a.year-b.year).map(w=><button key={w.id} onClick={()=>setSelected(w.id)}><span>{view==='sequence'?(w.sequence ?? '—'):'↳'}</span> {w.title} <small>({w.year}) · {w.format}{view==='sequence'&&!w.sequence?' · position unknown':''}</small></button>)}</div></details>)}</div>}
      </section><footer>FRAME <span>✳</span> <p>DEMONSTRATION DATA · NOT YET VERIFIED</p></footer></div>
    </main>
    {selectedWork && <div className="overlay" onClick={()=>setSelected('')}><aside className="detail" role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={e=>e.stopPropagation()}><button className="close" aria-label="Close details" onClick={()=>setSelected('')}>✕</button><div className="detail-art" style={{'--poster':selectedWork.color} as React.CSSProperties}><span>FRAME / {selectedWork.format.toUpperCase()}</span><strong>{selectedWork.title}</strong></div><div className="detail-body"><span className="eyebrow">THE COLLECTION / {selectedWork.franchise.toUpperCase()}</span><h2 id="detail-title">{selectedWork.title}</h2><p className="detail-meta">{selectedWork.year} &nbsp; · &nbsp; {selectedWork.format} {selectedWork.anime && ' · Anime'}</p><span className="badge">{selectedWork.continuity}</span><h3>THE STORY</h3><p>{selectedWork.description}</p><h3>CREATIVE CREDIT</h3><p>{selectedWork.creators}</p><h3>EDITORIAL NOTE</h3><p>Demonstration record. Credits, continuity and other details are not yet verified against sources.</p></div></aside></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
