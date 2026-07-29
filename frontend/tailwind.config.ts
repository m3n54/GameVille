import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: '#FF9BB5',
        secondary: '#A8D8EA',
        accent: '#FFD3B6',
        success: '#B5EAD7',
        warning: '#FFDAC1',
        cute: { bg: '#FFF5F7', surface: '#FFFFFF', text: '#4A4A4A', muted: '#9CA3AF' },
      },
      borderRadius: { cute: '16px', button: '24px' },
      fontFamily: { sans: ['Nunito', 'sans-serif'] },
      boxShadow: { soft: '0 4px 14px rgba(0,0,0,0.08)' },
    },
  },
  plugins: [],
};
export default config;
