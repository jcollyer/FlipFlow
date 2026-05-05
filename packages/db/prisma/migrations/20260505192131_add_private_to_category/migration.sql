-- Add a `private` flag to Category. Defaults to true so new decks
-- aren't accidentally exposed; existing rows are backfilled to true
-- by the DEFAULT, matching the new default for created-from-now-on
-- decks. The UI exposes this as a "Deck public" toggle (off by
-- default → private = true).
ALTER TABLE "Category" ADD COLUMN "private" BOOLEAN NOT NULL DEFAULT true;
