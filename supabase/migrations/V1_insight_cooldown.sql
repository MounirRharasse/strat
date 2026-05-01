-- Sprint IA Phase 1 commit 5 — Cooldown global insight quotidien.
-- Cf. ia_signaux + lib/ia/insight-detection.js
--
-- Une fois un signal retenu, on n'en émet plus tant que la fenêtre
-- de N jours n'est pas écoulée (tous types confondus).
-- N par défaut = 2 (1 insight tous les 3 jours minimum).

ALTER TABLE parametres
  ADD COLUMN IF NOT EXISTS insight_cooldown_jours integer NOT NULL DEFAULT 2;
