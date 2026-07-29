'use client';

interface GridProps {
  grid: string[][];
  isOwn: boolean;
  showShips: boolean;
  onCellClick?: (row: number, col: number) => void;
  lastShot?: { row: number; col: number } | null;
  disabled?: boolean;
}

export default function Grid({ grid, isOwn, showShips, onCellClick, lastShot, disabled }: GridProps) {
  const cellColor = (val: string, r: number, c: number) => {
    if (val === 'S' && showShips) return 'bg-accent';
    if (val === 'H') return 'bg-red-400';
    if (val === 'M') return 'bg-gray-200';
    if (lastShot?.row === r && lastShot?.col === c) return 'ring-2 ring-primary';
    return 'bg-white hover:bg-pink-50';
  };

  const cellIcon = (val: string) => {
    if (val === 'H') return '🔥';
    if (val === 'M') return '💨';
    if (val === 'S' && showShips) return '🚳️';
    return '';
  };

  const columnLabels = 'ABCDEFGHIJ'.split('');

  return (
    <div className="inline-block border-2 border-gray-200 rounded-cute overflow-hidden">
      {/* Column headers */}
      <div className="flex">
        <div className="w-8 h-8 flex items-center justify-center text-xs font-bold text-cute-muted" />
        {columnLabels.map((l, i) => (
          <div
            key={i}
            className="w-8 h-8 flex items-center justify-center text-xs font-bold text-cute-muted"
          >
            {l}
          </div>
        ))}
      </div>
      {grid.map((row, r) => (
        <div key={r} className="flex">
          <div className="w-8 h-8 flex items-center justify-center text-xs font-bold text-cute-muted">
            {r + 1}
          </div>
          {row.map((cell, c) => (
            <button
              key={c}
              onClick={() => onCellClick?.(r, c)}
              disabled={disabled || (!isOwn && (cell === 'H' || cell === 'M'))}
              className={`w-8 h-8 border border-gray-100 flex items-center justify-center text-xs transition-all
                ${cellColor(cell, r, c)}
                ${disabled || !onCellClick ? '' : 'cursor-pointer hover:scale-110'}
                ${!disabled && onCellClick ? 'hover:shadow-soft' : ''}
              `}
            >
              {cellIcon(cell)}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
