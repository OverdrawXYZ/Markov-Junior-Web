import Basic from './Basic.xml?raw';
import DrunkardsWalk from './DrunkardsWalk.xml?raw';
import Islands from './Islands.xml?raw';
import BasicSnake from './BasicSnake.xml?raw';
import BiasedMazeGrowth from './BiasedMazeGrowth.xml?raw';
import Cave from './Cave.xml?raw';
import ConnectedCaves from './ConnectedCaves.xml?raw';
import Flowers from './Flowers.xml?raw';
import GameOfLife from './GameOfLife.xml?raw';
import Growth from './Growth.xml?raw';
import MazeBacktracker from './MazeBacktracker.xml?raw';
import MarchingSquares from './MarchingSquares.xml?raw';
import MazeGrowth from './MazeGrowth.xml?raw';
import NystromDungeon from './NystromDungeon.xml?raw';
import River from './River.xml?raw';

export interface Example {
  id: string;
  name: string;
  description: string;
  source: string;
  size: number;
  /** Written for this project, rather than ported from MarkovJunior. */
  original?: boolean;
}

/**
 * Bundled programs. Unless marked `original`, they come from MarkovJunior by
 * Maxim Gumin (MIT) and their sizes follow its models.xml.
 */
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
    id: 'BiasedMazeGrowth',
    name: 'Biased maze',
    description: 'A maze pulled towards the bottom edge by a distance field.',
    source: BiasedMazeGrowth,
    size: 59,
  },
  {
    id: 'Cave',
    name: 'Cave',
    description: 'Noise smoothed into caves by a cellular automaton.',
    source: Cave,
    size: 60,
  },
  {
    id: 'ConnectedCaves',
    name: 'Connected caves',
    description: 'Caves joined up by drawing shortest paths between them.',
    source: ConnectedCaves,
    size: 60,
  },
  {
    id: 'MarchingSquares',
    name: 'Marching squares',
    description: 'Noise mapped onto a 3× grid of smooth shapes with a map node.',
    source: MarchingSquares,
    size: 20,
  },
  {
    id: 'GameOfLife',
    name: 'Game of Life',
    description: "Conway's Game of Life on a wrapping grid (never halts).",
    source: GameOfLife,
    size: 80,
  },
  {
    id: 'Islands',
    name: 'Islands',
    description: 'Islands with sandy shores and forests.',
    source: Islands,
    size: 72,
    original: true,
  },
  {
    id: 'DrunkardsWalk',
    name: "Drunkard's walk",
    description: 'A random walker carves out a cave.',
    source: DrunkardsWalk,
    size: 64,
    original: true,
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
