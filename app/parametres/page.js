import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ParamClient from './ParamClient'

export default async function Parametres() {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    redirect('/login')
  }

  const [{ data }, { data: inventaires }] = await Promise.all([
    supabase.from('parametres').select('*').eq('id', parametre_id).single(),
    supabase.from('inventaires').select('*').eq('parametre_id', parametre_id).order('date', { ascending: false })
  ])

  const params = data || {
    nom_restaurant: 'Krousty Sabaidi Montpellier Castelnau',
    type_restaurant: 'franchise',
    objectif_ca: 45000,
    objectif_food_cost: 30,
    objectif_staff_cost: 32,
    objectif_marge: 20,
    alerte_food_cost_max: 32,
    alerte_ticket_min: 14.5,
    frequence_inventaire: 'mensuel'
  }

  return <ParamClient params={params} inventaires={inventaires || []} />
}