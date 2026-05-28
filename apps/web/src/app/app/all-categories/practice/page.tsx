import { PracticeSession } from '@/features/practice/PracticeSession';

interface Props {
  searchParams: Promise<{
    categoryIds?: string;
    classes?: string;
    difficultyLevels?: string;
    advancedDifficultyLevels?: string;
    favorites?: string;
    shuffle?: string;
  }>;
}

export default async function AllCategoriesPracticePage({ searchParams }: Props) {
  const params = await searchParams;
  const categoryIds = params.categoryIds?.split(',').filter(Boolean);
  const classes = params.classes?.split(',').filter(Boolean);
  const difficultyLevels = params.difficultyLevels?.split(',').filter(Boolean);
  const advancedDifficultyLevels = params.advancedDifficultyLevels?.split(',').filter(Boolean);
  const favorites = params.favorites?.split(',').filter(Boolean);
  const shuffle = params.shuffle === '1' || params.shuffle === 'true';

  return (
    <PracticeSession
      categoryIds={categoryIds?.length ? categoryIds : undefined}
      classes={classes?.length ? classes : undefined}
      difficultyLevels={difficultyLevels?.length ? difficultyLevels : undefined}
      advancedDifficultyLevels={
        advancedDifficultyLevels?.length ? advancedDifficultyLevels : undefined
      }
      favorites={favorites?.length ? favorites : undefined}
      shuffle={shuffle}
    />
  );
}
