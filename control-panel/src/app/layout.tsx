import './globals.css';
import { Providers } from './providers';

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
        <html lang="en" className="dark">
            <body className="font-sans text-foreground bg-background min-h-screen antialiased">
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
