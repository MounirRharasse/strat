'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function NavBar() {
  const pathname = usePathname()

  const tabs = [
    {
      href: '/dashboard',
      label: 'Business',
      icon: (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5"/>
          <rect x="12" y="3" width="7" height="7" rx="1.5"/>
          <rect x="3" y="12" width="7" height="7" rx="1.5"/>
          <rect x="12" y="12" width="7" height="7" rx="1.5"/>
        </svg>
      )
    },
    {
      href: '/pl',
      label: 'P&L',
      icon: (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M3 18 L3 9 L8 13 L12 7 L17 11"/>
          <line x1="1" y1="18" x2="21" y2="18"/>
        </svg>
      )
    },
    {
      href: '/analyses',
      label: 'Analyses',
      icon: (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <polyline points="2,16 7,9 11,13 15,7 20,11"/>
          <line x1="1" y1="19" x2="21" y2="19"/>
        </svg>
      )
    },
    {
      href: '/previsions',
      label: 'Prévisions',
      icon: (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="11" cy="11" r="8"/>
          <polyline points="11,6 11,11 14,13"/>
        </svg>
      )
    },
    {
      href: '/parametres',
      label: 'Paramètres',
      icon: (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="11" cy="11" r="3"/>
          <path d="M11 3v2M11 17v2M3 11h2M17 11h2M5.6 5.6l1.4 1.4M15 15l1.4 1.4M5.6 16.4l1.4-1.4M15 7l1.4-1.4"/>
        </svg>
      )
    }
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-950 border-t border-gray-800 flex max-w-md mx-auto">
      {tabs.map(tab => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
              active ? 'text-white' : 'text-gray-600'
            }`}
          >
            {tab.icon}
            <span className={`text-xs ${active ? 'font-semibold' : ''}`}>{tab.label}</span>
          </Link>
        )
      })}
    </div>
  )
}