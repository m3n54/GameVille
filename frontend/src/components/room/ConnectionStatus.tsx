'use client';

import { AnimatePresence, motion } from 'framer-motion';

// FE-F2: websocket drops used to orphan the client silently — the page kept
// rendering a dead room. This banner makes the gap visible.
export default function ConnectionStatus({ reconnecting }: { reconnecting: boolean }) {
  return (
    <AnimatePresence>
      {reconnecting && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="sticky top-0 z-50 bg-accent text-cute-text text-center text-sm font-bold py-2 shadow-soft"
          role="status"
        >
          📡 Koneksi terputus — menyambung ulang...
        </motion.div>
      )}
    </AnimatePresence>
  );
}
