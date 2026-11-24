// Star Wars pilot: the calendar and the reviewed map `seed work id -> Wookieepedia page`.
// A title search is ambiguous (it returns novelisations first), so the map is
// explicit. Add a franchise by writing another file like this one.
export const calendar = {
  id: 'star-wars-yavin',
  name: 'Galactic Standard Calendar (Battle of Yavin)',
  franchise: 'star-wars',
  anchor_event: 'Battle of Yavin',
  unit: 'year',
  era_before: 'BBY',
  era_after: 'ABY',
  zero_year_exists: true,
};

export const pages = {
  'film--the-phantom-menace--1999': 'Star Wars: Episode I The Phantom Menace',
  'film--attack-of-the-clones--2002': 'Star Wars: Episode II Attack of the Clones',
  'film--star-wars-the-clone-wars--2008': 'Star Wars: The Clone Wars (film)',
  'film--revenge-of-the-sith--2005': 'Star Wars: Episode III Revenge of the Sith',
  'film--solo-a-star-wars-story--2018': 'Solo: A Star Wars Story',
  'film--rogue-one-a-star-wars-story--2016': 'Rogue One: A Star Wars Story',
  'film--a-new-hope--1977': 'Star Wars: Episode IV A New Hope',
  'film--the-empire-strikes-back--1980': 'Star Wars: Episode V The Empire Strikes Back',
  'film--return-of-the-jedi--1983': 'Star Wars: Episode VI Return of the Jedi',
  'film--the-mandalorian-and-grogu--2026': 'Star Wars: The Mandalorian and Grogu',
  'film--the-force-awakens--2015': 'Star Wars: Episode VII The Force Awakens',
  'film--the-last-jedi--2017': 'Star Wars: Episode VIII The Last Jedi',
  'film--the-rise-of-skywalker--2019': 'Star Wars: Episode IX The Rise of Skywalker',
  'series--star-wars-the-clone-wars': 'Star Wars: The Clone Wars',
  'series--star-wars-rebels': 'Star Wars Rebels',
  'series--the-mandalorian': 'Star Wars: The Mandalorian',
  'series--andor': 'Star Wars: Andor',
  'series--ahsoka': 'Star Wars: Ahsoka',
};
