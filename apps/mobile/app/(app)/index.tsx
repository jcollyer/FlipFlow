import { Link, useRouter } from 'expo-router';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FolderPlus,
  FolderTree,
  GalleryHorizontalEnd,
  Heart,
  Layers,
  LogOut,
  Play,
  Plus,
  Settings,
  Users,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '../../src/lib/AuthContext';
import { API_URL } from '../../src/lib/config';
import { trpc } from '../../src/lib/trpc';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { FolderModal } from '../../src/components/FolderModal';
import { GroupModal } from '../../src/components/GroupModal';
import { PracticeFiltersModal } from '../../src/components/PracticeFiltersModal';
import { Stat } from '../../src/components/Stat';
import { GuestLibraryScreen } from '../../src/features/library/GuestLibraryScreen';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape returned by trpc.categories.list */
type CategoryItem = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  cardCount: number;
};

/** Shape returned by trpc.folders.list */
type FolderItem = {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  includedCategoryIds: string[];
  deckCount: number;
};

type GroupDeckItem = {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  cardCount: number;
  isYours: boolean;
};

type GroupItem = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  isOwner: boolean;
  deckCount: number;
  includedDecks: GroupDeckItem[];
};

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

/**
 * Home screen entry point. Branches on session: guests see the public deck
 * library (no protected queries fire), signed-in users see the existing
 * folders / groups dashboard. Keeping the dispatch at the top of the file
 * means the signed-in path below is unchanged and the protected tRPC hooks
 * (auth.me, categories.list, etc.) never mount for an unauthenticated user.
 */
export default function HomeScreenEntry() {
  const { isGuest } = useAuth();
  if (isGuest) return <GuestLibraryScreen />;
  return <SignedInHomeScreen />;
}

/**
 * Signed-in home screen — shows the user's folders as collapsible drawers.
 * Each drawer contains the decks that belong to that folder.
 * Tapping a deck navigates to its detail page.
 *
 * Layout:
 *   ┌─────────────────────────────┐
 *   │  Header (title, sign out)   │
 *   │  Public decks shortcut      │
 *   │  Folders section (drawers)  │
 *   └─────────────────────────────┘
 *   [+ New card]  [+ New Folder]  [+ New deck]  ← floating buttons
 */
function SignedInHomeScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const utils = trpc.useUtils();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { data: me } = trpc.auth.me.useQuery();

  // Still needed so FolderDrawer can resolve deck names/descriptions/cardCounts.
  const { data: categories, isLoading, refetch, isRefetching } = trpc.categories.list.useQuery();
  const { data: folders, refetch: refetchFolders } = trpc.folders.list.useQuery();
  const { data: groups, refetch: refetchGroups } = trpc.groups.list.useQuery();
  // Global stats across all decks — same query AllDecksEntry used.
  const { data: stats, refetch: refetchStats } = trpc.practice.stats.useQuery({});
  // Favorited cards across all decks. Powers the optional Favorites shortcut,
  // which is hidden when the user has no favorites yet.
  const { data: favorites } = trpc.flashcards.listFavorites.useQuery();
  const favoritesCount = favorites?.length ?? 0;

  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [practiceFiltersOpen, setPracticeFiltersOpen] = useState(false);

  // Derive initials from the user's name (or fall back to email).
  const userInitials = (() => {
    const source = me?.name ?? me?.email ?? '';
    const parts = source.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  })();

  // O(1) lookup for deck details used inside each FolderDrawer.
  const categoryById = new Map<string, CategoryItem>((categories ?? []).map((c) => [c.id, c]));

  const hasFolders = (folders?.length ?? 0) > 0;
  const hasGroups = (groups?.length ?? 0) > 0;

  // --- Mutations -----------------------------------------------------------

  const createFolder = trpc.folders.create.useMutation({
    onSuccess: () => {
      utils.folders.list.invalidate();
      setCreateFolderOpen(false);
    },
    onError: (err) => Alert.alert('Could not create folder', err.message),
  });

  const createGroup = trpc.groups.create.useMutation({
    onSuccess: async () => {
      await utils.groups.list.invalidate();
      setCreateGroupOpen(false);
      router.push('/groups');
    },
    onError: (err) => Alert.alert('Could not create group', err.message),
  });

  // --- Callbacks -----------------------------------------------------------

  const onRefresh = useCallback(() => {
    utils.categories.list.invalidate();
    utils.folders.list.invalidate();
    utils.groups.list.invalidate();
    utils.practice.stats.invalidate();
    utils.flashcards.listFavorites.invalidate();
    refetch();
    refetchFolders();
    refetchGroups();
    refetchStats();
  }, [utils, refetch, refetchFolders, refetchGroups, refetchStats]);

  function toggleFolder(id: string) {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(id: string) {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/');
        },
      },
    ]);
  }

  // --- Loading state -------------------------------------------------------

  if (isLoading && !categories) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        {/* TEMP DEBUG: shows which API_URL the build is using. Remove before release. */}
        <Text style={{ position: 'absolute', top: 8 }}>{API_URL}</Text>
        <ActivityIndicator size="large" color="#5584bb" />
      </View>
    );
  }

  // --- Render --------------------------------------------------------------

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 240 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor="#5584bb" />
        }
      >
        {/* Title row */}
        <View className="mb-4 flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-bold text-slate-900">Your Flashcards</Text>
            <Text className="text-sm text-slate-500">Play with spaced repetition.</Text>
          </View>
          {/* User avatar / initials button */}
          <Pressable onPress={() => setUserMenuOpen(true)} hitSlop={8}>
            <View className="h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-slate-200">
              {me?.image ? (
                <Image
                  source={{ uri: me.image }}
                  style={{ width: 36, height: 36, borderRadius: 18 }}
                />
              ) : (
                <Text className="text-sm font-semibold text-slate-600">{userInitials}</Text>
              )}
            </View>
          </Pressable>

          {/* User menu modal */}
          <Modal
            visible={userMenuOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setUserMenuOpen(false)}
          >
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }}
              activeOpacity={1}
              onPress={() => setUserMenuOpen(false)}
            >
              <View
                style={{
                  position: 'absolute',
                  top: 80,
                  right: 16,
                  minWidth: 200,
                  backgroundColor: '#ffffff',
                  borderRadius: 12,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.15,
                  shadowRadius: 12,
                  elevation: 8,
                  overflow: 'hidden',
                }}
              >
                {/* User info header */}
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: '#e2e8f0',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      {me?.image ? (
                        <Image
                          source={{ uri: me.image }}
                          style={{ width: 36, height: 36, borderRadius: 18 }}
                        />
                      ) : (
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#475569' }}>
                          {userInitials}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      {me?.name ? (
                        <Text
                          style={{ fontSize: 14, fontWeight: '600', color: '#0f172a' }}
                          numberOfLines={1}
                        >
                          {me.name}
                        </Text>
                      ) : null}
                      {me?.email ? (
                        <Text style={{ fontSize: 12, color: '#64748b' }} numberOfLines={1}>
                          {me.email}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>

                {/* Settings option */}
                <Pressable
                  onPress={() => {
                    setUserMenuOpen(false);
                    router.push('/settings');
                  }}
                >
                  {({ pressed }) => (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: '#e2e8f0',
                        backgroundColor: pressed ? '#f8fafc' : '#ffffff',
                      }}
                    >
                      <Settings size={16} color="#475569" style={{ marginRight: 10 }} />
                      <Text style={{ fontSize: 14, fontWeight: '500', color: '#0f172a' }}>
                        Settings
                      </Text>
                    </View>
                  )}
                </Pressable>

                {/* Sign out option */}
                <Pressable
                  onPress={() => {
                    setUserMenuOpen(false);
                    confirmSignOut();
                  }}
                >
                  {({ pressed }) => (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        backgroundColor: pressed ? '#f8fafc' : '#ffffff',
                      }}
                    >
                      <LogOut size={16} color="#ef4444" style={{ marginRight: 10 }} />
                      <Text style={{ fontSize: 14, fontWeight: '500', color: '#ef4444' }}>
                        Sign out
                      </Text>
                    </View>
                  )}
                </Pressable>
              </View>
            </TouchableOpacity>
          </Modal>
        </View>

        {/* Global stats — mirrors the 4-box row on the deck detail page */}
        <View className="mb-4 flex-row gap-2">
          <Stat label="Total" value={stats?.total ?? 0} tone="slate" />
          <Stat
            label="Challenging"
            value={stats?.difficultyBreakdown?.challenging ?? 0}
            tone="amber"
          />
          <Stat label="Good" value={stats?.difficultyBreakdown?.good ?? 0} tone="blue" />
          <Stat label="Easy" value={stats?.difficultyBreakdown?.easy ?? 0} tone="green" />
        </View>

        {/* Favorites shortcut — only when the user has favorited cards */}
        {favoritesCount > 0 ? (
          <Pressable
            onPress={() => router.push('/favorites' as never)}
            className="mb-4 active:opacity-70"
          >
            <Card className="flex-row items-center gap-3 p-4">
              <View className="h-10 w-10 shrink-0 items-center justify-center rounded-md bg-rose-100">
                <Heart size={20} color="#e11d48" fill="#e11d48" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-slate-900">Favorites</Text>
                <Text className="mt-0.5 text-xs text-slate-500">
                  {favoritesCount} {favoritesCount === 1 ? 'card' : 'cards'} across your decks
                </Text>
              </View>
              <ChevronRight size={18} color="#cbd5e1" />
            </Card>
          </Pressable>
        ) : null}

        <View className="gap-6">
          {/* Folders section */}
          {hasFolders ? (
            <View className="gap-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Folders
                </Text>
                <Pressable onPress={() => router.push('/folders')} hitSlop={8}>
                  <Text className="text-primary text-sm font-medium">All folders</Text>
                </Pressable>
              </View>
              {(folders ?? []).map((folder) => (
                <FolderDrawer
                  key={folder.id}
                  folder={folder}
                  expanded={expandedFolderIds.has(folder.id)}
                  onToggle={() => toggleFolder(folder.id)}
                  categoryById={categoryById}
                />
              ))}
            </View>
          ) : (
            <Card className="items-center gap-3 border-dashed p-10">
              <View className="bg-primary/10 h-12 w-12 items-center justify-center rounded-full">
                <FolderTree size={22} color="#5584bb" />
              </View>
              <Text className="text-lg font-semibold text-slate-900">No folders yet</Text>
              <Text className="text-center text-sm text-slate-500">
                Create a folder to start organizing your decks.
              </Text>
              <View className="mt-2 w-full">
                <Button onPress={() => setCreateFolderOpen(true)}>Create your first folder</Button>
              </View>
            </Card>
          )}

          {/* Groups section */}
          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Groups
              </Text>
              {hasGroups ? (
                <Pressable onPress={() => router.push('/groups')} hitSlop={8}>
                  <Text className="text-primary text-sm font-medium">All groups</Text>
                </Pressable>
              ) : null}
            </View>

            {hasGroups ? (
              (groups ?? []).map((group) => (
                <GroupDrawer
                  key={group.id}
                  group={group}
                  expanded={expandedGroupIds.has(group.id)}
                  onToggle={() => toggleGroup(group.id)}
                  onManage={() => router.push(`/groups/${group.id}`)}
                />
              ))
            ) : (
              <Pressable onPress={() => router.push('/groups')} className="active:opacity-70">
                <Card className="gap-1 border-dashed p-4">
                  <View className="flex-row items-center gap-2">
                    <Users size={18} color="#5584bb" />
                    <Text className="text-base font-semibold text-slate-900">No groups yet</Text>
                  </View>
                  <Text className="text-sm text-slate-500">
                    Create a group to share decks with classmates, study partners, or anyone else.
                  </Text>
                </Card>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Floating action buttons */}
      <View
        className="absolute bottom-0 left-0 right-0 gap-2 bg-slate-50 px-4 pb-8 pt-3"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <Button size="lg" variant="outline" onPress={() => setCreateFolderOpen(true)}>
          <View className="flex-row items-center gap-2">
            <FolderPlus size={18} color="#0f172a" />
            <Text className="font-semibold text-slate-900">New Folder</Text>
          </View>
        </Button>
        <Button size="lg" variant="outline" onPress={() => router.push('/new-deck')}>
          <View className="flex-row items-center gap-2">
            <Plus size={18} color="#0f172a" />
            <Text className="font-semibold text-slate-900">New Deck</Text>
          </View>
        </Button>
        <Button size="lg" onPress={() => setPracticeFiltersOpen(true)}>
          <View className="flex-row items-center gap-2">
            <Play size={18} color="#ffffff" fill="#ffffff" />
            <Text className="font-semibold text-white">Play</Text>
          </View>
        </Button>
      </View>

      {/* Create-folder modal */}
      <FolderModal
        visible={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        mode={{ kind: 'create' }}
        onSubmit={(values) => createFolder.mutate(values)}
        isPending={createFolder.isPending}
      />

      <GroupModal
        visible={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        mode={{ kind: 'create' }}
        onSubmit={(values) =>
          createGroup.mutate(
            values as {
              name: string;
              color: string | null;
              description: string | null;
            },
          )
        }
        isPending={createGroup.isPending}
      />

      {/* Practice filters modal — opened from the Play button */}
      <PracticeFiltersModal
        visible={practiceFiltersOpen}
        onClose={() => setPracticeFiltersOpen(false)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// FolderDrawer
// ---------------------------------------------------------------------------

interface FolderDrawerProps {
  folder: FolderItem;
  expanded: boolean;
  onToggle: () => void;
  /** Fast O(1) deck-detail lookup built from trpc.categories.list data. */
  categoryById: Map<string, CategoryItem>;
}

interface GroupDrawerProps {
  group: GroupItem;
  expanded: boolean;
  onToggle: () => void;
  onManage: () => void;
}

/**
 * Collapsible folder row. The header shows the folder colour, name,
 * description (if set), and the deck count with a stack icon. Tapping the
 * header toggles an inline list of the decks that belong to the folder;
 * tapping a deck navigates to its detail page.
 */
function FolderDrawer({ folder, expanded, onToggle, categoryById }: FolderDrawerProps) {
  const decks = folder.includedCategoryIds
    .map((id) => categoryById.get(id))
    .filter((c): c is CategoryItem => Boolean(c));

  return (
    <Card className="overflow-hidden">
      {/* Folder header — tap to expand/collapse */}
      <Pressable onPress={onToggle} className="active:opacity-70">
        <View className="flex-row items-center gap-3 p-4">
          {/* Color swatch */}
          <View
            className="h-10 w-10 shrink-0 rounded-md"
            style={{ backgroundColor: folder.color ?? '#94a3b8' }}
          />

          {/* Name + description */}
          <View className="flex-1">
            <Text className="text-lg font-semibold text-slate-900" numberOfLines={1}>
              {folder.name}
            </Text>
            {folder.description ? (
              <Text className="mt-0.5 text-xs text-slate-500" numberOfLines={1}>
                {folder.description}
              </Text>
            ) : null}
          </View>

          {/* Deck count + expand/collapse chevron */}
          <View className="items-end gap-1.5">
            <View className="flex-row items-center gap-1">
              <Layers size={13} color="#94a3b8" />
              <Text className="text-sm text-slate-500">
                {folder.deckCount} {folder.deckCount === 1 ? 'deck' : 'decks'}
              </Text>
            </View>
            {expanded ? (
              <ChevronUp size={16} color="#94a3b8" />
            ) : (
              <ChevronDown size={16} color="#94a3b8" />
            )}
          </View>
        </View>
      </Pressable>

      {/* Expanded deck list */}
      {expanded ? (
        <View className="border-border border-t">
          {decks.length === 0 ? (
            <View className="items-center gap-2 px-4 py-6">
              <Text className="text-sm text-slate-400">No decks in this folder yet.</Text>
              <Link href={`/new-deck?folderId=${folder.id}`} asChild>
                <Pressable className="flex-row items-center gap-1 active:opacity-70">
                  <Plus size={14} color="#3b82f6" />
                  <Text className="text-sm font-medium text-blue-500">Create first deck</Text>
                </Pressable>
              </Link>
            </View>
          ) : (
            decks.map((deck, index) => (
              <Link key={deck.id} href={`/decks/${deck.id}`} asChild>
                <Pressable
                  className="active:bg-slate-50"
                  style={index > 0 ? { borderTopWidth: 1, borderTopColor: '#e2e8f0' } : undefined}
                >
                  <View className="flex-row items-center gap-3 px-4 py-3">
                    <View
                      className="h-8 w-8 shrink-0 rounded-sm"
                      style={{ backgroundColor: deck.color ?? '#94a3b8' }}
                    />
                    <View className="flex-1">
                      <Text className="text-base font-medium text-slate-900" numberOfLines={1}>
                        {deck.name}
                      </Text>
                      {deck.description ? (
                        <Text className="mt-0.5 text-xs text-slate-500" numberOfLines={1}>
                          {deck.description}
                        </Text>
                      ) : null}
                      <View className="mt-0.5 flex-row items-center gap-1">
                        <GalleryHorizontalEnd size={11} color="#94a3b8" />
                        <Text className="text-xs text-slate-500">
                          {deck.cardCount} {deck.cardCount === 1 ? 'card' : 'cards'}
                        </Text>
                      </View>
                    </View>
                    <ChevronRight size={18} color="#cbd5e1" />
                  </View>
                </Pressable>
              </Link>
            ))
          )}
        </View>
      ) : null}
    </Card>
  );
}

function GroupDrawer({ group, expanded, onToggle, onManage }: GroupDrawerProps) {
  return (
    <Card className="overflow-hidden">
      <Pressable onPress={onToggle} className="active:opacity-70">
        <View className="flex-row items-center gap-3 p-4">
          <View
            className="h-10 w-10 shrink-0 rounded-md"
            style={{ backgroundColor: group.color ?? '#94a3b8' }}
          />

          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-lg font-semibold text-slate-900" numberOfLines={1}>
                {group.name}
              </Text>
              {group.isOwner ? (
                <Text className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Owner
                </Text>
              ) : null}
            </View>
            {group.description ? (
              <Text className="mt-0.5 text-xs text-slate-500" numberOfLines={1}>
                {group.description}
              </Text>
            ) : null}
          </View>

          <Pressable onPress={onManage} hitSlop={8} className="active:opacity-70">
            <Text className="text-primary text-sm font-medium">Manage</Text>
          </Pressable>

          <View className="items-end gap-1.5">
            <View className="flex-row items-center gap-1">
              <Layers size={13} color="#94a3b8" />
              <Text className="text-sm text-slate-500">
                {group.deckCount} {group.deckCount === 1 ? 'deck' : 'decks'}
              </Text>
            </View>
            {expanded ? (
              <ChevronUp size={16} color="#94a3b8" />
            ) : (
              <ChevronDown size={16} color="#94a3b8" />
            )}
          </View>
        </View>
      </Pressable>

      {expanded ? (
        <View className="border-border border-t">
          {group.includedDecks.length === 0 ? (
            <View className="px-4 py-3">
              <Text className="text-sm text-slate-400">No decks in this group yet.</Text>
            </View>
          ) : (
            group.includedDecks.map((deck, index) => (
              <Link key={deck.id} href={`/decks/${deck.id}`} asChild>
                <Pressable
                  className="active:bg-slate-50"
                  style={index > 0 ? { borderTopWidth: 1, borderTopColor: '#e2e8f0' } : undefined}
                >
                  <View className="flex-row items-center gap-3 px-4 py-3">
                    <View
                      className="h-8 w-8 shrink-0 rounded-sm"
                      style={{ backgroundColor: deck.color ?? '#94a3b8' }}
                    />
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-base font-medium text-slate-900" numberOfLines={1}>
                          {deck.name}
                        </Text>
                        {!deck.isYours ? (
                          <Text className="text-xs font-medium uppercase tracking-wide text-slate-400">
                            Shared
                          </Text>
                        ) : null}
                      </View>
                      {deck.description ? (
                        <Text className="mt-0.5 text-xs text-slate-500" numberOfLines={1}>
                          {deck.description}
                        </Text>
                      ) : null}
                      <View className="mt-0.5 flex-row items-center gap-1">
                        <GalleryHorizontalEnd size={11} color="#94a3b8" />
                        <Text className="text-xs text-slate-500">
                          {deck.cardCount} {deck.cardCount === 1 ? 'card' : 'cards'}
                        </Text>
                      </View>
                    </View>
                    <ChevronRight size={18} color="#cbd5e1" />
                  </View>
                </Pressable>
              </Link>
            ))
          )}
        </View>
      ) : null}
    </Card>
  );
}
