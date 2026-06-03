import { useRouter } from 'expo-router';
import { Check, ChevronDown, Play, X } from 'lucide-react-native';
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
  /**
   * When true the Favorites filter is locked to "Favorite" and shown grayed
   * out. Used by the Favorites screen, where every card is already a favorite,
   * so the filter is fixed and flows through to the practice session.
   */
  lockFavorites?: boolean;
}

/**
 * A bottom-sheet modal containing the Practice Filters panel.
 *
 * - Home screen (no categoryId): shows all filters including Decks,
 *   routes to /all-cards-practice.
 * - Deck detail screen (categoryId set): hides the Decks filter (the
 *   deck is already implicit), routes to /all-cards-practice with the deck
 *   pre-locked via categoryIds param.
 */
export function PracticeFiltersModal({
  visible,
  onClose,
  categoryId,
  lockFavorites = false,
}: PracticeFiltersModalProps) {
  const router = useRouter();
  const deckMode = Boolean(categoryId);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [deckDropdownOpen, setDeckDropdownOpen] = useState(false);
  const [chooseCategoryMode, setChooseCategoryMode] = useState(false);
  const [ratingMode, setRatingMode] = useState<RatingMode>('all');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedRatings, setSelectedRatings] = useState<string[]>([]);
  const [selectedAdvancedRatings, setSelectedAdvancedRatings] = useState<string[]>([]);
  const [selectedFavorites, setSelectedFavorites] = useState<string[]>(
    lockFavorites ? ['favorite'] : [],
  );
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
    if (next === 'all') {
      setSelectedRatings([]);
      setSelectedAdvancedRatings([]);
      return;
    }
    if (next === 'basic') {
      setSelectedAdvancedRatings([]);
      return;
    }
    setSelectedRatings([]);
  }

  function resetFilters() {
    setSelectedCategoryIds([]);
    setSelectedClasses([]);
    setSelectedRatings([]);
    setSelectedAdvancedRatings([]);
    setRatingMode('all');
    setSelectedFavorites(lockFavorites ? ['favorite'] : []);
    setChooseCategoryMode(false);
    setPlayMode('in_order');
  }

  // ── Data queries ──────────────────────────────────────────────────────────
  const categoriesQuery = trpc.categories.list.useQuery(undefined, { enabled: !deckMode });
  const allCardsQuery = trpc.flashcards.listAll.useQuery(undefined, { enabled: !deckMode });
  const deckCardsQuery = trpc.flashcards.listByCategory.useQuery(
    { categoryId: categoryId ?? '' },
    { enabled: deckMode },
  );

  const baseCards = deckMode ? (deckCardsQuery.data ?? []) : (allCardsQuery.data ?? []);

  const filteredCards = useMemo(() => {
    let result = baseCards;
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

  const practiceCount = hasActiveFilters ? filteredCards.length : baseCards.length;

  const deckSummaryLabel = useMemo(() => {
    if (selectedCategoryIds.length === 0) return 'All decks';
    if (selectedCategoryIds.length === 1) {
      return (
        categoriesQuery.data?.find((cat) => cat.id === selectedCategoryIds[0])?.name ?? '1 deck'
      );
    }
    return `${selectedCategoryIds.length} decks selected`;
  }, [categoriesQuery.data, selectedCategoryIds]);

  function navigateToPractice() {
    const params = new URLSearchParams();

    if (deckMode && categoryId) {
      params.set('categoryId', categoryId);
      params.set('origin', 'deck');
    } else {
      if (selectedCategoryIds.length > 0) {
        params.set('categoryIds', selectedCategoryIds.join(','));
      }
      params.set('origin', 'home');
    }

    if (selectedClasses.length > 0) params.set('classes', selectedClasses.join(','));
    if (selectedRatings.length > 0) params.set('difficultyLevels', selectedRatings.join(','));
    if (selectedAdvancedRatings.length > 0) {
      params.set('advancedDifficultyLevels', selectedAdvancedRatings.join(','));
    }
    if (selectedFavorites.length > 0) params.set('favorites', selectedFavorites.join(','));
    if (playMode === 'shuffle') params.set('shuffle', '1');

    const qs = params.toString();
    onClose();
    router.push((qs ? `/all-cards-practice?${qs}` : '/all-cards-practice') as never);
  }

  // ── Shared styles ─────────────────────────────────────────────────────────
  const SECTION_LABEL = 'ml-1 text-xs font-semibold uppercase tracking-widest text-slate-500';
  const PILL_SELECTED = 'bg-blue-500';
  const PILL_DEFAULT = 'bg-slate-100';
  const PILL_TEXT_SELECTED = 'text-xs font-medium text-white';
  const PILL_TEXT_DEFAULT = 'text-xs font-medium text-slate-600';

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
          <Card className="gap-5 p-4">
            {/* Header row */}
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-slate-700">Play filters</Text>
              {hasActiveFilters && (
                <Pressable onPress={resetFilters} hitSlop={8}>
                  <Text className="text-xs font-medium text-blue-500">Reset</Text>
                </Pressable>
              )}
            </View>

            {/* ── DECKS ─────────────────────────────────────────────────── */}
            {!deckMode && (categoriesQuery.data?.length ?? 0) > 0 && (
              <View className="gap-2">
                <Text className={SECTION_LABEL}>Decks</Text>
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

            {/* ── CATEGORIES ────────────────────────────────────────────── */}
            <View className="gap-2">
              <Text className={SECTION_LABEL}>Categories</Text>
              {/* Segmented toggle */}
              <View
                accessibilityRole="radiogroup"
                className="flex-row items-center gap-0.5 self-start rounded-full bg-slate-100 p-0.5"
              >
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: !chooseCategoryMode }}
                  accessibilityLabel="All categories"
                  onPress={() => {
                    setChooseCategoryMode(false);
                    setSelectedClasses([]);
                  }}
                  className="rounded-full px-3 py-1.5"
                  style={
                    !chooseCategoryMode
                      ? [
                          { backgroundColor: '#ffffff' },
                          {
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.05,
                            shadowRadius: 2,
                            elevation: 1,
                          },
                        ]
                      : undefined
                  }
                >
                  <Text
                    className="text-xs font-medium"
                    style={{ color: !chooseCategoryMode ? '#0f172a' : '#64748b' }}
                  >
                    All categories
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: chooseCategoryMode }}
                  accessibilityLabel="Choose categories"
                  onPress={() => setChooseCategoryMode(true)}
                  className="rounded-full px-3 py-1.5"
                  style={
                    chooseCategoryMode
                      ? [
                          { backgroundColor: '#ffffff' },
                          {
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.05,
                            shadowRadius: 2,
                            elevation: 1,
                          },
                        ]
                      : undefined
                  }
                >
                  <Text
                    className="text-xs font-medium"
                    style={{ color: chooseCategoryMode ? '#0f172a' : '#64748b' }}
                  >
                    Choose categories
                  </Text>
                </Pressable>
              </View>

              {/* Category pills */}
              {chooseCategoryMode && (
                <View className="flex-row flex-wrap gap-1.5 pt-1">
                  {WORD_CLASS_OPTIONS.map((cls) => {
                    const selected = selectedClasses.includes(cls.value);
                    return (
                      <Pressable
                        key={cls.value}
                        onPress={() => toggleClass(cls.value)}
                        className={`rounded-full px-3 py-1.5 ${selected ? PILL_SELECTED : PILL_DEFAULT}`}
                      >
                        <Text className={selected ? PILL_TEXT_SELECTED : PILL_TEXT_DEFAULT}>
                          {cls.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            {/* ── RATINGS ───────────────────────────────────────────────── */}
            <View className="gap-2">
              <Text className={SECTION_LABEL}>Ratings</Text>
              <RatingModeToggle value={ratingMode} onChange={handleRatingModeChange} />

              {ratingMode === 'basic' && (
                <View className="flex-row flex-wrap gap-1.5 pt-1">
                  {(
                    [
                      { value: 'challenging', label: 'Challenging' },
                      { value: 'good', label: 'Good' },
                      { value: 'easy', label: 'Easy' },
                      { value: 'no_rating', label: 'Not rated' },
                    ] as const
                  ).map((opt) => {
                    const selected = selectedRatings.includes(opt.value);
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => toggleRating(opt.value)}
                        className={`rounded-full px-3 py-1.5 ${selected ? PILL_SELECTED : PILL_DEFAULT}`}
                      >
                        <Text className={selected ? PILL_TEXT_SELECTED : PILL_TEXT_DEFAULT}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {ratingMode === 'advanced' && (
                <View className="flex-row flex-wrap gap-1.5 pt-1">
                  {[
                    ...ADVANCED_DIFFICULTY_LEVEL_OPTIONS.map((o) => ({
                      value: o.value as string,
                      label: o.label,
                    })),
                    { value: 'no_rating', label: 'No rating' },
                  ].map((opt) => {
                    const selected = selectedAdvancedRatings.includes(opt.value);
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => toggleAdvancedRating(opt.value)}
                        className={`rounded-full px-3 py-1.5 ${selected ? PILL_SELECTED : PILL_DEFAULT}`}
                      >
                        <Text className={selected ? PILL_TEXT_SELECTED : PILL_TEXT_DEFAULT}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            {/* ── FAVORITES ─────────────────────────────────────────────── */}
            <View className="gap-2">
              <Text className={SECTION_LABEL}>Favorites</Text>
              <FavoriteToggle
                value={lockFavorites ? 'favorite' : favoriteFilterFromArray(selectedFavorites)}
                onChange={(next) => setSelectedFavorites(favoriteFilterToArray(next))}
                disabled={lockFavorites}
              />
            </View>

            {/* ── PLAY ORDER ────────────────────────────────────────────── */}
            <View className="gap-2">
              <Text className={SECTION_LABEL}>Play order</Text>
              <PlayModeToggle value={playMode} onChange={setPlayMode} />
            </View>

            <Button onPress={navigateToPractice} disabled={practiceCount === 0}>
              <Play size={14} color="#ffffff" style={{ marginRight: 6 }} />
              <Text className="text-sm font-semibold text-white">{`Play (${practiceCount})`}</Text>
            </Button>
          </Card>
        </ScrollView>
      </View>
    </Modal>
  );
}
