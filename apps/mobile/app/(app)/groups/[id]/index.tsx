import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Layers, Link2, Mail, Plus, Share2, Trash2, Users } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';

import type { GroupUpdateInput } from '@ensemble/types';

import { Button } from '../../../../src/components/Button';
import { Card } from '../../../../src/components/Card';
import { GroupModal } from '../../../../src/components/GroupModal';
import { Stat } from '../../../../src/components/Stat';
import { TextField } from '../../../../src/components/TextField';
import { API_URL } from '../../../../src/lib/config';
import { trpc } from '../../../../src/lib/trpc';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = id as string;
  const router = useRouter();
  const utils = trpc.useUtils();
  const [editOpen, setEditOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  const groupQuery = trpc.groups.byId.useQuery({ id: groupId });
  const group = groupQuery.data;
  const linkInvitesQuery = trpc.invites.listLinks.useQuery({ groupId });

  const updateGroup = trpc.groups.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.groups.byId.invalidate({ id: groupId }),
        utils.groups.list.invalidate(),
      ]);
      setEditOpen(false);
    },
    onError: (err) => Alert.alert('Could not save group', err.message),
  });

  const deleteGroup = trpc.groups.delete.useMutation({
    onSuccess: async () => {
      await utils.groups.list.invalidate();
      router.replace('/groups');
    },
    onError: (err) => Alert.alert('Could not delete group', err.message),
  });

  const leaveGroup = trpc.groups.leave.useMutation({
    onSuccess: async () => {
      await utils.groups.list.invalidate();
      router.replace('/groups');
    },
    onError: (err) => Alert.alert('Could not leave group', err.message),
  });

  const createLink = trpc.invites.createLink.useMutation({
    onSuccess: async () => {
      await utils.invites.listLinks.invalidate({ groupId });
    },
    onError: (err) => Alert.alert('Could not create invite link', err.message),
  });

  const revokeInvite = trpc.invites.revoke.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.invites.listLinks.invalidate({ groupId }),
        utils.groups.byId.invalidate({ id: groupId }),
      ]);
    },
    onError: (err) => Alert.alert('Could not revoke invite', err.message),
  });

  const inviteUser = trpc.invites.inviteUser.useMutation({
    onSuccess: async (result) => {
      await utils.groups.byId.invalidate({ id: groupId });
      setInviteEmail('');
      if (result.status === 'invited') {
        setInviteMessage(`Invited ${result.target.name ?? result.target.email}.`);
      } else if (result.status === 'already_invited') {
        setInviteMessage(
          `${result.target.name ?? result.target.email} already has a pending invite.`,
        );
      } else {
        setInviteMessage(`${result.target.name ?? result.target.email} is already in this group.`);
      }
    },
    onError: (err) => setInviteMessage(err.message),
  });

  async function shareInviteLink(token: string) {
    const url = `${API_URL}/groups/join/${token}`;
    try {
      await Share.share({ message: url, url });
    } catch {
      Alert.alert('Could not open share sheet', url);
    }
  }

  function handleInviteSubmit() {
    const email = inviteEmail.trim().toLowerCase();
    setInviteMessage(null);
    if (!email) return;
    inviteUser.mutate({ groupId, email });
  }

  function confirmDeleteGroup() {
    if (!group) return;
    Alert.alert(
      `Delete "${group.name}"?`,
      "Members will lose access. Decks inside the group aren't deleted.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteGroup.mutate({ id: groupId }),
        },
      ],
    );
  }

  function confirmLeaveGroup() {
    if (!group) return;
    Alert.alert(`Leave "${group.name}"?`, 'You can be invited back later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => leaveGroup.mutate({ id: groupId }),
      },
    ]);
  }

  if (groupQuery.isLoading && !group) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#5584bb" />
      </View>
    );
  }

  if (!group) {
    return (
      <View className="flex-1 bg-slate-50 p-4">
        <Card className="items-center gap-3 border-dashed p-8">
          <Text className="text-lg font-semibold text-slate-900">Group not found</Text>
          <Text className="text-center text-sm text-slate-500">
            You may no longer be a member of this group.
          </Text>
          <View className="mt-2 w-full">
            <Button variant="outline" onPress={() => router.replace('/groups')}>
              Back to groups
            </Button>
          </View>
        </Card>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <Stack.Screen options={{ title: group.name }} />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={groupQuery.isRefetching}
            onRefresh={groupQuery.refetch}
            tintColor="#5584bb"
          />
        }
      >
        <View className="gap-6">
          <View className="gap-4">
            <View className="flex-row items-center gap-3">
              <View
                className="h-12 w-12 shrink-0 rounded-md"
                style={{ backgroundColor: group.color ?? '#94a3b8' }}
              />
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-2xl font-bold text-slate-900" numberOfLines={1}>
                    {group.name}
                  </Text>
                  {group.isOwner ? (
                    <Text className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Owner
                    </Text>
                  ) : null}
                </View>
                <Text className="text-sm text-slate-500">
                  Share decks with other people. Anyone in a group can add their own decks and
                  cards.
                </Text>
              </View>
            </View>

            {group.description ? (
              <Card className="p-4">
                <Text className="text-sm leading-6 text-slate-600">{group.description}</Text>
              </Card>
            ) : null}

            <View className="flex-row gap-2">
              <Stat label="Members" value={group.members.length} tone="slate" />
              <Stat label="Decks" value={group.includedDecks.length} tone="blue" />
              <Stat label="Invites" value={group.pendingDirectInvites.length} tone="amber" />
            </View>

            <View className="flex-row gap-2">
              {group.isOwner ? (
                <>
                  <View className="flex-1">
                    <Button variant="outline" onPress={() => setEditOpen(true)}>
                      Edit group
                    </Button>
                  </View>
                  <View className="flex-1">
                    <Button variant="destructive" onPress={confirmDeleteGroup}>
                      <View className="flex-row items-center justify-center gap-2">
                        <Trash2 size={15} color="#ffffff" />
                        <Text className="font-semibold text-white">Delete group</Text>
                      </View>
                    </Button>
                  </View>
                </>
              ) : (
                <View className="flex-1">
                  <Button variant="destructive" onPress={confirmLeaveGroup}>
                    Leave group
                  </Button>
                </View>
              )}
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Invite people
            </Text>
            <Card className="gap-4 p-4">
              <View className="gap-1">
                <View className="flex-row items-center gap-2">
                  <Link2 size={16} color="#64748b" />
                  <Text className="text-sm font-semibold text-slate-900">Invite people</Text>
                </View>
                <Text className="text-sm text-slate-500">
                  Share a link or invite someone directly by email.
                </Text>
              </View>

              <View className="gap-3">
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-slate-700">Shareable link</Text>
                    <Text className="mt-0.5 text-xs text-slate-500">
                      Anyone with the link can join this group.
                    </Text>
                  </View>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => createLink.mutate({ groupId })}
                    loading={createLink.isPending}
                  >
                    {createLink.isPending ? 'Generating...' : 'Generate link'}
                  </Button>
                </View>

                {(linkInvitesQuery.data?.length ?? 0) > 0 ? (
                  <View className="gap-2">
                    {linkInvitesQuery.data!.map((invite) => {
                      const url = `${API_URL}/groups/join/${invite.token}`;
                      return (
                        <Card key={invite.id} className="border-slate-200 bg-slate-50 p-3">
                          <View className="gap-3">
                            <Text className="text-xs text-slate-500" selectable>
                              {url}
                            </Text>
                            <View className="flex-row gap-2">
                              <View className="flex-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onPress={() => shareInviteLink(invite.token)}
                                >
                                  <View className="flex-row items-center justify-center gap-2">
                                    <Share2 size={14} color="#0f172a" />
                                    <Text className="font-semibold text-slate-900">Share</Text>
                                  </View>
                                </Button>
                              </View>
                              <View className="flex-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onPress={() => revokeInvite.mutate({ inviteId: invite.id })}
                                >
                                  <View className="flex-row items-center justify-center gap-2">
                                    <Trash2 size={14} color="#ef4444" />
                                    <Text className="font-semibold text-red-500">Revoke</Text>
                                  </View>
                                </Button>
                              </View>
                            </View>
                          </View>
                        </Card>
                      );
                    })}
                  </View>
                ) : (
                  <Text className="text-xs text-slate-500">No active invite links yet.</Text>
                )}
              </View>

              <View className="gap-3 border-t border-slate-200 pt-4">
                <View className="gap-1">
                  <View className="flex-row items-center gap-2">
                    <Mail size={16} color="#64748b" />
                    <Text className="text-sm font-medium text-slate-700">
                      Or invite someone directly by email
                    </Text>
                  </View>
                </View>
                <TextField
                  label="Email"
                  placeholder="friend@example.com"
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="send"
                  onSubmitEditing={handleInviteSubmit}
                />
                <Button onPress={handleInviteSubmit} loading={inviteUser.isPending}>
                  <View className="flex-row items-center justify-center gap-2">
                    <Plus size={15} color="#ffffff" />
                    <Text className="font-semibold text-white">
                      {inviteUser.isPending ? 'Sending...' : 'Invite'}
                    </Text>
                  </View>
                </Button>
                {inviteMessage ? (
                  <Text className="text-xs text-slate-500">{inviteMessage}</Text>
                ) : null}
              </View>
            </Card>
          </View>

          <View className="gap-2">
            <Text className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Shared decks
            </Text>
            {group.includedDecks.length > 0 ? (
              group.includedDecks.map((deck) => (
                <Card key={deck.id} className="p-4">
                  <Pressable
                    onPress={() => router.push(`/decks/${deck.id}`)}
                    className="active:opacity-70"
                  >
                    <View className="flex-row items-center gap-3">
                      <View
                        className="h-10 w-10 shrink-0 rounded-md"
                        style={{ backgroundColor: deck.color ?? '#94a3b8' }}
                      />
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text
                            className="text-base font-semibold text-slate-900"
                            numberOfLines={1}
                          >
                            {deck.name}
                          </Text>
                          {!deck.isYours ? (
                            <Text className="text-xs font-medium uppercase tracking-wide text-slate-400">
                              Shared
                            </Text>
                          ) : null}
                        </View>
                        {deck.description ? (
                          <Text className="mt-0.5 text-sm text-slate-500" numberOfLines={2}>
                            {deck.description}
                          </Text>
                        ) : null}
                        <View className="mt-1 flex-row items-center gap-3">
                          <View className="flex-row items-center gap-1">
                            <Layers size={13} color="#94a3b8" />
                            <Text className="text-xs text-slate-500">
                              {deck.cardCount} {deck.cardCount === 1 ? 'card' : 'cards'}
                            </Text>
                          </View>
                          <Text className="text-xs text-slate-400">
                            {deck.ownerName ? `Created by ${deck.ownerName}` : 'Shared deck'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                </Card>
              ))
            ) : (
              <Card className="items-center gap-2 border-dashed p-8">
                <Text className="text-base font-semibold text-slate-900">No decks yet</Text>
                <Text className="text-center text-sm text-slate-500">
                  Shared decks will appear here once members add them to the group.
                </Text>
              </Card>
            )}
          </View>

          <View className="gap-2">
            <Text className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Members
            </Text>
            {group.members.map((member) => (
              <Card key={member.id} className="p-4">
                <View className="flex-row items-center gap-3">
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-slate-200">
                    <Users size={18} color="#64748b" />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-base font-semibold text-slate-900" numberOfLines={1}>
                        {member.name ?? member.email ?? 'Member'}
                      </Text>
                      {member.role === 'owner' ? (
                        <Text className="text-xs font-medium uppercase tracking-wide text-slate-400">
                          Owner
                        </Text>
                      ) : null}
                      {member.isYou ? (
                        <Text className="text-xs font-medium uppercase tracking-wide text-slate-400">
                          You
                        </Text>
                      ) : null}
                    </View>
                    {member.email ? (
                      <Text className="mt-0.5 text-sm text-slate-500" numberOfLines={1}>
                        {member.email}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Card>
            ))}
          </View>

          {group.pendingDirectInvites.length > 0 ? (
            <View className="gap-2">
              <Text className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Pending invites
              </Text>
              {group.pendingDirectInvites.map((invite) => (
                <Card key={invite.id} className="p-4">
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-slate-900" numberOfLines={1}>
                        {invite.invitedUserName ?? invite.invitedUserEmail ?? 'Invited user'}
                      </Text>
                      {invite.invitedUserEmail ? (
                        <Text className="mt-0.5 text-sm text-slate-500" numberOfLines={1}>
                          {invite.invitedUserEmail}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() => revokeInvite.mutate({ inviteId: invite.id })}
                      hitSlop={8}
                      className="px-2 py-1"
                    >
                      <Text className="text-sm font-medium text-red-500">Revoke</Text>
                    </Pressable>
                  </View>
                </Card>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <GroupModal
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        mode={{
          kind: 'edit',
          group: {
            id: group.id,
            name: group.name,
            color: group.color,
            description: group.description,
          },
        }}
        onSubmit={(values) => updateGroup.mutate(values as GroupUpdateInput)}
        isPending={updateGroup.isPending}
      />
    </View>
  );
}
