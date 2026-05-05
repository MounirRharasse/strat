// Cron mensuel — Charges Récurrentes V1.1 Lot 8.
// Génère les charges_suggestions du mois courant pour chaque tenant actif.
//
// Cadence : 1er de chaque mois à 03:00 UTC (vercel.json "0 3 1 * *").
// Tourne après cron nightly (02:30 UTC) pour avoir les données du dernier
// jour M-1 disponibles si besoin.
//
// Limitations V1.1 (cf. STRAT_CADRAGE.md §6.5) :
// - Mensuel uniquement. Trimestriel/semestriel/annuel reportés V1.2 (nécessite
//   logique de planning des échéances : date du dernier paiement, mois cible).
// - DSL formule non évalué. Pour variable_recurrente avec formule_calcul,
//   fallback sur montant_attendu. Si null, charge skipped + warning dans logs.
// - Détection oublis reportée Lot 10 (brief lundi).
//
// Idempotence : UNIQUE(charge_recurrente_id, mois) sur charges_suggestions.
// Re-run = no-op (UPSERT mais avec WHERE statut='pending' on n'écrase pas
// les validated/ignored/expired).

import { supabase } from '@/lib/supabase'

export async function GET(request) {
  // Auth Bearer (pattern cron nightly existant)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return await runCron()
}

// Export pour test ad-hoc (bypass auth, appel direct).
export async function runCron() {
  const today = new Date().toISOString().slice(0, 10)
  const moisCourant = today.slice(0, 7)
  const [yearStr, monthStr] = moisCourant.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const lastDayOfMonth = new Date(year, month, 0).getDate()

  const result = {
    mois: moisCourant,
    today,
    tenants: [],
    summary: { nb_tenants: 0, nb_suggestions_crees: 0, nb_suggestions_skipped: 0, nb_oublis_detectes: 0 },
  }

  // Boucle tenants actifs
  const { data: tenants, error: tErr } = await supabase
    .from('parametres')
    .select('id, slug, nom_restaurant')
    .eq('actif', true)
  if (tErr) {
    return Response.json({ error: `parametres : ${tErr.message}` }, { status: 500 })
  }

  for (const t of (tenants || [])) {
    try {
      const tenantResult = await processTenant(t.id, moisCourant, lastDayOfMonth, today)
      // Détection oublis post-génération (Lot 10) : suggestions pending depuis +5j
      const oublis = await detecterOublis(t.id, today)
      tenantResult.nb_oublis = oublis.length
      if (oublis.length > 0) {
        await ecrireSignalOubli(t.id, today, oublis)
      }
      result.tenants.push({ tenant_id: t.id, slug: t.slug, ...tenantResult })
      result.summary.nb_suggestions_crees += tenantResult.nb_suggestions_crees
      result.summary.nb_suggestions_skipped += tenantResult.nb_suggestions_skipped
      result.summary.nb_oublis_detectes += oublis.length
    } catch (e) {
      // Un tenant qui plante ne doit pas arrêter les autres (pattern nightly)
      result.tenants.push({ tenant_id: t.id, slug: t.slug, error: String(e) })
    }
  }
  result.summary.nb_tenants = result.tenants.length

  return Response.json(result)
}

async function processTenant(parametreId, moisCourant, lastDayOfMonth, today) {
  const result = {
    nb_suggestions_crees: 0,
    nb_suggestions_skipped: 0,
    skipped_reasons: [],
  }

  // Fetch charges actives mensuelles (V1.1 only mensuel)
  const { data: charges, error: cErr } = await supabase
    .from('charges_recurrentes')
    .select('*')
    .eq('parametre_id', parametreId)
    .eq('actif', true)
    .eq('frequence', 'mensuel')
  if (cErr) throw new Error(`charges_recurrentes : ${cErr.message}`)

  for (const c of (charges || [])) {
    // Skip si pause active sur ce mois
    if (c.pause_jusqu_au && c.pause_jusqu_au > today) {
      result.nb_suggestions_skipped++
      result.skipped_reasons.push(`${c.libelle_personnalise} : en pause jusqu'au ${c.pause_jusqu_au}`)
      continue
    }

    // date_attendue = mois_courant + jour_du_mois (clamp pour février si jour=28+)
    const jour = Math.min(c.jour_du_mois, lastDayOfMonth)
    const dateAttendue = `${moisCourant}-${String(jour).padStart(2, '0')}`

    // Calcul montant_suggere selon profil
    let montantSuggere = null
    let formuleEvaluee = null

    if (c.profil === 'fixe' && c.montant_attendu != null) {
      montantSuggere = Number(c.montant_attendu)
    } else if (c.profil === 'variable_recurrente') {
      if (c.formule_calcul) {
        // V1.1 limitation : DSL non implémenté. Fallback sur montant_attendu (snapshot).
        formuleEvaluee = `[V1.2 DSL non implémenté] formule="${c.formule_calcul}" → fallback montant_attendu`
        montantSuggere = c.montant_attendu != null ? Number(c.montant_attendu) : null
      } else {
        // variable sans formule = montant manuel à override mensuellement
        montantSuggere = c.montant_attendu != null ? Number(c.montant_attendu) : null
      }
    } else if (c.profil === 'one_shot') {
      // one_shot : pas de génération récurrente. Skip.
      result.nb_suggestions_skipped++
      result.skipped_reasons.push(`${c.libelle_personnalise} : profil=one_shot, pas de cron`)
      continue
    }

    if (montantSuggere == null || isNaN(montantSuggere)) {
      result.nb_suggestions_skipped++
      result.skipped_reasons.push(`${c.libelle_personnalise} : montant_suggere null (profil=${c.profil}, formule=${c.formule_calcul || 'null'})`)
      continue
    }

    // Pré-check : si suggestion existe déjà pour (charge, mois), ne pas écraser
    // une éventuelle validation/ignore/expiration. Ne ré-écrit que si statut='pending'.
    const { data: existante, error: eErr } = await supabase
      .from('charges_suggestions')
      .select('id, statut, montant_suggere')
      .eq('parametre_id', parametreId)
      .eq('charge_recurrente_id', c.id)
      .eq('mois', moisCourant)
      .maybeSingle()
    if (eErr) {
      result.nb_suggestions_skipped++
      result.skipped_reasons.push(`${c.libelle_personnalise} : SELECT pré-check erreur ${eErr.message}`)
      continue
    }

    if (existante && existante.statut !== 'pending') {
      // Déjà traitée (validated/ignored/modified/expired). Ne pas régénérer.
      result.nb_suggestions_skipped++
      result.skipped_reasons.push(`${c.libelle_personnalise} : déjà ${existante.statut} pour ${moisCourant}, skip`)
      continue
    }

    if (existante && existante.statut === 'pending') {
      // Update bénin du montant si formule re-évaluée différemment (V1.2 DSL).
      // En V1.1 sans DSL le montant ne change pas pour les fixe — UPDATE no-op safe.
      const { error: uErr } = await supabase
        .from('charges_suggestions')
        .update({
          date_attendue: dateAttendue,
          montant_suggere: montantSuggere,
          fournisseur_suggere: c.fournisseur_nom_attendu,
          formule_evaluee: formuleEvaluee,
        })
        .eq('id', existante.id)
        .eq('parametre_id', parametreId)
      if (uErr) {
        result.nb_suggestions_skipped++
        result.skipped_reasons.push(`${c.libelle_personnalise} : UPDATE pending erreur ${uErr.message}`)
        continue
      }
      result.nb_suggestions_crees++  // compté comme créé/raffraîchi (sémantique idempotente)
      continue
    }

    // INSERT nouvelle suggestion
    const { error: iErr } = await supabase
      .from('charges_suggestions')
      .insert({
        parametre_id: parametreId,
        charge_recurrente_id: c.id,
        mois: moisCourant,
        date_attendue: dateAttendue,
        montant_suggere: montantSuggere,
        fournisseur_suggere: c.fournisseur_nom_attendu,
        formule_evaluee: formuleEvaluee,
        statut: 'pending',
      })
    if (iErr) {
      result.nb_suggestions_skipped++
      result.skipped_reasons.push(`${c.libelle_personnalise} : INSERT erreur ${iErr.message}`)
      continue
    }
    result.nb_suggestions_crees++
  }

  return result
}

// ─── Détection oublis (Lot 10) ──────────────────────────────────────
// Suggestions pending dont date_attendue + 5 jours < today.
// Inclut les suggestions du mois courant ET des mois précédents non validées.
async function detecterOublis(parametreId, today) {
  const seuilDate = new Date(today + 'T00:00:00Z')
  seuilDate.setUTCDate(seuilDate.getUTCDate() - 5)
  const seuilISO = seuilDate.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('charges_suggestions')
    .select('id, mois, date_attendue, montant_suggere, fournisseur_suggere, charge_recurrente_id, charges_recurrentes(libelle_personnalise)')
    .eq('parametre_id', parametreId)
    .eq('statut', 'pending')
    .lte('date_attendue', seuilISO)
    .order('date_attendue', { ascending: true })
  if (error) return []
  return (data || []).map(o => ({
    suggestion_id: o.id,
    charge_recurrente_id: o.charge_recurrente_id,
    libelle: o.charges_recurrentes?.libelle_personnalise || 'Charge inconnue',
    mois: o.mois,
    date_attendue: o.date_attendue,
    montant_suggere: Number(o.montant_suggere),
    fournisseur_suggere: o.fournisseur_suggere,
    jours_de_retard: Math.floor((new Date(today + 'T00:00:00Z') - new Date(o.date_attendue + 'T00:00:00Z')) / 86400000),
  }))
}

// Écrit un signal ia_signaux 'charge_oubliee' (UPSERT pour gérer le re-run même jour).
// UNIQUE(parametre_id, date_detection) sur ia_signaux : 1 signal/jour/tenant max.
// On embarque tous les oublis dans le contexte (jsonb).
async function ecrireSignalOubli(parametreId, today, oublis) {
  const totalMontant = oublis.reduce((s, o) => s + (o.montant_suggere || 0), 0)
  // tier T1=critique, T2=important, T3=normal, T4=info. >5 oublis ou >5000€ = T2, sinon T3.
  const tier = (oublis.length > 5 || totalMontant > 5000) ? 'T2' : 'T3'

  const { error } = await supabase
    .from('ia_signaux')
    .upsert({
      parametre_id: parametreId,
      date_detection: today,
      type_trigger: 'charge_oubliee',
      tier,
      magnitude: oublis.length,
      contexte: {
        nb_oublis: oublis.length,
        total_montant_ttc: Math.round(totalMontant * 100) / 100,
        oublis: oublis.slice(0, 20),  // cap pour éviter jsonb géant
      },
      traite_par_ia: false,
    }, { onConflict: 'parametre_id,date_detection' })
  if (error) {
    console.warn(`[cron charges] signal oubli tenant ${parametreId} : ${error.message}`)
  }
}
