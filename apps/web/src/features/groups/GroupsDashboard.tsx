'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Users, Layers, Pencil, Plus, Trash2, Check, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc/client';
import { GroupModal } from '@/features/groups/GroupModal';

/**
 * /app/groups — list view of all the groups the current user is a member
 * of, with a "Pending invitations" section at the top. Mirrors the
 * Folders dashboard for consistency.
 *
 * Owner-only actions (delete, edit) are surfaced inline on rows where
 * `isOwner` is true; member-only actions (leave) live on the group's
 * detail page so this view stays uncluttered.
 */
export function GroupsDashboard() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: groups, isLoading } = trpc.groups.list.useQuery();
  const { data: invites } = trpc.invites.listMine.useQuery();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const createGroup = trpc.groups.create.useMutation({
    onSuccess: (group) => {
      utils.groups.list.invalidate();
      setCreateOpen(false);
      router.push(`/app/groups/${group.id}`);
    },
  });

  const updateGroup = trpc.groups.update.useMutation({
    onSuccess: () => {
      utils.groups.list.invalidate();
      setEditingId(null);
    },
  });

  const deleteGroup = trpc.groups.delete.useMutation({
    onSuccess: () => utils.groups.list.invalidate(),
  });

  const acceptInvite = trpc.invites.accept.useMutation({
    onSuccess: (res) => {
      utils.invites.listMine.invalidate();
      utils.groups.list.invalidate();
      router.push(`/app/groups/${res.groupId}`);
    },
  });

  const declineInvite = trpc.invites.decline.useMutation({
    onSuccess: () => utils.invites.listMine.invalidate(),
  });

  const editing = editingId ? ((groups ?? []).find((g) => g.id === editingId) ?? null) : null;
  const hasGroups = (groups?.length ?? 0) > 0;
  const hasInvites = (invites?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/app">
              <ArrowLeft className="h-4 w-4" />
              Your decks
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-md"
            >
              <Users className="h-5 w-5" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Your groups</h1>
          </div>
          <p className="text-muted-foreground pl-12 text-sm">
            Share decks with other people. Anyone in a group can add their own decks and cards.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New group
          </Button>
        </div>
      </div>

      {/* ── Pending invitations ──────────────────────────────────────────── */}
      {hasInvites ? (
        <section className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-tight text-blue-900">
            Invitations ({invites!.length})
          </h2>
          <div className="space-y-2">
            {invites!.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div
                    aria-hidden
                    className="h-9 w-9 shrink-0 rounded-md"
                    style={{ backgroundColor: inv.group.color ?? '#94a3b8' }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{inv.group.name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      Invited by {inv.invitedBy.name ?? 'someone'} ·{' '}
                      {inv.group.memberCount} {inv.group.memberCount === 1 ? 'member' : 'members'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => declineInvite.mutate({ inviteId: inv.id })}
                    disabled={declineInvite.isPending}
                  >
                    <X className="h-4 w-4" />
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => acceptInvite.mutate({ inviteId: inv.id })}
                    disabled={acceptInvite.isPending}
                  >
                    <Check className="h-4 w-4" />
                    Accept
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Groups list ──────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-muted/50 h-20 animate-pulse rounded-xl border" />
          ))}
        </div>
      ) : hasGroups ? (
        <div className="space-y-3">
          {(groups ?? []).map((g) => (
            <Card key={g.id} className="hover:border-primary/40 transition hover:shadow-sm">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <Link
                  href={`/app/groups/${g.id}`}
                  className="group flex min-w-0 flex-1 items-center gap-3"
                >
                  <div
                    aria-hidden
                    className="h-10 w-10 shrink-0 rounded-md"
                    style={{ backgroundColor: g.color ?? '#94a3b8' }}
                  />
                  <div className="min-w-0 flex-1">
                    <CardTitle className="group-hover:text-primary truncate text-base">
                      {g.name}
                      {g.isOwner ? (
                        <span className="text-muted-foreground ml-2 text-xs font-normal">
                          (owner)
                        </span>
                      ) : null}
                    </CardTitle>
                    {g.description ? (
                      <p className="text-muted-foreground line-clamp-1 text-sm">{g.description}</p>
                    ) : null}
                    <p className="text-muted-foreground mt-1 inline-flex items-center gap-1.5 text-xs">
                      <Layers className="h-3.5 w-3.5" />
                      {g.deckCount} {g.deckCount === 1 ? 'deck' : 'decks'}
                    </p>
                  </div>
                </Link>
                {/* Edit / delete are owner-only, matching the API. */}
                {g.isOwner ? (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingId(g.id)}
                      aria-label="Edit group"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (
                          confirm(
                            `Delete "${g.name}"? Members will lose access. Decks inside the group aren't deleted — they go back to being personal decks for whoever owns them.`,
                          )
                        ) {
                          deleteGroup.mutate({ id: g.id });
                        }
                      }}
                      aria-label="Delete group"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-full">
              <Users className="h-6 w-6" />
            </div>
            <div className="text-lg font-semibold">No groups yet</div>
            <p className="text-muted-foreground max-w-sm text-sm">
              Create a group to share decks with classmates, study partners, or anyone else.
              You&apos;ll get a shareable link to invite them.
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create your first group
            </Button>
          </CardContent>
        </Card>
      )}

      <GroupModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode={{
          kind: 'create',
          isPending: createGroup.isPending,
          onSubmit: (values) => createGroup.mutate(values),
        }}
      />

      {editing ? (
        <GroupModal
          open
          onOpenChange={(o) => (o ? null : setEditingId(null))}
          mode={{
            kind: 'edit',
            group: {
              id: editing.id,
              name: editing.name,
              color: editing.color ?? null,
              description: editing.description ?? null,
            },
            isPending: updateGroup.isPending,
            onSubmit: (values) => updateGroup.mutate(values),
          }}
        />
      ) : null}
    </div>
  );
}
