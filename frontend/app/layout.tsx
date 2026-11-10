import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RPG · Validação de autenticação',
  description: 'Interface de validação de autenticação e perfil RPG.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
