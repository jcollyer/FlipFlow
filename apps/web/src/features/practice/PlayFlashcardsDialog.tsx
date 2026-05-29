'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ChevronDown, Library, Play } from 'lucide-react';

import { WORD_CLASS_OPTIONS, decodeAdvancedDifficultyLevels } from '@ensemble/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { AdvancedRatingFilter } from '@/features/practice/AdvancedRatingFilter';
import {
  FavoriteToggle,
  favoriteFilterFromArray,
  favoriteFilterToArray,
} from '@/features/practice/FavoriteToggle';
import { PlayModeToggle, type PlayMode } from '@/features/practice/PlayModeToggle';
import { RatingModeToggle, type RatingMode } from '@/features/practice/RatingModeToggle';

const BASIC_RATING_OPTIONS = [
  { value: 'challenging', label: 'Challenging' },
  { value: 'good', label: 'Good' },
  { value: 'easy', label: 'Easy' },
  { value: 'no_rating', label: 'Not rated' },
] as const;

export interface PlayFlashcardsDialogCard {
  categoryId?: string | null;
  class?: string | null;
  difficultyLevel?: string | null;
  advancedDifficultyLevel?: string | null;
  favorite?: boolean | null;
}

export interface PlayFlashcardsDialogCategory {
  id: string;
  name: string;
  color?: string | null;
}

interface PlayFlashcardsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  practicePath: string;
  cards?: ReadonlyArray<PlayFlashcardsDialogCard> | null;
  categories?: ReadonlyArray<PlayFlashcardsDialogCategory> | null;
}

export function PlayFlashcardsDialog({
  open,
  onOpenChange,
  practicePath,
  cards,
  categories,
}: PlayFlashcardsDialogProps) {
  const router = useRouter();
  const [categorySectionOpen, setCategorySectionOpen] = useState(false);
  const [ratingMode, setRatingMode] = useState<RatingMode>('all');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedRatings, setSelectedRatings] = useState<string[]>([]);
  const [selectedAdvancedRatings, setSelectedAdvancedRatings] = useState<string[]>([]);
  const [selectedFavorites, setSelectedFavorites] = useState<string[]>([]);
  const [playMode, setPlayMode] = useState<PlayMode>('in_order');

  const availableCards = cards ?? [];
  const availableCategories = categories ?? [];
  const showDeckFilter = availableCategories.length > 0;

  function toggleValue(value: string, setValue: React.Dispatch<React.SetStateAction<string[]>>) {
    setValue((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
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
    setSelectedFavorites([]);
    setRatingMode('all');
    setPlayMode('in_order');
  }

  const hasFilters =
    selectedCategoryIds.length > 0 ||
    selectedClasses.length > 0 ||
    selectedRatings.length > 0 ||
    selectedAdvancedRatings.length > 0 ||
    selectedFavorites.length > 0;

  const filteredCount = useMemo(() => {
    if (!hasFilters) return availableCards.length;

    let result = [...availableCards];

    if (selectedCategoryIds.length > 0) {
      result = result.filter(
        (card) => card.categoryId && selectedCategoryIds.includes(card.categoryId),
      );
    }

    if (selectedClasses.length > 0) {
      result = result.filter((card) => card.class && selectedClasses.includes(card.class));
    }

    if (selectedRatings.length > 0) {
      result = result.filter((card) => {
        const level = card.difficultyLevel ?? null;
        if (selectedRatings.includes('no_rating') && level === null) return true;
        return level !== null && selectedRatings.includes(level);
      });
    }

    if (selectedAdvancedRatings.length > 0) {
      result = result.filter((card) => {
        const tokens = decodeAdvancedDifficultyLevels(card.advancedDifficultyLevel ?? null);
        if (selectedAdvancedRatings.includes('no_rating') && tokens.length === 0) return true;
        return tokens.some((token) => selectedAdvancedRatings.includes(token));
      });
    }

    if (selectedFavorites.length > 0) {
      const wantFavorite = selectedFavorites.includes('favorite');
      const wantNotFavorite = selectedFavorites.includes('not_favorite');
      if (wantFavorite !== wantNotFavorite) {
        result = result.filter((card) => {
          const isFavorite = card.favorite ?? false;
          return wantFavorite ? isFavorite : !isFavorite;
        });
      }
    }

    return result.length;
  }, [
    availableCards,
    hasFilters,
    selectedAdvancedRatings,
    selectedCategoryIds,
    selectedClasses,
    selectedFavorites,
    selectedRatings,
  ]);

  const deckLabel = useMemo(() => {
    if (selectedCategoryIds.length === 0) return 'All decks';
    if (selectedCategoryIds.length === 1) {
      return (
        availableCategories.find((category) => category.id === selectedCategoryIds[0])?.name ??
        '1 deck'
      );
    }
    return `${selectedCategoryIds.length} decks selected`;
  }, [availableCategories, selectedCategoryIds]);

  const classLabel = useMemo(() => {
    if (selectedClasses.length === 0) return 'All categories';
    if (selectedClasses.length === 1) {
      return (
        WORD_CLASS_OPTIONS.find((option) => option.value === selectedClasses[0])?.label ??
        '1 category'
      );
    }
    return `${selectedClasses.length} categories selected`;
  }, [selectedClasses]);

  function buildPracticeHref() {
    const params = new URLSearchParams();
    if (selectedCategoryIds.length > 0) params.set('categoryIds', selectedCategoryIds.join(','));
    if (selectedClasses.length > 0) params.set('classes', selectedClasses.join(','));
    if (selectedRatings.length > 0) params.set('difficultyLevels', selectedRatings.join(','));
    if (selectedAdvancedRatings.length > 0) {
      params.set('advancedDifficultyLevels', selectedAdvancedRatings.join(','));
    }
    if (selectedFavorites.length > 0) params.set('favorites', selectedFavorites.join(','));
    if (playMode === 'shuffle') params.set('shuffle', '1');

    const queryString = params.toString();
    return queryString ? `${practicePath}?${queryString}` : practicePath;
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) resetFilters();
  }

  function handlePlay() {
    onOpenChange(false);
    resetFilters();
    router.push(buildPracticeHref());
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-md"
            >
              <Library className="h-5 w-5" />
            </div>
            <DialogTitle className="text-xl">Play Flashcards</DialogTitle>
          </div>
          <DialogDescription className="pt-1">
            Choose none, one or multiple filter option to play a subset of your cards, or leave
            blank to play all.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Play filters</span>
            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
              >
                Reset
              </button>
            )}
          </div>

          {showDeckFilter && (
            <div className="space-y-2">
              <p className="text-muted-foreground ml-1 text-xs font-semibold tracking-[0.18em]">
                DECKS
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-between">
                    <span className="truncate">{deckLabel}</span>
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="max-h-72 w-[--radix-dropdown-menu-trigger-width] overflow-y-auto"
                >
                  <DropdownMenuLabel>Toggle decks</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {availableCategories.map((category) => {
                    const selected = selectedCategoryIds.includes(category.id);
                    return (
                      <DropdownMenuCheckboxItem
                        key={category.id}
                        checked={selected}
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={() => toggleValue(category.id, setSelectedCategoryIds)}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: category.color ?? '#94a3b8' }}
                          />
                          <span className="truncate">{category.name}</span>
                        </span>
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-muted-foreground ml-1 text-xs font-semibold tracking-[0.18em]">
              CATEGORY
            </p>
            <div className="bg-background overflow-hidden rounded-md border">
              <button
                type="button"
                onClick={() => setCategorySectionOpen((current) => !current)}
                className="flex w-full items-center justify-between px-3 py-2 text-left"
              >
                <p className="min-w-0 flex-1 truncate pr-3 text-sm">{classLabel}</p>
                <ChevronDown
                  className={cn(
                    'text-muted-foreground h-4 w-4 transition-transform',
                    categorySectionOpen && 'rotate-180',
                  )}
                />
              </button>

              {categorySectionOpen && (
                <div className="border-t px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    {WORD_CLASS_OPTIONS.map((option) => {
                      const selected = selectedClasses.includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggleValue(option.value, setSelectedClasses)}
                          className={cn(
                            'rounded-full px-3 py-1 text-sm font-medium transition',
                            selected
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/70',
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-muted-foreground ml-1 text-xs font-semibold tracking-[0.18em]">
              RATINGS
            </p>
            <RatingModeToggle value={ratingMode} onChange={handleRatingModeChange} />

            {ratingMode === 'basic' || ratingMode === 'advanced' ? (
              <div className="border-muted ml-1 mt-0 rounded-bl-xl border-b border-l bg-gradient-to-t to-white px-3 py-3">
                {ratingMode === 'basic' ? (
                  <div className="flex flex-wrap gap-2">
                    {BASIC_RATING_OPTIONS.map((option) => {
                      const selected = selectedRatings.includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggleValue(option.value, setSelectedRatings)}
                          className={cn(
                            'rounded-full px-3 py-1 text-sm font-medium transition',
                            selected
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/70',
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <AdvancedRatingFilter
                    selected={selectedAdvancedRatings}
                    onToggle={(value) => toggleValue(value, setSelectedAdvancedRatings)}
                  />
                )}
              </div>
            ) : null}
          </div>

          <div>
            <p className="text-muted-foreground mb-2 ml-1 text-xs font-semibold tracking-[0.18em]">
              FAVORITES
            </p>
            <FavoriteToggle
              value={favoriteFilterFromArray(selectedFavorites)}
              onChange={(next) => setSelectedFavorites(favoriteFilterToArray(next))}
            />
          </div>
        </div>

        <DialogFooter className="sm:items-center sm:justify-between">
          <div>
            <p className="text-muted-foreground mb-2 ml-1 text-xs font-semibold tracking-[0.18em]">
              PLAY ORDER
            </p>
            <PlayModeToggle value={playMode} onChange={setPlayMode} />
          </div>
          <Button onClick={handlePlay}>
            <Play className="h-4 w-4" />
            Play{filteredCount > 0 ? ` (${filteredCount})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
