import type { Book, Format } from '../db'

const editions = [
  ['secret-garden', 'The Secret Garden', 'Frances Hodgson Burnett', '#3f5638'],
  ['alice', 'Alice’s Adventures in Wonderland', 'Lewis Carroll', '#8a5141'],
  ['pride', 'Pride and Prejudice', 'Jane Austen', '#273f48'],
  ['frankenstein', 'Frankenstein', 'Mary Shelley', '#786750'],
  ['treasure', 'Treasure Island', 'Robert Louis Stevenson', '#75422e'],
  ['little-women', 'Little Women', 'Louisa May Alcott', '#764959'],
  ['jungle', 'The Jungle Book', 'Rudyard Kipling', '#495438'],
  ['time-machine', 'The Time Machine', 'H. G. Wells', '#9b6b38'],
  ['persuasion', 'Persuasion', 'Jane Austen', '#526674'],
  ['wind', 'The Wind in the Willows', 'Kenneth Grahame', '#685440'],
  ['moby-dick', 'Moby-Dick', 'Herman Melville', '#724534'],
  ['dracula', 'Dracula', 'Bram Stoker', '#384b42'],
  ['emma', 'Emma', 'Jane Austen', '#42645f'],
  ['odyssey', 'The Odyssey', 'Homer', '#774332'],
  ['heights', 'Wuthering Heights', 'Emily Brontë', '#7e5841'],
  ['cities', 'A Tale of Two Cities', 'Charles Dickens', '#384952'],
  ['songs', 'Songs of Innocence', 'William Blake', '#9b6745'],
]
export const samples: Book[] = editions.map(([slug, title, author, color], i) => {
  const format: Format = slug === 'songs' ? 'pdf' : 'epub'
  return { id: slug === 'songs' ? -11 : -(i < 10 ? i + 1 : i + 2), title, author, color, format, added: -i, sample: import.meta.env.BASE_URL + 'samples/' + slug + '.' + format }
})
