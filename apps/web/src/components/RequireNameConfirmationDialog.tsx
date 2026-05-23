'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  expectedName: string;
  confirmActionLabel: string;
  isPending?: boolean;
  mismatchMessage?: string;
  normalizeValue?: (value: string) => string;
  onConfirm: () => void;
}

export function RequireNameConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  expectedName,
  confirmActionLabel,
  isPending = false,
  mismatchMessage,
  normalizeValue,
  onConfirm,
}: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setValue('');
      setError(null);
    }
  }, [open]);

  const normalize = normalizeValue ?? ((nextValue: string) => nextValue.trim());
  const isMatch = normalize(value) === normalize(expectedName);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isPending) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        onEscapeKeyDown={(e) => {
          if (isPending) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (isPending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-destructive">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isMatch) {
              setError(
                mismatchMessage ??
                  `The ${confirmLabel.toLowerCase()} name you typed doesn't match.`,
              );
              return;
            }
            setError(null);
            onConfirm();
          }}
        >
          <Label htmlFor="typed-delete-confirmation" className="text-sm">
            To confirm, type{' '}
            <span className="text-foreground font-mono font-semibold">{expectedName}</span> below:
          </Label>
          <Input
            id="typed-delete-confirmation"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            disabled={isPending}
            placeholder={expectedName}
          />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending || !isMatch}>
              {confirmActionLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
