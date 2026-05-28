-- VSG Flow Tracker — Supabase schema
-- Run this in the Supabase SQL Editor for your project.
-- Safe to re-run (uses CREATE TABLE IF NOT EXISTS).

-- ── Campaigns ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  owner       text,
  status      text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'complete', 'archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Stages ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name            text NOT NULL,
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'wait')),
  order_index     int  NOT NULL DEFAULT 0,
  started_at      timestamptz,
  ended_at        timestamptz,
  touch_time_min  int,   -- manual duration override (minutes)
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stages_campaign_id_idx ON stages (campaign_id);

-- ── Phase Templates ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phase_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  stages      jsonb NOT NULL DEFAULT '[]',  -- [{name, status, order_index}]
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── ClickUp sync columns (added for ClickUp integration) ─────
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS clickup_id text;
ALTER TABLE stages    ADD COLUMN IF NOT EXISTS clickup_id text;

-- ── RLS (permissive for internal tool — tighten if going multi-tenant) ──
ALTER TABLE campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_templates ENABLE ROW LEVEL SECURITY;

-- Allow all operations via the anon key (internal tool, no auth required)
CREATE POLICY "open_campaigns"       ON campaigns       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_stages"          ON stages          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_phase_templates" ON phase_templates FOR ALL USING (true) WITH CHECK (true);

-- ── Sample data (optional — delete if you want a clean slate) ──
-- INSERT INTO campaigns (name, owner, description, status) VALUES
--   ('Reddy Ice Summer Push', 'Jane Smith', 'Q3 retail campaign', 'active'),
--   ('National Sales Launch', 'Tom R.', 'New market rollout', 'complete');
