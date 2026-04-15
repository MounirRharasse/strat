import { Inter } from 'next/font/google'
import './globals.css'
import NavBar from '@/components/NavBar'
import FAB from '@/components/FAB'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Strat.',
  description: 'Ton cockpit business',
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        {children}
        <FAB />
        <NavBar />
      </body>
    </html>
  )
}