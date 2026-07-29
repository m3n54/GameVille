'use client';

interface HangmanDrawingProps {
  attemptsLeft: number;
  maxAttempts: number;
}

export default function HangmanDrawing({ attemptsLeft, maxAttempts }: HangmanDrawingProps) {
  const wrongCount = maxAttempts - attemptsLeft;

  return (
    <svg viewBox="0 0 200 250" className="w-48 h-60" aria-label="Hangman drawing">
      {/* Gallows — always visible */}
      <line x1="20" y1="230" x2="180" y2="230" stroke="#4A4A4A" strokeWidth="4" strokeLinecap="round" />
      <line x1="60" y1="230" x2="60" y2="20" stroke="#4A4A4A" strokeWidth="4" strokeLinecap="round" />
      <line x1="55" y1="20" x2="140" y2="20" stroke="#4A4A4A" strokeWidth="4" strokeLinecap="round" />
      <line x1="140" y1="20" x2="140" y2="50" stroke="#4A4A4A" strokeWidth="4" strokeLinecap="round" />

      {/* Stage 1 — Head */}
      {wrongCount >= 1 && (
        <circle cx="140" cy="70" r="20" fill="none" stroke="#4A4A4A" strokeWidth="4" />
      )}

      {/* Stage 2 — Body */}
      {wrongCount >= 2 && (
        <line x1="140" y1="90" x2="140" y2="150" stroke="#4A4A4A" strokeWidth="4" strokeLinecap="round" />
      )}

      {/* Stage 3 — Left arm */}
      {wrongCount >= 3 && (
        <line x1="140" y1="105" x2="110" y2="130" stroke="#4A4A4A" strokeWidth="4" strokeLinecap="round" />
      )}

      {/* Stage 4 — Right arm */}
      {wrongCount >= 4 && (
        <line x1="140" y1="105" x2="170" y2="130" stroke="#4A4A4A" strokeWidth="4" strokeLinecap="round" />
      )}

      {/* Stage 5 — Left leg */}
      {wrongCount >= 5 && (
        <line x1="140" y1="150" x2="110" y2="190" stroke="#4A4A4A" strokeWidth="4" strokeLinecap="round" />
      )}

      {/* Stage 6 — Right leg — game over */}
      {wrongCount >= 6 && (
        <line x1="140" y1="150" x2="170" y2="190" stroke="#4A4A4A" strokeWidth="4" strokeLinecap="round" />
      )}
    </svg>
  );
}
