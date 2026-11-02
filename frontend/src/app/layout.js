import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
export const metadata = { title: 'Dispatch | Disaster Relief Management', description: 'Disaster relief coordination and resource management platform.' };
export default function RootLayout({ children }) { return <html lang="en"><body><AuthProvider>{children}</AuthProvider></body></html>; }
