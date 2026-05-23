import { useRouter } from 'expo-router';
import { Layers, Pencil, Plus, Trash2, Users } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';

import type { GroupCreateInput, GroupUpdateInput } from '@ensemble/types';

import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { GroupModal } from '../../../src/components/GroupModal';
import { RequireNameConfirmationDialog } from '../../../src/components/RequireNameConfirmationDialog';
import { trpc } from '../../../src/lib/trpc';

export default function GroupsScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: groups, isLoading, refetch, isRefetching } = trpc.groups.list.useQuery();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<{ id: string; name: string } | null>(null);

  const createGroup = trpc.groups.create.useMutation({
    onSuccess: async () => {
      await utils.groups.list.invalidate();
      setCreateOpen(false);
    },
    onError: (err) => Alert.alert('Could not create group', err.message),
  });

  const updateGroup = trpc.groups.update.useMutation({
    onSuccess: async () => {
      await utils.groups.list.invalidate();
      setEditingId(null);
    },
    onError: (err) => Alert.alert('Could not save group', err.message),
  });

  const deleteGroup = trpc.groups.delete.useMutation({
    onSuccess: async () => {
      await utils.groups.list.invalidate();
      setDeletingGroup(null);
    },
    onError: (err) => Alert.alert('Could not delete group', err.message),
  });

  const editing = editingId
    ? ((groups ?? []).find((group) => group.id === editingId) ?? null)
    : null;

  if (isLoading && !groups) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#5584bb" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#5584bb" />
        }
      >
        <View className="gap-6">
          <View className="gap-3">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1 gap-1">
                <Text className="text-2xl font-bold text-slate-900">Your groups</Text>
                <Text className="text-sm text-slate-500">
                  Share decks with other people. Anyone in a group can add their own decks and
                  cards.
                </Text>
              </View>
              <Button size="sm" onPress={() => setCreateOpen(true)}>
                <View className="flex-row items-center gap-1.5">
                  <Plus size={15} color="#ffffff" />
                  <Text className="font-semibold text-white">New group</Text>
                </View>
              </Button>
            </View>
          </View>

          {(groups?.length ?? 0) > 0 ? (
            <View className="gap-3">
              {(groups ?? []).map((group) => (
                <Card key={group.id} className="p-4">
                  <View className="flex-row items-center gap-3">
                    <Pressable
                      onPress={() => router.push(`/groups/${group.id}`)}
                      className="flex-1 active:opacity-70"
                    >
                      <View className="flex-row items-center gap-3">
                        <View
                          className="h-10 w-10 shrink-0 rounded-md"
                          style={{ backgroundColor: group.color ?? '#94a3b8' }}
                        />
                        <View className="flex-1">
                          <View className="flex-row items-center gap-2">
                            <Text
                              className="text-base font-semibold text-slate-900"
                              numberOfLines={1}
                            >
                              {group.name}
                            </Text>
                            {group.isOwner ? (
                              <Text className="text-xs font-medium uppercase tracking-wide text-slate-400">
                                Owner
                              </Text>
                            ) : null}
                          </View>
                          {group.description ? (
                            <Text className="mt-0.5 text-sm text-slate-500" numberOfLines={1}>
                              {group.description}
                            </Text>
                          ) : null}
                          <View className="mt-1 flex-row items-center gap-1">
                            <Layers size={13} color="#94a3b8" />
                            <Text className="text-xs text-slate-500">
                              {group.deckCount} {group.deckCount === 1 ? 'deck' : 'decks'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </Pressable>

                    {group.isOwner ? (
                      <View className="flex-row items-center">
                        <Pressable
                          onPress={() => setEditingId(group.id)}
                          hitSlop={8}
                          className="px-2 py-1"
                        >
                          <Pencil size={16} color="#5584bb" />
                        </Pressable>
                        <Pressable
                          onPress={() => setDeletingGroup({ id: group.id, name: group.name })}
                          hitSlop={8}
                          className="px-2 py-1"
                        >
                          <Trash2 size={16} color="#ef4444" />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </Card>
              ))}
            </View>
          ) : (
            <Card className="items-center gap-3 border-dashed px-6 py-16">
              <View className="bg-primary/10 h-12 w-12 items-center justify-center rounded-full">
                <Users size={22} color="#5584bb" />
              </View>
              <Text className="text-lg font-semibold text-slate-900">No groups yet</Text>
              <Text className="text-center text-sm text-slate-500">
                Create a group to share decks with classmates, study partners, or anyone else.
              </Text>
              <View className="mt-2 w-full">
                <Button onPress={() => setCreateOpen(true)}>Create your first group</Button>
              </View>
            </Card>
          )}
        </View>
      </ScrollView>

      <GroupModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        mode={{ kind: 'create' }}
        onSubmit={(values) => createGroup.mutate(values as GroupCreateInput)}
        isPending={createGroup.isPending}
      />

      {editing ? (
        <GroupModal
          visible
          onClose={() => setEditingId(null)}
          mode={{
            kind: 'edit',
            group: {
              id: editing.id,
              name: editing.name,
              color: editing.color,
              description: editing.description,
            },
          }}
          onSubmit={(values) => updateGroup.mutate(values as GroupUpdateInput)}
          isPending={updateGroup.isPending}
        />
      ) : null}

      <RequireNameConfirmationDialog
        visible={deletingGroup !== null}
        onClose={() => setDeletingGroup(null)}
        title="Delete this group?"
        description="Members will lose access immediately. Decks shared in this group are not deleted; they go back to being personal decks for whoever owns them. This action cannot be undone."
        confirmLabel="Group"
        expectedName={deletingGroup?.name ?? ''}
        confirmActionLabel={deleteGroup.isPending ? 'Deleting...' : 'Delete group'}
        isPending={deleteGroup.isPending}
        onConfirm={() => {
          if (!deletingGroup) return;
          deleteGroup.mutate({ id: deletingGroup.id });
        }}
      />
    </View>
  );
}
