// Shared board geometry for the 3D Ular Tangga board.
// Tile indices follow the server convention: 0-99 (display adds +1).
//
// Layout is boustrophedon (zigzag) like a real Snakes & Ladders board:
//   row 0 (tiles 0-9):   left -> right
//   row 1 (tiles 10-19): right -> left
//   row 2 (tiles 20-29): left -> right
//   ...alternating every row.

export const GRID_SIZE = 10;
export const TILE_SIZE = 0.9;
export const GAP = 0.06;

/** World-space X/Z center of a tile (y is handled by consumers). */
export function tileToWorld(tile: number): [number, number] {
  const clamped = Math.max(0, Math.min(99, Math.floor(tile)));
  const row = Math.floor(clamped / GRID_SIZE);
  let col = clamped % GRID_SIZE;
  // Odd rows run right-to-left (boustrophedon numbering)
  if (row % 2 === 1) {
    col = GRID_SIZE - 1 - col;
  }
  const x = (col - (GRID_SIZE - 1) / 2) * (TILE_SIZE + GAP);
  const z = (row - (GRID_SIZE - 1) / 2) * (TILE_SIZE + GAP);
  return [x, z];
}

const TILE_COLORS = [
  '#FFF5F7', // cute bg
  '#FFE4EC', // light pink
];

/** Alternating checker-style pastel for a tile index. */
export function tileColor(tile: number): string {
  const row = Math.floor(tile / GRID_SIZE);
  const colRaw = tile % GRID_SIZE;
  const col = row % 2 === 1 ? GRID_SIZE - 1 - colRaw : colRaw;
  return TILE_COLORS[(row + col) % TILE_COLORS.length];
}
