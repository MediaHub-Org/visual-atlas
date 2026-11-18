export type Work = {
  id: string; title: string; year: number; format: 'Film' | 'Series';
  franchise: string; continuity: string; anime?: boolean; animated?: boolean;
  creators: string; description: string; color: string; sequence?: number;
};

// Demonstration only: titles and relationships require independent verification.
export const works: Work[] = [
  {id:'sw4',title:'A New Hope',year:1977,format:'Film',franchise:'Star Wars',continuity:'Skywalker saga',creators:'George Lucas',description:'A young farmhand becomes part of a rebellion against the Empire.',color:'#94674f',sequence:4},
  {id:'sw5',title:'The Empire Strikes Back',year:1980,format:'Film',franchise:'Star Wars',continuity:'Skywalker saga',creators:'Irvin Kershner',description:'The rebels face the Empire as Luke continues his training.',color:'#4b6877',sequence:5},
  {id:'sw1',title:'The Phantom Menace',year:1999,format:'Film',franchise:'Star Wars',continuity:'Skywalker saga',creators:'George Lucas',description:'Two Jedi become involved in a conflict on Naboo.',color:'#a28255',sequence:1},
  {id:'andor',title:'Andor',year:2022,format:'Series',franchise:'Star Wars',continuity:'Main continuity',creators:'Tony Gilroy',description:'Cassian Andor becomes involved in the growing rebellion.',color:'#707856'},
  {id:'xmen',title:'X-Men',year:2000,format:'Film',franchise:'X-Men',continuity:'Original films',creators:'Bryan Singer',description:'Mutants face a world divided by fear and prejudice.',color:'#687481',sequence:1},
  {id:'first-class',title:'X-Men: First Class',year:2011,format:'Film',franchise:'X-Men',continuity:'Prequel films',creators:'Matthew Vaughn',description:'Charles Xavier and Erik Lehnsherr encounter a new generation of mutants.',color:'#a28158'},
  {id:'alien',title:'Alien',year:1979,format:'Film',franchise:'Alien',continuity:'Alien',creators:'Ridley Scott',description:'The crew of a commercial spacecraft encounter a deadly organism.',color:'#566653',sequence:1},
  {id:'aliens',title:'Aliens',year:1986,format:'Film',franchise:'Alien',continuity:'Alien',creators:'James Cameron',description:'Ripley returns with a team to investigate a lost colony.',color:'#526b69',sequence:2},
  {id:'breaking-bad',title:'Breaking Bad',year:2008,format:'Series',franchise:'Breaking Bad universe',continuity:'Main continuity',creators:'Vince Gilligan',description:'A chemistry teacher enters the illicit drug trade.',color:'#65724e'},
  {id:'better-call-saul',title:'Better Call Saul',year:2015,format:'Series',franchise:'Breaking Bad universe',continuity:'Main continuity',creators:'Vince Gilligan · Peter Gould',description:'The story of lawyer Jimmy McGill.',color:'#b0835f'},
  {id:'wire',title:'The Wire',year:2002,format:'Series',franchise:'Standalone',continuity:'Standalone',creators:'David Simon',description:'A portrait of institutions and life in Baltimore.',color:'#77736a'},
  {id:'dark',title:'Dark',year:2017,format:'Series',franchise:'Standalone',continuity:'Standalone',creators:'Baran bo Odar · Jantje Friese',description:'A disappearance exposes secrets in a German town.',color:'#58665b'},
  {id:'chernobyl',title:'Chernobyl',year:2019,format:'Series',franchise:'Standalone',continuity:'Standalone',creators:'Craig Mazin',description:'A dramatization of the Chernobyl nuclear disaster.',color:'#777c67'},
  {id:'dragon-ball',title:'Dragon Ball',year:1986,format:'Series',franchise:'Dragon Ball',continuity:'Dragon Ball',anime:true,animated:true,creators:'Based on the manga by Akira Toriyama',description:'Goku begins a search for the Dragon Balls.',color:'#ad7950'},
  {id:'one-piece',title:'One Piece',year:1999,format:'Series',franchise:'One Piece',continuity:'Anime series',anime:true,animated:true,creators:'Based on the manga by Eiichiro Oda',description:'Monkey D. Luffy sets out to become King of the Pirates.',color:'#527b80'},
  {id:'evangelion',title:'Neon Genesis Evangelion',year:1995,format:'Series',franchise:'Evangelion',continuity:'Original series',anime:true,animated:true,creators:'Hideaki Anno',description:'Teenage pilots defend a city against mysterious beings.',color:'#706479'},
  {id:'cowboy-bebop',title:'Cowboy Bebop',year:1998,format:'Series',franchise:'Cowboy Bebop',continuity:'Original series',anime:true,animated:true,creators:'Shinichirō Watanabe',description:'A crew of bounty hunters travels through space.',color:'#a36b59'}
];
