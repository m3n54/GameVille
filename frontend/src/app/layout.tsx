import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import '../styles/globals.css';

const nunito = Nunito({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'GameVille — Main Bareng Teman!',
  description: 'Platform multiplayer game seru buat main bareng teman',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className={nunito.className}>{children}</body>
    </html>
  );
}
