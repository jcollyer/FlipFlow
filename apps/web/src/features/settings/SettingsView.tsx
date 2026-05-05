'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { trpc } from '@/lib/trpc/client';

/**
 * /app/settings — read-only profile info plus an inline editor for the user's
 * display name. The session.user.name on the layout will pick up the change
 * on the next refresh; we router.refresh() after a successful save so the
 * header initials/label update immediately.
 */
export function SettingsView() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: me, isLoading } = trpc.auth.me.useQuery();

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Sync the input with whatever we just fetched from the server. We only
  // overwrite local edits when the server value actually changes, so a slow
  // refetch doesn't blow away mid-edit text.
  useEffect(() => {
    if (me?.name != null) {
      setName(me.name);
    }
  }, [me?.name]);

  const updateName = trpc.auth.updateName.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      utils.auth.getSession.invalidate();
      setSavedAt(Date.now());
      // Refresh the server component layout so the header dropdown picks up
      // the new name without a full page reload.
      router.refresh();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const trimmed = name.trim();
  const dirty = trimmed.length > 0 && trimmed !== (me?.name ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!dirty) return;
    updateName.mutate({ name: trimmed });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/app">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update how your name appears across the app.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="settings-name">Name</Label>
                <Input
                  id="settings-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                    setSavedAt(null);
                  }}
                  placeholder="Your name"
                  autoComplete="name"
                  maxLength={80}
                />
                {error ? <p className="text-destructive text-sm">{error}</p> : null}
                {savedAt && !dirty ? (
                  <p className="text-muted-foreground text-sm">Saved.</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="settings-email">Email</Label>
                <Input
                  id="settings-email"
                  value={me?.email ?? ''}
                  disabled
                  readOnly
                  className="opacity-70"
                />
                <p className="text-muted-foreground text-xs">
                  Your email is tied to your sign-in and can&apos;t be changed here.
                </p>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={!dirty || updateName.isPending}>
                  {updateName.isPending ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
