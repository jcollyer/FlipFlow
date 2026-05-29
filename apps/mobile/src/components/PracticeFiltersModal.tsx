import { useRouter } from 'expo-router';
import { Check, ChevronDown, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import {
  ADVANCED_DIFFICULTY_LEVEL_OPTIONS,
  WORD_CLASS_OPTIONS,
  decodeAdvancedDifficultyLevels,
} from '@ensemble/types';

import { trpc } from '../lib/trpc';
import { Button } from './Button';
import { Card } from './Card';
import {
  FavoriteToggle,
  favoriteFilterFromArray,
  favoriteFilterToArray,
} from '../features/practice/FavoriteToggle';
import { PlayModeToggle, type PlayMode } from '../features/practice/PlayModeToggle';
import { RatingModeToggle, type RatingMode } from '../features/practice/RatingModeToggle';

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
  const [deckDropdownOpen, setDeckDropdownOpen] = useState(false);
  const [classSectionOpen, setClassSectionOpen] = useState(false);
  const [ratingMode, setRatingMode] = useState<RatingMode>('basic');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedRatings, setSelectedRatings] = useState<string[]>([]);
  const [selectedAdvancedRatings, setSelectedAdvancedRatings] = useState<string[]>([]);
  const [selectedFavorites, setSelectedFavorites] = useState<string[]>([]);
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

  function toggleAdvancedRating(value: string) {
    setSelectedAdvancedRatings((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
  }

  function handleRatingModeChange(next: RatingMode) {
    setRatingMode(next);
    if (next === 'basic') {
      setSelectedAdvancedRatings([]);
    } else {
      setSelectedRatings([]);
    }
  }

  function resetFilters() {
    setSelectedCategoryIds([]);
    setSelectedClasses([]);
    setSelectedRatings([]);
    setSelectedAdvancedRatings([]);
    setRatingMode('basic');
    setSelectedFavorites([]);
  }

  // ── Data queries ──────────────────────────────────────────────────────────
  // In deck mode we fetch only the deck's cards; otherwise all cards.
  const categoriesQuery = trpc.categories.list.useQuery(undefined, { enabled: !deckMode });
  const allCardsQuery = trpc.flashcards.listAll.useQuery(undefined, { enabled: !deckMode });
  const deckCardsQuery = trpc.flashcards.listByCategory.useQuery(
    { categoryId: categoryId ?? '' },
    { enabled: deckMode },
  );

  const baseCards = deckMode ? (deckCardsQuery.data ?? []) : (allCardsQuery.data ?? []);

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
    if (selectedAdvancedRatings.length > 0) {
      result = result.filter((c) => {
        const raw =
          (c as { advancedDifficultyLevel?: string | null }).advancedDifficultyLevel ?? null;
        const tokens = decodeAdvancedDifficultyLevels(raw);
        if (selectedAdvancedRatings.includes('no_rating') && tokens.length === 0) return true;
        return tokens.some((t) => selectedAdvancedRatings.includes(t));
      });
    }
    if (selectedFavorites.length > 0) {
      const wantFav = selectedFavorites.includes('favorite');
      const wantNotFav = selectedFavorites.includes('not_favorite');
      if (wantFav !== wantNotFav) {
        result = result.filter((c) => {
          const fav = (c as { favorite?: boolean }).favorite ?? false;
          return wantFav ? fav : !fav;
        });
      }
    }
    return result;
  }, [
    baseCards,
    deckMode,
    selectedCategoryIds,
    selectedClasses,
    selectedRatings,
    selectedAdvancedRatings,
    selectedFavorites,
  ]);

  const hasActiveFilters =
    (!deckMode && selectedCategoryIds.length > 0) ||
    selectedClasses.length > 0 ||
    selectedRatings.length > 0 ||
    selectedAdvancedRatings.length > 0 ||
    selectedFavorites.length > 0;

  const practiceCountLabel = hasActiveFilters
    ? filteredCards.length > 0
      ? ` (${filteredCards.length})`
      : ''
    : baseCards.length > 0
      ? ` (${baseCards.length})`
      : '';

  const deckSummaryLabel = useMemo(() => {
    if (selectedCategoryIds.length === 0) return 'All decks';
    if (selectedCategoryIds.length === 1) {
      return (
        categoriesQuery.data?.find((cat) => cat.id === selectedCategoryIds[0])?.name ?? '1 deck'
      );
    }
    return `${selectedCategoryIds.length} decks selected`;
  }, [categoriesQuery.data, selectedCategoryIds]);

  const classSummaryLabel = useMemo(() => {
    if (selectedClasses.length === 0) return 'All word classes';
    if (selectedClasses.length === 1) {
      return (
        WORD_CLASS_OPTIONS.find((cls) => cls.value === selectedClasses[0])?.label ?? '1 word class'
      );
    }
    return `${selectedClasses.length} word classes selected`;
  }, [selectedClasses]);

  function navigateToPractice() {
    const params = new URLSearchParams();

    if (deckMode && categoryId) {
      // Lock to this deck's cards. Use the singular `categoryId` param so the
      // server's `practice.queue` runs the single-deck branch, which is the
      // only branch a guest is allowed to hit (and which resolves public-deck
      // visibility correctly). Passing `categoryIds` for a single-deck play
      // routes through the multi-deck branch, which 401s for guests.
      params.set('categoryId', categoryId);
      // Signal that the user entered practice from a deck detail page so the
      // completion view can show "Back to deck" and navigate back correctly.
      params.set('origin', 'deck');
    } else {
      if (selectedCategoryIds.length > 0) {
        params.set('categoryIds', selectedCategoryIds.join(','));
      }
      // Signal that the user entered practice from the home page so the
      // completion view can show "Back to home".
      params.set('origin', 'home');
    }

    if (selectedClasses.length > 0) {
      params.set('classes', selectedClasses.join(','));
    }
    if (selectedRatings.length > 0) {
      params.set('difficultyLevels', selectedRatings.join(','));
    }
    if (selectedAdvancedRatings.length > 0) {
      params.set('advancedDifficultyLevels', selectedAdvancedRatings.join(','));
    }
    if (selectedFavorites.length > 0) {
      params.set('favorites', selectedFavorites.join(','));
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
        <View className="flex-row items-center justify-between border-b border-slate-200 bg-white px-4 pb-4 pt-6">
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

            {/* Decks — hidden in deck mode (scope is already implicit) */}
            {!deckMode && (categoriesQuery.data?.length ?? 0) > 0 && (
              <View className="gap-1.5">
                <Text className="text-xs text-slate-500">Decks</Text>
                <Pressable
                  onPress={() => setDeckDropdownOpen((open) => !open)}
                  accessibilityRole="button"
                  accessibilityLabel="Select decks"
                  className="flex-row items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 active:opacity-80"
                >
                  <Text
                    numberOfLines={1}
                    className={`${selectedCategoryIds.length > 0 ? 'text-slate-900' : 'text-slate-500'} flex-1 pr-3 text-sm`}
                  >
                    {deckSummaryLabel}
                  </Text>
                  <ChevronDown
                    size={18}
                    color="#94a3b8"
                    style={{ transform: [{ rotate: deckDropdownOpen ? '180deg' : '0deg' }] }}
                  />
                </Pressable>

                {deckDropdownOpen && (
                  <View className="max-h-56 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <ScrollView nestedScrollEnabled>
                      {categoriesQuery.data!.map((cat, index) => {
                        const selected = selectedCategoryIds.includes(cat.id);
                        return (
                          <Pressable
                            key={cat.id}
                            onPress={() => toggleCategory(cat.id)}
                            className={`flex-row items-center justify-between px-4 py-3 ${
                              index < categoriesQuery.data!.length - 1
                                ? 'border-b border-slate-100'
                                : ''
                            }`}
                          >
                            <View className="flex-1 flex-row items-center gap-3 pr-3">
                              <View
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: cat.color ?? '#94a3b8' }}
                              />
                              <Text className="text-sm text-slate-900">{cat.name}</Text>
                            </View>
                            {selected ? <Check size={18} color="#5584bb" /> : null}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            {/* Word classes */}
            <View className="gap-1.5">
              <View className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <Pressable
                  onPress={() => setClassSectionOpen((open) => !open)}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle word class filters"
                  className="flex-row items-center justify-between px-4 py-3 active:opacity-80"
                >
                  <View className="flex-1 pr-3">
                    <Text className="text-xs text-slate-500">Word class</Text>
                    <Text numberOfLines={1} className="mt-1 text-sm text-slate-900">
                      {classSummaryLabel}
                    </Text>
                  </View>
                  <ChevronDown
                    size={18}
                    color="#94a3b8"
                    style={{ transform: [{ rotate: classSectionOpen ? '180deg' : '0deg' }] }}
                  />
                </Pressable>

                {classSectionOpen && (
                  <View className="border-t border-slate-100 px-4 py-3">
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
                )}
              </View>
            </View>

            <View className="gap-1.5">
              <RatingModeToggle value={ratingMode} onChange={handleRatingModeChange} />

              {ratingMode === 'basic' ? (
                <View className="gap-1.5">
                  <Text className="text-xs ml-1 text-slate-500">Rating</Text>
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
              ) : (
                <View className="gap-1.5">
                  <Text className="text-xs ml-1 text-slate-500">Advanced Rating</Text>
                  {(() => {
                    const opts = [
                      ...ADVANCED_DIFFICULTY_LEVEL_OPTIONS.map((o) => ({
                        value: o.value as string,
                        label: o.label,
                      })),
                      { value: 'no_rating', label: 'No rating' },
                    ];
                    const half = Math.ceil(opts.length / 2);
                    return [opts.slice(0, half), opts.slice(half)].map((row, rowIdx) => (
                      <View key={rowIdx} className="flex-row flex-wrap gap-1.5">
                        {row.map((opt) => {
                          const selected = selectedAdvancedRatings.includes(opt.value);
                          return (
                            <Pressable
                              key={opt.value}
                              onPress={() => toggleAdvancedRating(opt.value)}
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
                    ));
                  })()}
                </View>
              )}
            </View>

            {/* Favorite — segmented "All / Favorite / Not favorite" toggle,
                placed directly below Advanced Rating per spec. Styled to
                match PlayModeToggle so the modal's controls read as a
                consistent set. No section label by design. */}
            <FavoriteToggle
              value={favoriteFilterFromArray(selectedFavorites)}
              onChange={(next) => setSelectedFavorites(favoriteFilterToArray(next))}
            />

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
