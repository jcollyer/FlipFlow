import { FolderTree, Layers, Pencil, Plus, Trash2 } from 'lucide-react-native';
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

import type { FolderCreateInput, FolderUpdateInput } from '@ensemble/types';

import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { FolderModal } from '../../../src/components/FolderModal';
import { trpc } from '../../../src/lib/trpc';

/**
 * /folders — list view of all the user's folders. Sister screen to
 * /groups; mirrors the web app's `/app/folders` page.
 *
 * Mobile doesn't have a folder detail screen yet — deck-by-folder browsing
 * lives in the home screen drawers. Inline pencil/trash buttons let the
 * user edit or delete without leaving the list.
 */
export default function FoldersScreen() {
  const utils = trpc.useUtils();
  const { data: folders, isLoading, refetch, isRefetching } = trpc.folders.list.useQuery();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const createFolder = trpc.folders.create.useMutation({
    onSuccess: async () => {
      await utils.folders.list.invalidate();
      setCreateOpen(false);
    },
    onError: (err) => Alert.alert('Could not create folder', err.message),
  });

  const updateFolder = trpc.folders.update.useMutation({
    onSuccess: async () => {
      await utils.folders.list.invalidate();
      setEditingId(null);
    },
    onError: (err) => Alert.alert('Could not save folder', err.message),
  });

  const deleteFolder = trpc.folders.delete.useMutation({
    onSuccess: async () => {
      await utils.folders.list.invalidate();
    },
    onError: (err) => Alert.alert('Could not delete folder', err.message),
  });

  const editing = editingId
    ? ((folders ?? []).find((folder) => folder.id === editingId) ?? null)
    : null;

  function confirmDeleteFolder(folderId: string, folderName: string) {
    Alert.alert(
      `Delete "${folderName}"?`,
      'Decks inside this folder are not deleted; they will simply stop being grouped here. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteFolder.mutate({ id: folderId }),
        },
      ],
    );
  }

  if (isLoading && !folders) {
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
          {/* Header */}
          <View className="gap-3">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1 gap-1">
                <Text className="text-2xl font-bold text-slate-900">All folders</Text>
                <Text className="text-sm text-slate-500">
                  Group decks together for better organization.
                </Text>
              </View>
              <Button size="sm" onPress={() => setCreateOpen(true)}>
                <View className="flex-row items-center gap-1.5">
                  <Plus size={15} color="#ffffff" />
                  <Text className="font-semibold text-white">New folder</Text>
                </View>
              </Button>
            </View>
          </View>

          {(folders?.length ?? 0) > 0 ? (
            <View className="gap-3">
              {(folders ?? []).map((folder) => (
                <Card key={folder.id} className="p-4">
                  <View className="flex-row items-center gap-3">
                    <View className="flex-1 flex-row items-center gap-3">
                      <View
                        className="h-10 w-10 shrink-0 rounded-md"
                        style={{ backgroundColor: folder.color ?? '#94a3b8' }}
                      />
                      <View className="flex-1">
                        <Text className="text-base font-semibold text-slate-900" numberOfLines={1}>
                          {folder.name}
                        </Text>
                        {folder.description ? (
                          <Text className="mt-0.5 text-sm text-slate-500" numberOfLines={1}>
                            {folder.description}
                          </Text>
                        ) : null}
                        <View className="mt-1 flex-row items-center gap-1">
                          <Layers size={13} color="#94a3b8" />
                          <Text className="text-xs text-slate-500">
                            {folder.deckCount} {folder.deckCount === 1 ? 'deck' : 'decks'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View className="flex-row items-center">
                      <Pressable
                        onPress={() => setEditingId(folder.id)}
                        hitSlop={8}
                        className="px-2 py-1"
                        accessibilityLabel="Edit folder"
                      >
                        <Pencil size={16} color="#5584bb" />
                      </Pressable>
                      <Pressable
                        onPress={() => confirmDeleteFolder(folder.id, folder.name)}
                        hitSlop={8}
                        className="px-2 py-1"
                        accessibilityLabel="Delete folder"
                      >
                        <Trash2 size={16} color="#ef4444" />
                      </Pressable>
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          ) : (
            <Card className="items-center gap-3 border-dashed px-6 py-16">
              <View className="bg-primary/10 h-12 w-12 items-center justify-center rounded-full">
                <FolderTree size={22} color="#5584bb" />
              </View>
              <Text className="text-lg font-semibold text-slate-900">No folders yet</Text>
              <Text className="text-center text-sm text-slate-500">
                Create a folder to group related decks together.
              </Text>
              <View className="mt-2 w-full">
                <Button onPress={() => setCreateOpen(true)}>Create your first folder</Button>
              </View>
            </Card>
          )}
        </View>
      </ScrollView>

      <FolderModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        mode={{ kind: 'create' }}
        onSubmit={(values) => createFolder.mutate(values as FolderCreateInput)}
        isPending={createFolder.isPending}
      />

      {editing ? (
        <FolderModal
          visible
          onClose={() => setEditingId(null)}
          mode={{
            kind: 'edit',
            folder: {
              id: editing.id,
              name: editing.name,
              color: editing.color,
              description: editing.description,
            },
          }}
          onSubmit={(values) =>
            updateFolder.mutate({ id: editing.id, ...values } as FolderUpdateInput)
          }
          isPending={updateFolder.isPending}
        />
      ) : null}
    </View>
  );
}
