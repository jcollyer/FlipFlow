'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowLeft,
  Users,
  Layers,
  Pencil,
  Plus,
  Trash2,
  LogOut,
  Link2,
  Copy,
  Check,
  Mail,
  Shield,
  Crown,
  UserMinus,
  CopyPlus,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { trpc } from '@/lib/trpc/client';
import { GroupModal } from '@/features/groups/GroupModal';

interface Props {
  groupId: string;
}

/**
 * /app/groups/[id] — single group detail.
 *
 * Layout (top → bottom):
 *   1. Breadcrumb + title (color swatch + name + description)
 *   2. Members list — role badges, remove (owner-only), transfer-ownership
 *   3. Invite controls — share link + direct-invite-by-email
 *   4. Shared decks — included decks + "Add deck" toggle + per-deck
 *      "Duplicate" action for decks the viewer doesn't own
 *   5. Footer actions — Edit / Delete (owner) or Leave (member)
 *
 * Permission enforcement happens server-side; this UI hides actions the
 * caller isn't allowed to perform so we don't surface buttons that error.
 */
export function GroupDetail({ groupId }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: group, isLoading } = trpc.groups.byId.useQuery({ id: groupId });
  const { data: myDecks } = trpc.categories.list.useQuery();
  const { data: linkInvites } = trpc.invites.listLinks.useQuery({ groupId });

  const [editOpen, setEditOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // ── Mutations ──────────────────────────────────────────────────────────
  const updateGroup = trpc.groups.update.useMutation({
    onSuccess: () => {
      utils.groups.byId.invalidate({ id: groupId });
      utils.groups.list.invalidate();
      setEditOpen(false);
    },
  });
  const deleteGroup = trpc.groups.delete.useMutation({
    onSuccess: () => {
      utils.groups.list.invalidate();
      router.push('/app/groups');
    },
  });
  const leaveGroup = trpc.groups.leave.useMutation({
    onSuccess: () => {
      utils.groups.list.invalidate();
      router.push('/app/groups');
    },
  });
  const addDeck = trpc.groups.addDeck.useMutation({
    onSuccess: () => {
      utils.groups.byId.invalidate({ id: groupId });
      utils.groups.list.invalidate();
    },
  });
  const removeDeck = trpc.groups.removeDeck.useMutation({
    onSuccess: () => {
      utils.groups.byId.invalidate({ id: groupId });
      utils.groups.list.invalidate();
    },
  });
  const removeMember = trpc.groups.removeMember.useMutation({
    onSuccess: () => utils.groups.byId.invalidate({ id: groupId }),
  });
  const transferOwnership = trpc.groups.transferOwnership.useMutation({
    onSuccess: () => {
      utils.groups.byId.invalidate({ id: groupId });
      utils.groups.list.invalidate();
    },
  });
  const duplicateDeck = trpc.groups.duplicateDeck.useMutation({
    onSuccess: (created) => {
      utils.categories.list.invalidate();
      router.push(`/app/categories/${created.id}`);
    },
  });
  const createLink = trpc.invites.createLink.useMutation({
    onSuccess: () => utils.invites.listLinks.invalidate({ groupId }),
  });
  const revokeInvite = trpc.invites.revoke.useMutation({
    onSuccess: () => {
      utils.invites.listLinks.invalidate({ groupId });
      utils.groups.byId.invalidate({ id: groupId });
    },
  });
  const inviteUser = trpc.invites.inviteUser.useMutation({
    onSuccess: (res) => {
      utils.groups.byId.invalidate({ id: groupId });
      setInviteEmail('');
      // Surface a small confirmation message — different copy for each
      // outcome so the user always knows what just happened.
      if (res.status === 'invited') {
        setInviteMessage(`Invited ${res.target.name ?? res.target.email}.`);
      } else if (res.status === 'already_invited') {
        setInviteMessage(`${res.target.name ?? res.target.email} already has a pending invite.`);
      } else if (res.status === 'already_member') {
        setInviteMessage(`${res.target.name ?? res.target.email} is already in this group.`);
      }
    },
    onError: (err) => setInviteMessage(err.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-muted/50 h-24 animate-pulse rounded-xl border" />
        ))}
      </div>
    );
  }
  if (!group) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Group not found.</p>
          <Button asChild variant="ghost" className="mt-4">
            <Link href="/app/groups">Back to groups</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const includedSet = new Set(group.includedCategoryIds);
  const myDecksList = myDecks ?? [];

  // Pre-compute origin so the copy-link button shows the full URL the user
  // will share. On the server `window` is undefined; we fall back to the
  // relative path and let the browser fill it in on the client.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/app/groups">
              <ArrowLeft className="h-4 w-4" />
              All groups
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="h-9 w-9 rounded-md"
              style={{ backgroundColor: group.color ?? '#94a3b8' }}
            />
            <h1 className="text-3xl font-semibold tracking-tight">{group.name}</h1>
          </div>
          {group.description ? (
            <p className="text-muted-foreground pl-12 text-sm">{group.description}</p>
          ) : null}
        </div>
      </div>

      {/* ── Members ─────────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-tight text-gray-700">
            <Users className="h-4 w-4" />
            Members ({group.members.length})
          </h2>
        </div>
        <ul className="divide-y">
          {group.members.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="bg-muted text-muted-foreground relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold">
                  {m.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.image}
                      alt={m.name ?? m.email ?? 'Member avatar'}
                      className="absolute inset-0 h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>{(m.name ?? m.email ?? '?').slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {m.name ?? m.email ?? 'Anonymous'}
                    {m.isYou ? (
                      <span className="text-muted-foreground ml-2 text-xs">(you)</span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                    {m.role === 'owner' ? (
                      <>
                        <Crown className="h-3.5 w-3.5 text-amber-500" />
                        Owner
                      </>
                    ) : (
                      <>
                        <Shield className="h-3.5 w-3.5" />
                        Member
                      </>
                    )}
                  </p>
                </div>
              </div>
              {/* Owner-only actions: transfer ownership to a member, or kick. */}
              {group.isOwner && !m.isYou && m.role === 'member' ? (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (
                        confirm(
                          `Make ${m.name ?? m.email ?? 'this member'} the owner of this group? You'll become a regular member.`,
                        )
                      ) {
                        transferOwnership.mutate({
                          groupId,
                          newOwnerUserId: m.userId,
                        });
                      }
                    }}
                  >
                    <Crown className="h-4 w-4" />
                    Make owner
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (
                        confirm(
                          `Remove ${m.name ?? m.email ?? 'this member'} from the group? Their decks added to the group will stay shared.`,
                        )
                      ) {
                        removeMember.mutate({ groupId, userId: m.userId });
                      }
                    }}
                  >
                    <UserMinus className="h-4 w-4" />
                    Remove
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
          {group.pendingDirectInvites.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {inv.invitedUserName ?? inv.invitedUserEmail ?? 'Pending invite'}
                  </p>
                  <p className="text-muted-foreground text-xs">Pending invitation</p>
                </div>
              </div>
              {/* Any member can revoke an invite they sent; group owners
                  can revoke any. The server enforces this — the UI just
                  shows the button optimistically; failures fall through to
                  the standard tRPC error toast. */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => revokeInvite.mutate({ inviteId: inv.id })}
              >
                <Trash2 className="h-4 w-4" />
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Invite controls ─────────────────────────────────────────────── */}
      <section className="space-y-4 rounded-2xl border p-4">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-tight text-gray-700">
          <Link2 className="h-4 w-4" />
          Invite people
        </h2>

        {/* Share-link invites: any member can mint a link; multiple links
            can coexist (e.g. one for class, one for friends). */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-sm">
              Anyone with the link can join.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => createLink.mutate({ groupId })}
              disabled={createLink.isPending}
            >
              <Plus className="h-4 w-4" />
              {createLink.isPending ? 'Generating…' : 'Generate link'}
            </Button>
          </div>
          {(linkInvites ?? []).length === 0 ? (
            <p className="text-muted-foreground text-xs">No active invite links yet.</p>
          ) : (
            <ul className="space-y-2">
              {(linkInvites ?? []).map((inv) => {
                // Join URL lives outside /app so unauthenticated recipients
                // aren't redirected away by the auth-required layout —
                // they can sign in from the join page directly.
                const url = `${origin}/groups/join/${inv.token}`;
                const isCopied = copiedToken === inv.token;
                return (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border bg-gray-50 p-2"
                  >
                    <input
                      readOnly
                      value={url}
                      className="bg-background flex-1 truncate rounded-md border px-2 py-1 font-mono text-xs"
                      onFocus={(e) => e.target.select()}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(url);
                          setCopiedToken(inv.token);
                          window.setTimeout(() => setCopiedToken(null), 2000);
                        } catch {
                          // Clipboard may be unavailable (insecure context);
                          // selecting + readonly input gives the user a
                          // manual fallback.
                        }
                      }}
                    >
                      {isCopied ? (
                        <>
                          <Check className="h-4 w-4" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copy
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => revokeInvite.mutate({ inviteId: inv.id })}
                    >
                      <Trash2 className="h-4 w-4" />
                      Revoke
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Direct invite by email — works for existing accounts only in v1. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setInviteMessage(null);
            const email = inviteEmail.trim().toLowerCase();
            if (!email) return;
            inviteUser.mutate({ groupId, email });
          }}
          className="space-y-2"
        >
          <Label htmlFor="invite-email" className="text-sm">
            Or invite someone directly by email
          </Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="invite-email"
              type="email"
              placeholder="friend@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={inviteUser.isPending}>
              <Mail className="h-4 w-4" />
              {inviteUser.isPending ? 'Sending…' : 'Invite'}
            </Button>
          </div>
          {inviteMessage ? (
            <p className="text-muted-foreground text-xs">{inviteMessage}</p>
          ) : null}
        </form>
      </section>

      {/* ── Shared decks ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-tight text-gray-700">
            <Layers className="h-4 w-4" />
            Shared decks ({group.includedDecks.length})
          </h2>
          {/* "Add deck" lets a member share any deck they own into the
              group. Decks owned by other members can't be added by you —
              the dropdown only lists your decks. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={myDecksList.length === 0}>
                <Plus className="h-4 w-4" />
                Add deck
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 w-72 overflow-y-auto">
              <DropdownMenuLabel>Your decks</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {myDecksList.length === 0 ? (
                <p className="text-muted-foreground px-2 py-3 text-sm">
                  You don&apos;t have any decks yet.
                </p>
              ) : (
                myDecksList.map((c) => {
                  const checked = includedSet.has(c.id);
                  return (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={checked}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(next) => {
                        if (next) addDeck.mutate({ groupId, categoryId: c.id });
                        else removeDeck.mutate({ groupId, categoryId: c.id });
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="h-2.5 w-2.5 rounded-sm"
                          style={{ backgroundColor: c.color ?? '#94a3b8' }}
                        />
                        <span className="truncate">{c.name}</span>
                      </span>
                    </DropdownMenuCheckboxItem>
                  );
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {group.includedDecks.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-muted-foreground max-w-sm text-sm">
                No decks have been shared into this group yet. Use the
                <span className="font-medium"> Add deck</span> button above to share one of your
                decks.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.includedDecks.map((d) => (
              <Card
                key={d.id}
                className="hover:border-primary/40 group/card relative transition hover:shadow-md"
              >
                <Link href={`/app/categories/${d.id}`} className="block">
                  <CardHeader className="flex flex-row items-center gap-3">
                    <div
                      aria-hidden
                      className="h-10 w-10 shrink-0 rounded-md"
                      style={{ backgroundColor: d.color ?? '#94a3b8' }}
                    />
                    <div className="min-w-0">
                      <CardTitle className="group-hover/card:text-primary truncate text-sm">
                        {d.name}
                      </CardTitle>
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">
                        {d.isYours ? 'Your deck' : `By ${d.ownerName ?? 'another member'}`}
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="text-muted-foreground flex items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5" />
                      {d.cardCount} {d.cardCount === 1 ? 'card' : 'cards'}
                    </span>
                  </CardContent>
                </Link>
                {/* Footer-style action bar. The "Remove from group" action
                    is shown to the deck owner and the group owner; the
                    duplicate action is shown when the viewer isn't the
                    deck owner. */}
                <div className="flex items-center justify-end gap-1 border-t px-3 py-2">
                  {!d.isYours ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => duplicateDeck.mutate({ categoryId: d.id })}
                      disabled={duplicateDeck.isPending}
                    >
                      <CopyPlus className="h-4 w-4" />
                      Duplicate
                    </Button>
                  ) : null}
                  {d.isYours || group.isOwner ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (
                          confirm(
                            `Remove "${d.name}" from this group? The deck itself isn't deleted — it just stops being shared here.`,
                          )
                        ) {
                          removeDeck.mutate({ groupId, categoryId: d.id });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Footer actions ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 border-t pt-6">
        {group.isOwner ? (
          <>
            <Button variant="ghost" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Edit group
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (
                  confirm(
                    `Delete "${group.name}"? Members will lose access. Decks inside the group aren't deleted — they go back to being personal decks for whoever owns them.`,
                  )
                ) {
                  deleteGroup.mutate({ id: groupId });
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete group
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm(`Leave "${group.name}"? You'll lose access to the shared decks.`)) {
                leaveGroup.mutate({ id: groupId });
              }
            }}
          >
            <LogOut className="h-4 w-4" />
            Leave group
          </Button>
        )}
      </div>

      {editOpen ? (
        <GroupModal
          open
          onOpenChange={(o) => (o ? null : setEditOpen(false))}
          mode={{
            kind: 'edit',
            group: {
              id: group.id,
              name: group.name,
              color: group.color ?? null,
              description: group.description ?? null,
            },
            isPending: updateGroup.isPending,
            onSubmit: (values) => updateGroup.mutate(values),
          }}
        />
      ) : null}
    </div>
  );
}
