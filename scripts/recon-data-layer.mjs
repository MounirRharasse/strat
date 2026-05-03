// Reconnaissance data layer (lecture seule, idempotent).
// Exécute les 5 queries Q1-Q5 demandées pour préparer la Phase A migration.
//
// Usage :
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/recon-data-layer.mjs
//
// AUCUNE écriture. AUCUNE modif schéma.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as pathResolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = pathResolve(__dirname, '..')

const envPath = pathResolve(projectRoot, '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const KROUSTY = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'
const { supabase } = await import('../lib/supabase.js')

const out = {}

// ─── Q1 — Couverture historique_ca ───────────────────────────────────
{
  const { data, error } = await supabase
    .from('historique_ca')
    .select('date')
    .eq('parametre_id', KROUSTY)
  if (error) {
    out.Q1 = { error: error.message }
  } else {
    const dates = (data || []).map(r => r.date).sort()
    const distincts = new Set(dates)
    out.Q1 = {
      date_min: dates[0] || null,
      date_max: dates[dates.length - 1] || null,
      nb_lignes: dates.length,
      nb_jours_distincts: distincts.size,
    }
  }
}

// ─── Q2 — Couverture entrees Uber ────────────────────────────────────
// La query d'origine teste `uber_eats IS NOT NULL`. On fait une détection adaptive :
// (a) si la colonne `uber_eats` existe sur `entrees`, on l'utilise.
// (b) sinon, fallback sur le filtre `source='uber_eats'` + `montant_ttc>0`.
{
  // Détecte les colonnes via 1 sample
  const { data: sample, error: errSample } = await supabase
    .from('entrees').select('*').eq('parametre_id', KROUSTY).limit(1)
  if (errSample) {
    out.Q2 = { error: errSample.message }
  } else {
    const cols = sample && sample[0] ? Object.keys(sample[0]) : []
    const aColUberEats = cols.includes('uber_eats')

    if (aColUberEats) {
      const { data, error } = await supabase
        .from('entrees').select('date, uber_eats').eq('parametre_id', KROUSTY)
      if (error) {
        out.Q2 = { error: error.message }
      } else {
        const dates = (data || []).map(r => r.date).sort()
        const avecUber = (data || []).filter(r => r.uber_eats !== null && r.uber_eats > 0)
        out.Q2 = {
          mode: 'col uber_eats',
          date_min: dates[0] || null,
          date_max: dates[dates.length - 1] || null,
          nb_lignes: dates.length,
          nb_jours_avec_uber: avecUber.length,
        }
      }
    } else {
      const { data, error } = await supabase
        .from('entrees').select('date, source, montant_ttc').eq('parametre_id', KROUSTY)
      if (error) {
        out.Q2 = { error: error.message }
      } else {
        const dates = (data || []).map(r => r.date).sort()
        const avecUber = (data || []).filter(r => r.source === 'uber_eats' && (r.montant_ttc || 0) > 0)
        out.Q2 = {
          mode: 'fallback source=uber_eats (colonne uber_eats absente)',
          date_min: dates[0] || null,
          date_max: dates[dates.length - 1] || null,
          nb_lignes: dates.length,
          nb_jours_avec_uber: avecUber.length,
          colonnes_entrees: cols,
        }
      }
    }
  }
}

// ─── Q3 — Schéma historique_ca ───────────────────────────────────────
// Sans accès direct à information_schema via JS client : on échantillonne 1 row
// et on liste les colonnes (les types SQL exacts ne sont pas accessibles).
{
  const { data, error } = await supabase
    .from('historique_ca').select('*').eq('parametre_id', KROUSTY).limit(1)
  if (error) {
    out.Q3 = { error: error.message }
  } else if (!data || data.length === 0) {
    out.Q3 = { warning: 'Aucune row pour Krousty', colonnes: [] }
  } else {
    const row = data[0]
    out.Q3 = {
      note: "via JS client : noms de colonnes uniquement (pas de data_type SQL)",
      colonnes: Object.keys(row).map(c => ({
        column_name: c,
        js_type: row[c] === null ? 'null' : typeof row[c],
        sample_value: row[c],
      })),
      a_nb_commandes: 'nb_commandes' in row,
    }
  }
}

// ─── Q4 — Échantillon Uber dans entrees ──────────────────────────────
{
  const colsEntrees = out.Q2?.colonnes_entrees || null
  const aColUberEats = out.Q2?.mode === 'col uber_eats'

  if (aColUberEats) {
    const { data, error } = await supabase
      .from('entrees').select('date, uber_eats')
      .eq('parametre_id', KROUSTY).gt('uber_eats', 0)
      .order('date', { ascending: true }).limit(5)
    out.Q4 = error ? { error: error.message } : { mode: 'col uber_eats', rows: data }
  } else {
    const { data, error } = await supabase
      .from('entrees').select('date, source, montant_ttc, montant_ht, nb_commandes')
      .eq('parametre_id', KROUSTY).eq('source', 'uber_eats').gt('montant_ttc', 0)
      .order('date', { ascending: true }).limit(5)
    out.Q4 = error
      ? { error: error.message }
      : { mode: 'fallback source=uber_eats', rows: data }
  }
}

// ─── Q5 — Gap analysis ───────────────────────────────────────────────
{
  if (!out.Q1?.date_min || !out.Q1?.date_max) {
    out.Q5 = { error: 'pas de bornes pour calculer les trous' }
  } else {
    const dmin = new Date(out.Q1.date_min + 'T00:00:00Z')
    const dmax = new Date(out.Q1.date_max + 'T00:00:00Z')
    const { data } = await supabase
      .from('historique_ca').select('date').eq('parametre_id', KROUSTY)
    const presents = new Set((data || []).map(r => r.date))
    let manquants = 0
    const liste = []
    for (let d = new Date(dmin); d <= dmax; d.setUTCDate(d.getUTCDate() + 1)) {
      const ymd = d.toISOString().slice(0, 10)
      if (!presents.has(ymd)) { manquants++; if (liste.length < 20) liste.push(ymd) }
    }
    out.Q5 = {
      borne_min: out.Q1.date_min,
      borne_max: out.Q1.date_max,
      jours_manquants: manquants,
      premiers_manquants: liste,
    }
  }
}

console.log(JSON.stringify(out, null, 2))
process.exit(0)
