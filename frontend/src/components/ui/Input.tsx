'use client';

interface InputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  autoFocus?: boolean;
}

export default function Input({
  value, onChange, placeholder, maxLength, className = '', autoFocus,
}: InputProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      autoFocus={autoFocus}
      className={`w-full px-4 py-3 bg-white border-2 border-pink-200 rounded-cute text-cute-text
        placeholder:text-cute-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-pink-200
        transition-all duration-200 ${className}`}
    />
  );
}
