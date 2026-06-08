import type { Metadata } from 'next';
import { SocketProvider } from '@/context/socket-provider';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'CodePulse',
    template: '%s | CodePulse',
  },
  description: 'Real-time collaborative code review platform',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SocketProvider>{children}</SocketProvider>
      </body>
    </html>
  );
}
