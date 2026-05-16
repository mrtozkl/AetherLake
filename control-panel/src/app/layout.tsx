import './globals.css';
import { Inter } from 'next/font/google';
import clsx from 'clsx';
import { Providers } from './providers';

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
    display: 'swap',
});

export const metadata = {
    title: 'AetherLake — Data Platform Control Panel',
    description: 'Enterprise control panel for the open-source Data Lakehouse on Kubernetes.',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={clsx(inter.variable, 'dark')}>
            <body className="font-sans text-foreground bg-background min-h-screen antialiased">
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
