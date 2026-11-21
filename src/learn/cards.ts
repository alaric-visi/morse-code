import index from '../../content/courses/cards.json';
import { parseMarkdown, titleOf, type Block } from './markdown';

const files = import.meta.glob('../../content/courses/lessons/*.md', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

export interface TeachingCard {
  id: string;
  /** Unlocks at this lesson. */
  lesson: number;
  title: string;
  blocks: Block[];
}

export const CARDS: TeachingCard[] = index.map(({ id, lesson }) => {
  const src = files[`../../content/courses/lessons/${id}.md`];
  if (!src) throw new Error(`Missing teaching card: ${id}.md`);
  const blocks = parseMarkdown(src);
  return { id, lesson, title: titleOf(blocks), blocks };
});

export const cardsForLesson = (lesson: number) => CARDS.filter((c) => c.lesson === lesson);
export const cardsUpTo = (lesson: number) => CARDS.filter((c) => c.lesson <= lesson);
