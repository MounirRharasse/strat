import Link from 'next/link'

export default function AdminLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col fixed h-full">
        <div className="p-6 border-b border-gray-800">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Strat</p>
          <p className="text-lg font-bold">Backoffice</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {[
            { href: '/admin', label: 'Vue générale', icon: '◉' },
            { href: '/admin/clients', label: 'Clients', icon: '🏪' },
            { href: '/admin/imports', label: 'Imports données', icon: '📥' },
            { href: '/admin/monitoring', label: 'Monitoring', icon: '📡' },
            { href: '/admin/donnees', label: 'Données', icon: '🗄️' },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition">
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <Link href="/dashboard" className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition">
            ← Retour à Strat
          </Link>
        </div>
      </div>

      {/* Main content */}
      <div className="ml-64 flex-1 p-8">
        {children}
      </div>
    </div>
  )
}