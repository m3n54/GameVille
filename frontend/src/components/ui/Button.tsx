'use client';

import { motion } from 'framer-motion';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
}

export default function Button({
  children, onClick, variant = 'primary', size = 'md',
  disabled = false, className = '',
}: ButtonProps) {
  const base = 'font-bold rounded-button transition-all duration-200 inline-flex items-center justify-center';
  const variants = {
    primary: 'bg-primary text-white hover:bg-pink-400 active:bg-pink-500',
    secondary: 'bg-secondary text-white hover:bg-blue-300 active:bg-blue-400',
    ghost: 'bg-transparent text-cute-text hover:bg-pink-50',
  };
  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.05 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${sizes[size]} ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer shadow-soft'
      } ${className}`}
    >
      {children}
    </motion.button>
  );
}
