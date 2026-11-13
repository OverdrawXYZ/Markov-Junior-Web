import Basic from './Basic.xml?raw';
import BasicSnake from './BasicSnake.xml?raw';
import Flowers from './Flowers.xml?raw';
import Growth from './Growth.xml?raw';
import MazeBacktracker from './MazeBacktracker.xml?raw';
import MazeGrowth from './MazeGrowth.xml?raw';
import NystromDungeon from './NystromDungeon.xml?raw';
import River from './River.xml?raw';

export interface Example {
  id: string;
  name: string;
  description: string;
  source: string;
  size: number;
}

/** Programs from MarkovJunior by Maxim Gumin (MIT). Sizes follow its models.xml. */
export const EXAMPLES: readonly Example[] = [
  {
    id: 'MazeBacktracker',
    name: 'Maze backtracker',
    description: 'Depth-first maze generation.',
    source: MazeBacktracker,
    size: 59,
  },
  {
    id: 'MazeGrowth',
    name: 'Maze growth',
    description: 'A maze grown like a tree from the centre.',
    source: MazeGrowth,
    size: 59,
  },
  {
    id: 'River',
    name: 'River',
    description: 'A river with banks, grass and forest.',
    source: River,
    size: 80,
  },
  {
    id: 'NystromDungeon',
    name: 'Dungeon',
    description: 'Rooms and corridors with a few cycles.',
    source: NystromDungeon,
    size: 39,
  },
  {
    id: 'Flowers',
    name: 'Flowers',
    description: 'Flowers growing from the soil.',
    source: Flowers,
    size: 60,
  },
  {
    id: 'BasicSnake',
    name: 'Snake',
    description: 'A snake that eats its way around (never halts).',
    source: BasicSnake,
    size: 23,
  },
  {
    id: 'Growth',
    name: 'Growth',
    description: 'Random growth from a seed cell.',
    source: Growth,
    size: 79,
  },
  {
    id: 'Basic',
    name: 'Basic',
    description: 'The simplest program: paint black cells white.',
    source: Basic,
    size: 60,
  },
];

export const DEFAULT_EXAMPLE = EXAMPLES[0]!;
