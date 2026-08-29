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

/** Clamp a tile index into the 0-99 range. Internal helper. */
function clampTile(tile: number): number {
  return Math.max(0, Math.min(99, Math.floor(tile)));
}

/** Visual (rendered) grid coordinates for a tile.
 *  Boustrophedon: odd rows run right-to-left, so the visual column is
 *  flipped relative to the numbering-order column. Use this when positioning
 *  DOM/SVG elements that ignore CSS `direction: rtl`. */
export function tileToVisualPos(tile: number): { row: number; col: number } {
  const clamped = clampTile(tile);
  const row = Math.floor(clamped / GRID_SIZE);
  const colRaw = clamped % GRID_SIZE;
  const col = row % 2 === 1 ? GRID_SIZE - 1 - colRaw : colRaw;
  return { row, col };
}

/** Tile center in visual grid units (i.e. SVG `viewBox` coordinates).
 *  Uses the boustrophedon-aware `tileToVisualPos`, then offsets by +0.5. */
export function tileCenter(tile: number): { x: number; y: number } {
  const { row, col } = tileToVisualPos(tile);
  return { x: col + 0.5, y: row + 0.5 };
}

/** Cubic ease-out: 1 - (1 - t)^3. Used for snappy decelerating animations. */
export function easeOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - x, 3);
}

/** Safe palette lookup. `idx & 3` always lands in [0..3] so the indexed access
 *  is guaranteed even under `noUncheckedIndexedAccess`. */
export function paletteColor(idx: number): string {
  return TILE_PALETTE[idx & 3] as string;
}

/** 4-color pastel palette for the 2D board checker. Single source of truth — the
 *  Board2D component must use this rather than redeclaring its own. */
export const TILE_PALETTE: readonly string[] = ['#FFF5F7', '#FFE4EC', '#E5F4FB', '#FFEFD8'];

/** Alternating checker-style pastel for a tile index. Uses the 4-color palette
 *  with boustrophedon-aware column flip so the pattern reads correctly in both
 *  row directions. */
export function tileColor(tile: number): string {
  const { row, col } = tileToVisualPos(tile);
  return paletteColor(row + col);
}

/** @deprecated Use `tileToVisualPos` for visual positioning. This alias
 *  returns numbering-order coordinates (no boustrophedon flip) and is kept
 *  only for callers that rely on CSS `direction: rtl` to do the flip. */
export function tileToGridPos(tile: number): { row: number; col: number } {
  const clamped = clampTile(tile);
  return {
    row: Math.floor(clamped / GRID_SIZE),
    col: clamped % GRID_SIZE,
  };
}
