-- NOVA Fishing — schéma initial.
-- Exécuté dans le schéma dédié (nova_fishing par défaut) : aucune table de NovaBot n'est touchée.

CREATE TABLE players (
  id          uuid PRIMARY KEY,
  discord_id  text NOT NULL UNIQUE,
  name        text NOT NULL,
  avatar      text,
  save        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,
  player_id   uuid NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- Module de récompenses (future passerelle vers NovaBot). Rien n'est envoyé au bot pour l'instant.
CREATE TABLE reward_events (
  id           uuid PRIMARY KEY,
  discord_id   text NOT NULL,
  reward_key   text NOT NULL,
  type         text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  sync_status  text NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  synced_at    timestamptz,
  UNIQUE (discord_id, reward_key)
);
CREATE INDEX reward_events_status_idx ON reward_events (sync_status, created_at);
