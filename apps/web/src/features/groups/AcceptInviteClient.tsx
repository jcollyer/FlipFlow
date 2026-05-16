'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Users, ArrowRight, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc/client';

interface Props {
  token: string;
}

/**
 * Client portion of the accept-invite flow. The server component above
 * has already verified the visitor is signed in; here we:
 *   1. Preview the invite to show what group they're joining.
 *   2. Render Accept / Cancel actions.
 *   3. On accept, route to the group's detail page.
 *
 * The acceptance call is idempotent on the server — if the user is
 * already a member, the mutation returns successfully with
 * `alreadyMember: true` and we navigate them in.
 */
export function AcceptInviteClient({ token }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const preview = trpc.invites.previewByToken.useQuery({ token });
  const accept = trpc.invites.accept.useMutation({
    onSuccess: (res) => {
      utils.groups.list.invalidate();
      utils.invites.listMine.invalidate();
      router.push(`/app/groups/${res.groupId}`);
    },
  });

  // Auto-navigate if the user is already a member when the page loads.
  // Avoids making them click "Go to group" — they came here from a link
  // expecting to land in the group regardless.
  useEffect(() => {
    if (preview.data?.alreadyMember) {
      router.replace(`/app/groups/${preview.data.group.id}`);
    }
  }, [preview.data, router]);

  if (preview.isLoading) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Loading invitation…</p>
        </CardContent>
      </Card>
    );
  }

  if (preview.error || !preview.data) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="bg-destructive/10 text-destructive mx-auto flex h-12 w-12 items-center justify-center rounded-full">
            <AlertCircle className="h-6 w-6" />
          </div>
          <CardTitle>This invitation isn&apos;t valid</CardTitle>
          <CardDescription>
            The link may have been revoked or the group was deleted. Ask the inviter for a new one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full" variant="outline">
            <Link href="/app">Go to your decks</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { group, invitedBy, usable, expired, status } = preview.data;

  if (!usable) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Invitation unavailable</CardTitle>
          <CardDescription>
            {expired
              ? 'This invitation has expired.'
              : status === 'revoked'
                ? 'This invitation has been revoked.'
                : "This invitation can no longer be used."}{' '}
            Ask the inviter to send a new one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full" variant="outline">
            <Link href="/app">Go to your decks</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div
          aria-hidden
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: group.color ?? '#94a3b8' }}
        >
          <Users className="h-6 w-6 text-white" />
        </div>
        <CardTitle className="text-2xl">Join {group.name}</CardTitle>
        <CardDescription>
          {invitedBy?.name ? `${invitedBy.name} invited you to ` : 'You\'ve been invited to '}
          this group of {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {group.description ? (
          <p className="text-muted-foreground rounded-md bg-gray-50 p-3 text-sm">
            {group.description}
          </p>
        ) : null}
        <Button
          className="w-full"
          onClick={() => accept.mutate({ token })}
          disabled={accept.isPending}
        >
          {accept.isPending ? 'Joining…' : 'Accept invitation'}
          <ArrowRight className="h-4 w-4" />
        </Button>
        {accept.error ? (
          <p className="text-destructive text-center text-sm">{accept.error.message}</p>
        ) : null}
        <Button asChild variant="ghost" className="w-full">
          <Link href="/app">Maybe later</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
