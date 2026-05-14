import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { WORD_CLASS_OPTIONS } from '@ensemble/types';

import { trpc } from '../lib/trpc';
import { Button } from './Button';
import { Card } from './Card';
import { PlayModeToggle, type PlayMode } from '../features/practice/PlayModeToggle';

interface PracticeFiltersModalProps {
  visible: boolean;
  onClose: () => void;
  /**
   * When provided the modal is scoped to a single deck: the Categories filter
   * is hidden and the practice session is pre-filtered to this deck's cards.
   * Used from the Deck detail screen's Play button.
   */
  categoryId?: string;
}

/**
 * A bottom-sheet modal containing the Practice Filters panel.
 *
 * - Home screen (no categoryId): shows all filters including Categories,
 *   routes to /all-cards-practice.
 * - Deck detail screen (categoryId set): hides the Categories filter (the
 *   deck is already implicit), routes to /all-cards-practice with the deck
 *   pre-locked via categoryIds param.
 */
export function PracticeFiltersModal({ visible, onClose, categoryId }: PracticeFiltersModalProps) {
  const router = useRouter();
  const deckMode = Boolean(categoryId);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedRatings, setSelectedRatings] = useState<string[]>([]);
  const [playMode, setPlayMode] = useState<PlayMode>('in_order');

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleClass(value: string) {
    setSelectedClasses((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
  }

  function toggleRating(value: string) {
    setSelectedRatings((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
  }

  function resetFilters() {
    setSelectedCategoryIds([]);
    setSelectedClasses([]);
    setSelectedRatings([]);
  }

  // ── Data queries ──────────────────────────────────────────────────────────
  // In deck mode we fetch only the deck's cards; otherwise all cards.
  const categoriesQuery = trpc.categories.list.useQuery(undefined, { enabled: !deckMode });
  const allCardsQuery = trpc.flashcards.listAll.useQuery(undefined, { enabled: !deckMode });
  const deckCardsQuery = trpc.flashcards.listByCategory.useQuery(
    { categoryId: categoryId ?? '' },
    { enabled: deckMode },
  );

  const baseCards = deckMode
    ? (deckCardsQuery.data ?? [])
    : (allCardsQuery.data ?? []);

  const filteredCards = useMemo(() => {
    let result = baseCards;
    // In deck mode the category is already implicit — skip category filter.
    if (!deckMode && selectedCategoryIds.length > 0) {
      result = result.filter((c) => c.categoryId && selectedCategoryIds.includes(c.categoryId));
    }
    if (selectedClasses.length > 0) {
      result = result.filter((c) => c.class && selectedClasses.includes(c.class));
    }
    if (selectedRatings.length > 0) {
      result = result.filter((c) => {
        const level = (c as { difficultyLevel?: string | null }).difficultyLevel ?? null;
        if (selectedRatings.includes('no_rating') && level === null) return true;
        return level !== null && selectedRatings.includes(level);
      });
    }
    return result;
  }, [baseCards, deckMode, selectedCategoryIds, selectedClasses, selectedRatings]);

  const hasActiveFilters =
    (!deckMode && selectedCategoryIds.length > 0) ||
    selectedClasses.length > 0 ||
    selectedRatings.length > 0;

  const practiceCountLabel = hasActiveFilters
    ? filteredCards.length > 0
      ? ` (${filteredCards.length})`
      : ''
    : baseCards.length > 0
      ? ` (${baseCards.length})`
      : '';

  function navigateToPractice() {
    const params = new URLSearchParams();

    if (deckMode && categoryId) {
      // Lock to this deck's cards.
      params.set('categoryIds', categoryId);
    } else if (selectedCategoryIds.length > 0) {
      params.set('categoryIds', selectedCategoryIds.join(','));
    }

    if (selectedClasses.length > 0) {
      params.set('classes', selectedClasses.join(','));
    }
    if (selectedRatings.length > 0) {
      params.set('difficultyLevels', selectedRatings.join(','));
    }
    if (playMode === 'shuffle') {
      params.set('shuffle', '1');
    }
    const qs = params.toString();
    onClose();
    router.push((qs ? `/all-cards-practice?${qs}` : '/all-cards-practice') as never);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-slate-50">
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-slate-200 bg-white px-4 py-4">
          <Text className="text-lg font-semibold text-slate-900">Play</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <View className="h-8 w-8 items-center justify-center rounded-full bg-slate-100">
              <X size={18} color="#475569" />
            </View>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {/* Practice filter panel */}
          <Card className="gap-4 p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-slate-700">Play filters</Text>
              {hasActiveFilters && (
                <Pressable onPress={resetFilters} hitSlop={8}>
                  <Text className="text-xs font-medium text-blue-500">Reset</Text>
                </Pressable>
              )}
            </View>

            {/* Categories — hidden in deck mode (scope is already implicit) */}
            {!deckMode && (categoriesQuery.data?.length ?? 0) > 0 && (
              <View className="gap-1.5">
                <Text className="text-xs text-slate-500">Categories</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-1.5">
                    {categoriesQuery.data!.map((cat) => {
                      const selected = selectedCategoryIds.includes(cat.id);
                      return (
                        <Pressable
                          key={cat.id}
                          onPress={() => toggleCategory(cat.id)}
                          className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${
                            selected ? 'bg-blue-500' : 'bg-slate-100'
                          }`}
                        >
                          <View
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: cat.color ?? '#94a3b8' }}
                          />
                          <Text
                            className={`text-xs font-medium ${
                              selected ? 'text-white' : 'text-slate-600'
                            }`}
                          >
                            {cat.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Word classes */}
            <View className="gap-1.5">
              <Text className="text-xs text-slate-500">Word class</Text>
              <View className="flex-row flex-wrap gap-1.5">
                {WORD_CLASS_OPTIONS.map((cls) => {
                  const selected = selectedClasses.includes(cls.value);
                  return (
                    <Pressable
                      key={cls.value}
                      onPress={() => toggleClass(cls.value)}
                      className={`rounded-full px-3 py-1.5 ${
                        selected ? 'bg-blue-500' : 'bg-slate-100'
                      }`}
                    >
                      <Text
                        className={`text-xs font-medium ${
                          selected ? 'text-white' : 'text-slate-600'
                        }`}
                      >
                        {cls.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Rating */}
            <View className="gap-1.5">
              <Text className="text-xs text-slate-500">Rating</Text>
              <View className="flex-row flex-wrap gap-1.5">
                {(
                  [
                    { value: 'easy', label: 'Easy' },
                    { value: 'good', label: 'Good' },
                    { value: 'challenging', label: 'Challenging' },
                    { value: 'no_rating', label: 'No rating' },
                  ] as const
                ).map((opt) => {
                  const selected = selectedRatings.includes(opt.value);
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => toggleRating(opt.value)}
                      className={`rounded-full px-3 py-1.5 ${
                        selected ? 'bg-blue-500' : 'bg-slate-100'
                      }`}
                    >
                      <Text
                        className={`text-xs font-medium ${
                          selected ? 'text-white' : 'text-slate-600'
                        }`}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Play order */}
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Play order
              </Text>
              <PlayModeToggle value={playMode} onChange={setPlayMode} />
            </View>

            <Button onPress={navigateToPractice}>{`Play${practiceCountLabel}`}</Button>
          </Card>
        </ScrollView>
      </View>
    </Modal>
  );
}
