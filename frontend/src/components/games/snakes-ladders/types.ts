// Named wire/render types for snakes-ladders. The server still sends
// `[head, tail]` tuples; the `toSnakeLink` / `toLadderRung` adapters in
// `boardUtils.ts` lift them into these structures so render components
// don't have to spread tuples everywhere.

export interface SnakeLink {
  startTile: number; // head
  endTile: number; // tail
  controlPoints?: ReadonlyArray<{ x: number; y: number }>;
}

export interface LadderRung {
  startTile: number; // bottom
  endTile: number; // top
}

export interface Segment {
  kind: 'walk' | 'sliding';
  tiles: number[];
}
