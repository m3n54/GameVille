'use client';

import { AnimatePresence, motion } from 'framer-motion';

// F7: room:error used to be handled twice — a blocking native alert() in
// useRoom plus per-container inline banners. One banner, one source of truth.
export default function GameErrorBanner({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="flex items-center justify-between gap-3 max-w-2xl mx-auto bg-red-100 text-red-600 rounded-xl px-4 py-2 text-sm font-bold shadow-soft"
          role="alert"
        >
          <span>⚠️ {message}</span>
          <button
            onClick={onDismiss}
            aria-label="Tutup pesan error"
            className="text-red-400 hover:text-red-600 font-bold"
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
