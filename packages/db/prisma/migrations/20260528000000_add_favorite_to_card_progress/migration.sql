-- Adds a per-(user, card) "favorite" flag. Independent of difficultyLevel /
-- advancedDifficultyLevel: toggling favorite never affects the user's rating
-- and vice-versa.
--
-- Defaults to false so every existing CardProgress row is "not favorited"
-- after the migration. Cards the user has never rated still have no
-- CardProgress row at all — favoriting one of those cards inserts a new row
-- with `favorite = true` and `difficultyLevel = NULL`, which the practice /
-- list APIs already tolerate.
--
-- NOT NULL is safe because of the default; no backfill statement is needed.

ALTER TABLE "CardProgress" ADD COLUMN "favorite" BOOLEAN NOT NULL DEFAULT false;

-- No new index: the existing CardProgress_userId_idx already scopes lookups
-- to one user, and the Play modal's filter is applied client-side after the
-- per-user card list is fetched. If we ever push the filter server-side and
-- the table grows large we can revisit with a partial index on (userId)
-- WHERE favorite = true.
