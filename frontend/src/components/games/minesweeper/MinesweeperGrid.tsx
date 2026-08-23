'use client';

import type { MinesweeperView } from '@/types';

interface MinesweeperGridProps {
  view: MinesweeperView;
  myTurn: boolean;
  onReveal: (row: number, col: number) => void;
  onToggleFlag: (row: number, col: number) => void;
}

// Pastel digit colors per adjacent-bomb count
const NUMBER_COLORS: Record<number, string> = {
  1: 'text-sky-400',
  2: 'text-emerald-400',
  3: 'text-orange-300',
  4: 'text-purple-400',
};
const NUMBER_COLOR_MANY = 'text-primary';

function numberColor(adjacent: number): string {
  return NUMBER_COLORS[adjacent] ?? NUMBER_COLOR_MANY;
}

export default function MinesweeperGrid({
  view,
  myTurn,
  onReveal,
  onToggleFlag,
}: MinesweeperGridProps) {
  const gameOver = view.winner != null;
  const interactive = myTurn && !gameOver;

  const handleReveal = (row: number, col: number) => {
    if (!interactive) return;
    const cell = view.cells[row]?.[col];
    if (!cell || cell.state !== 'hidden') return;
    onReveal(row, col);
  };

  const handleToggleFlag = (
    row: number,
    col: number,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    e.preventDefault();
    if (!interactive) return;
    const cell = view.cells[row]?.[col];
    if (!cell || cell.state === 'revealed') return;
    onToggleFlag(row, col);
  };

  return (
    <div className="inline-block p-2 md:p-3 bg-cute-bg rounded-2xl shadow-soft">
      {view.cells.map((rowCells, row) => (
        <div key={row} className="flex">
          {rowCells.map((cell, col) => {
            // Boom cell (the one clicked) — server sends exploded flag
            const isBoom = cell.exploded === true;
            // Revealed safe cell with neighbors shows its digit
            const showDigit =
              !isBoom && cell.state === 'revealed' && cell.adjacent > 0;
            const hidden = cell.state === 'hidden';
            const flagged = cell.state === 'flagged';
            return (
              <button
                key={col}
                onClick={() => handleReveal(row, col)}
                onContextMenu={(e) => handleToggleFlag(row, col, e)}
                disabled={!interactive}
                aria-label={`Kotak baris ${row + 1} kolom ${col + 1}`}
                className={`w-8 h-8 md:w-10 md:h-10 flex items-center justify-center text-sm md:text-base font-bold rounded transition-colors duration-100 ${
                  flagged
                    ? 'bg-pink-200'
                    : hidden
                      ? interactive
                        ? 'bg-pink-100 hover:bg-pink-200 cursor-pointer'
                        : 'bg-pink-100 cursor-not-allowed'
                      : 'bg-white cursor-default'
                }`}
              >
                {isBoom ? (
                  <span>💥</span>
                ) : flagged ? (
                  <span>🚩</span>
                ) : showDigit ? (
                  <span className={numberColor(cell.adjacent)}>{cell.adjacent}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
