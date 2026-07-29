'use client';

import { motion } from 'framer-motion';

interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export default function Card({ title, children, className = '' }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 150, damping: 15 }}
      className={`bg-white rounded-cute shadow-soft p-6 flex-1 ${className}`}
    >
      {title && (
        <h2 className="text-xl font-bold text-cute-text mb-4">{title}</h2>
      )}
      {children}
    </motion.div>
  );
}
