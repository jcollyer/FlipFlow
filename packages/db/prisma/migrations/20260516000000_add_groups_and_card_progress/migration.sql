-- Groups + per-user card progress.
--
-- Adds the four group-related tables (Group / GroupMember / GroupInvite /
-- GroupDeckOrder) and introduces a per-user CardProgress table. The old
-- per-card `difficultyLevel` column on Flashcard is migrated into
-- CardProgress and then dropped — group decks are shared by many users
-- and each needs their own rating, which a single column on the card
-- can't represent.
--
-- The whole migration runs in a single transaction (Prisma's default for
-- a single SQL file), so the difficultyLevel data is moved and the column
-- is dropped atomically. If anything fails partway through, the column
-- is preserved and you can re-run after fixing the cause.

-- ── Group ───────────────────────────────────────────────────────────────────
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "ownerId" TEXT NOT NULL,
    "included_category_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Group_ownerId_idx" ON "Group"("ownerId");

ALTER TABLE "Group" ADD CONSTRAINT "Group_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── GroupMember ─────────────────────────────────────────────────────────────
-- One row per (user, group). The owner of a group also has a row here with
-- role = 'owner' so listing "groups I'm in" is a single join.
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupMember_groupId_userId_key" ON "GroupMember"("groupId", "userId");
CREATE INDEX "GroupMember_userId_idx" ON "GroupMember"("userId");

ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── GroupInvite ─────────────────────────────────────────────────────────────
-- Both link invites (token set, invitedUserId null) and direct invites
-- (invitedUserId set, token null) live in this one table.
CREATE TABLE "GroupInvite" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "invitedUserId" TEXT,
    "token" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupInvite_token_key" ON "GroupInvite"("token");
CREATE INDEX "GroupInvite_groupId_idx" ON "GroupInvite"("groupId");
CREATE INDEX "GroupInvite_invitedUserId_idx" ON "GroupInvite"("invitedUserId");
CREATE INDEX "GroupInvite_token_idx" ON "GroupInvite"("token");

ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_invitedUserId_fkey"
    FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── GroupDeckOrder ──────────────────────────────────────────────────────────
-- Mirrors FolderDeckOrder — per-(user, group) ordering of the deck ids in
-- the group's included_category_ids array.
CREATE TABLE "GroupDeckOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "ordered_category_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupDeckOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupDeckOrder_userId_groupId_key" ON "GroupDeckOrder"("userId", "groupId");
CREATE INDEX "GroupDeckOrder_groupId_idx" ON "GroupDeckOrder"("groupId");

ALTER TABLE "GroupDeckOrder" ADD CONSTRAINT "GroupDeckOrder_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupDeckOrder" ADD CONSTRAINT "GroupDeckOrder_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── CardProgress ────────────────────────────────────────────────────────────
-- Per-(user, card) practice state. Replaces Flashcard.difficultyLevel so
-- group-shared cards can have a different rating per viewer.
CREATE TABLE "CardProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "difficultyLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CardProgress_userId_cardId_key" ON "CardProgress"("userId", "cardId");
CREATE INDEX "CardProgress_cardId_idx" ON "CardProgress"("cardId");
CREATE INDEX "CardProgress_userId_idx" ON "CardProgress"("userId");

ALTER TABLE "CardProgress" ADD CONSTRAINT "CardProgress_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardProgress" ADD CONSTRAINT "CardProgress_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES "Flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Backfill CardProgress from existing Flashcard.difficultyLevel ───────────
-- Only cards that have actually been rated produce a CardProgress row. The
-- card's existing `userId` is used as the viewer for the backfilled rating,
-- which matches the pre-groups single-owner world. After this migration,
-- newly added group members will start with no CardProgress rows of their
-- own (the UI renders that as "No rating").
INSERT INTO "CardProgress" ("id", "userId", "cardId", "difficultyLevel", "createdAt", "updatedAt")
SELECT
    -- Deterministic synthetic id derived from the card id. Prisma doesn't
    -- require any particular id format for an upsert key — it only needs
    -- the value to be globally unique. Prefixing with 'cp_' guarantees no
    -- collision with the cuids that the application layer produces for
    -- subsequent inserts (cuids always start with 'c').
    'cp_' || "id",
    "userId",
    "id",
    "difficultyLevel",
    "createdAt",
    "updatedAt"
FROM "Flashcard"
WHERE "difficultyLevel" IS NOT NULL;

-- ── Drop the now-redundant column ───────────────────────────────────────────
ALTER TABLE "Flashcard" DROP COLUMN "difficultyLevel";
