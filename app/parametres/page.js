import { supabase } from '@/lib/supabase'
import ParamClient from './ParamClient'

export default async function Parametres() {
  const { data } = await supabase.from('parametres').select('*').single()

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

  return <ParamClient params={params} />
}