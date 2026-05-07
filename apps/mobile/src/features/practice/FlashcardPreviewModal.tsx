/**
 * FlashcardPreviewModal (mobile)
 *
 * Full-screen modal that lets the user flip, navigate, and rate any card
 * from a card list — the same interaction as PracticeScreen, but without
 * navigating away from the current screen.
 *
 * Usage:
 *   const [previewIndex, setPreviewIndex] = useState<number | null>(null);
 *
 *   <FlashcardPreviewModal
 *     cards={previewCards}
 *     initialIndex={previewIndex ?? 0}
 *     visible={previewIndex !== null}
 *     onClose={() => setPreviewIndex(null)}
 *     canRate={true}
 *     onRated={() => { utils.practice.stats.invalidate(); }}
 *   />
 */

import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';

import type { BackLanguageValue } from '@ensemble/types';
import { Button } from '@/components/Button';
import { trpc } from '@/lib/trpc';
import { FlipCard, NavButton, RatingButtons } from './FlashcardViewer';

// ── Public type for cards passed to this modal ─────────────────────────────────

export interface PreviewCard {
  id: string;
  front: string;
  back: string;
  frontExamples: string[];
  backExamples: string[];
  class: string | null;
  pronunciation: string | null;
  backLanguage: BackLanguageValue | null;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface FlashcardPreviewModalProps {
  /** Ordered list of cards to navigate through. */
  cards: PreviewCard[];
  /** Which card to start on (index into `cards`). Defaults to 0. */
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
  /** Whether the user can rate cards (false for public / non-owned decks). */
  canRate?: boolean;
  /** Called after each rating so the parent can invalidate caches. */
  onRated?: (cardId: string, quality: number) => void;
}

export function FlashcardPreviewModal({
  cards,
  initialIndex = 0,
  visible,
  onClose,
  canRate = true,
  onRated,
}: FlashcardPreviewModalProps) {
  const submit = trpc.practice.submitReview.useMutation();

  const [index, setIndex] = useState(initialIndex);
  const [flipped, setFlipped] = useState(false);

  // Reset to the chosen card whenever the modal opens.
  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
      setFlipped(false);
    }
  }, [visible, initialIndex]);

  const current = cards[index];
  const canGoPrev = index > 0;
  const canGoNext = index < cards.length - 1;

  const handlePrev = useCallback(() => {
    setFlipped(false);
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleNext = useCallback(() => {
    setFlipped(false);
    setIndex((i) => Math.min(cards.length - 1, i + 1));
  }, [cards.length]);

  function handleRate(quality: number) {
    if (!current || !canRate) return;
    submit.mutate({ cardId: current.id, confidence: quality });
    onRated?.(current.id, quality);
    // After rating, advance to next card; if on last just reset the flip.
    if (canGoNext) {
      setFlipped(false);
      setIndex((i) => i + 1);
    } else {
      setFlipped(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-slate-50">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View className="flex-row items-center justify-between border-b border-slate-100 px-4 py-3">
          <Text className="text-sm text-slate-500">
            {cards.length > 0 ? `${index + 1} of ${cards.length}` : ''}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityLabel="Close preview"
            accessibilityRole="button"
            className="active:opacity-70"
          >
            <Feather name="x" size={22} color="#64748b" />
          </Pressable>
        </View>

        {/* ── Card + navigation ──────────────────────────────────────────── */}
        {current ? (
          <ScrollView
            contentContainerStyle={{ padding: 16, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
          >
            <View className="flex-row items-stretch gap-2">
              <NavButton direction="prev" onPress={handlePrev} disabled={!canGoPrev} />
              <FlipCard
                front={current.front}
                back={current.back}
                frontExamples={current.frontExamples}
                backExamples={current.backExamples}
                cardClass={current.class}
                pronunciation={current.pronunciation}
                flipped={flipped}
                onPress={() => setFlipped((f) => !f)}
                cardId={current.id}
                backLanguage={current.backLanguage}
              />
              <NavButton direction="next" onPress={handleNext} disabled={!canGoNext} />
            </View>

            {/* ── Flip button or rating buttons ───────────────────────── */}
            {flipped && canRate ? (
              <RatingButtons onRate={handleRate} disabled={submit.isPending} />
            ) : flipped ? (
              <Text className="mt-6 text-center text-sm text-slate-500">
                Public deck — read-only. Use the arrows to navigate.
              </Text>
            ) : (
              <View className="mt-6">
                <Button size="lg" onPress={() => setFlipped(true)}>
                  Flip
                </Button>
              </View>
            )}
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}
