'use client';

import { motion } from 'framer-motion';
import CreateRoom from '@/components/lobby/CreateRoom';
import JoinRoom from '@/components/lobby/JoinRoom';
import Card from '@/components/ui/Card';
import { useSocket } from '@/hooks/useSocket';
import { useRoom } from '@/hooks/useRoom';

export default function HomePage() {
  const { socket } = useSocket();
  const { createRoom, joinRoom, error, submitting } = useRoom(socket);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="text-center mb-10"
      >
        <h1 className="text-5xl md:text-7xl font-bold text-primary mb-2">
          🎮 GameVille
        </h1>
        <p className="text-lg text-cute-muted">Main bareng teman, seru bareng!</p>
      </motion.div>

      <div className="flex flex-col md:flex-row gap-6 w-full max-w-2xl">
        <Card title="🆕 Buat Ruang Baru">
          <CreateRoom onCreate={createRoom} error={error} submitting={submitting} />
        </Card>

        <Card title="🔗 Masuk Ruang">
          <JoinRoom onJoin={joinRoom} error={error} submitting={submitting} initialPin="" />
        </Card>
      </div>
    </main>
  );
}
