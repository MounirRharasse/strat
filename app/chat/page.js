// Sprint IA Phase 1 commit 10 — Page Chat conversationnel.
//
// Server Component minimal : auth + render ChatClient.
// Toute la logique conversationnelle est côté client (SSE).

import { redirect } from 'next/navigation'
import { getParametreIdFromSession } from '@/lib/auth'
import ChatClient from './ChatClient'

export default async function ChatPage() {
  try {
    await getParametreIdFromSession()
  } catch {
    redirect('/login')
  }
  return <ChatClient />
}
