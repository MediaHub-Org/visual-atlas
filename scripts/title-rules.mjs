// Works whose seed title is an editorial label rather than a TMDB title. Each
// rule narrows the search and, when the label names a specific edition, picks it
// explicitly: the scripts still verify every field against TMDB.
export const titleRules = {
  'series--doctor-who-original-series': {query: 'Doctor Who', prefer: 'earliest'},
  'series--doctor-who-revived-series': {query: 'Doctor Who', year: 2005},
  'series--battlestar-galactica-reimagined-series': {query: 'Battlestar Galactica', prefer: 'latest'},
  'series--astro-boy-original-series': {query: 'Astro Boy', prefer: 'earliest'},
  'series--sailor-moon-original-series': {query: 'Sailor Moon', prefer: 'earliest'},
  'series--cowboy-bebop-anime': {query: 'Cowboy Bebop', prefer: 'earliest'},
  'series--one-piece-anime': {query: 'One Piece', prefer: 'earliest'},
  'series--pokemon-original-anime-series': {query: 'Pokemon', prefer: 'earliest'},
  'series--death-note-anime': {query: 'Death Note', prefer: 'earliest'},
  'series--monster-anime': {query: 'Monster', prefer: 'earliest'},
  'series--justice-league-animated-series': {query: 'Justice League', prefer: 'earliest'},
  'series--doraemon-1979-series': {query: 'Doraemon', year: 1979},
  'series--doraemon-2005-series': {query: 'Doraemon', year: 2005},
  'series--money-heist-la-casa-de-papel': {query: 'Money Heist'},
  'series--el-ministerio-del-tiempo': {query: 'The Ministry of Time'},
  'series--les-revenants': {query: 'The Returned', prefer: 'earliest'},
  'series--cuentame-como-paso': {query: 'Cuentame como paso', prefer: 'earliest'},
  'series--mad-men': {query: 'Mad Men', prefer: 'earliest'},
  'series--lost': {query: 'Lost', prefer: 'earliest'},
  'series--avatar-the-last-airbender': {query: 'Avatar: The Last Airbender', prefer: 'earliest'},
  'series--chernobyl': {query: 'Chernobyl', prefer: 'earliest'},
  'series--daredevil': {query: 'Daredevil', year: 2015},
  'series--the-twilight-zone-original-series': {query: 'The Twilight Zone', year: 1959},
};
