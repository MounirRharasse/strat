import { supabase } from '@/lib/supabase'
import ClientDetail from './ClientDetail'

export default async function GererClient({ params }) {
  const { data: client } = await supabase.from('parametres').select('*').eq('id', params.id).single()
  if (!client) return <div className="text-gray-400">Client introuvable</div>
  return <ClientDetail client={client} />
}