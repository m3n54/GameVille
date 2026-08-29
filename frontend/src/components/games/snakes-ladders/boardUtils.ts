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

/** Logical grid coordinates for a 2D CSS grid layout.
 *  Odd rows are rendered right-to-left via `direction: rtl`,
 *  so we return the un-flipped (numbering-order) position. */
export function tileToGridPos(tile: number): { row: number; col: number } {
  const clamped = Math.max(0, Math.min(99, Math.floor(tile)));
  return {
    row: Math.floor(clamped / GRID_SIZE),
    col: clamped % GRID_SIZE,
  };
}

/** 4-color pastel palette for the 2D board checker. Single source of truth — the
 *  Board2D component must use this rather than redeclaring its own. */
export const TILE_PALETTE: readonly string[] = ['#FFF5F7', '#FFE4EC', '#E5F4FB', '#FFEFD8'];

/** Alternating checker-style pastel for a tile index. Uses the 4-color palette
 *  with boustrophedon-aware column flip so the pattern reads correctly in both
 *  row directions. */
export function tileColor(tile: number): string {
  const row = Math.floor(tile / GRID_SIZE);
  const colRaw = tile % GRID_SIZE;
  const col = row % 2 === 1 ? GRID_SIZE - 1 - colRaw : colRaw;
  return TILE_PALETTE[(row + col) % TILE_PALETTE.length] ?? '#FFF5F7';
}
