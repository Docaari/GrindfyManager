-- Sprint Grind-Live Break Auto-Open (clock-aligned BRT) — RF-06.
-- Spec: Docs/specs/grind-live-break-auto-open.md
-- ADR-124: 124-break-auto-open-clock-aligned-brt.md
--
-- Adiciona toggle persistente do auto-open do BreakFeedbackPopup. Default true
-- para todos (back-fill nativo via DB DEFAULT). Usuario opta-out via toggle no
-- header /grind-live ou via "Pular Todos os Breaks Hoje" dentro do popup.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS break_auto_open_enabled BOOLEAN NOT NULL DEFAULT true;
