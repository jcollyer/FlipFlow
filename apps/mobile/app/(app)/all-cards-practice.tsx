import { useLocalSearchParams } from 'expo-router';

import { PracticeScreen } from '@/features/practice/PracticeScreen';

export default function AllCardsPracticeRoute() {
  const params = useLocalSearchParams<{
    categoryIds?: string;
    classes?: string;
    difficultyLevels?: string;
    shuffle?: string;
    origin?: string;
  }>();

  const categoryIds = params.categoryIds?.split(',').filter(Boolean);
  const classes = params.classes?.split(',').filter(Boolean);
  const difficultyLevels = params.difficultyLevels?.split(',').filter(Boolean);
  const shuffle = params.shuffle === '1' || params.shuffle === 'true';
  const origin = params.origin === 'home' || params.origin === 'deck' ? params.origin : undefined;

  return (
    <PracticeScreen
      categoryIds={categoryIds?.length ? categoryIds : undefined}
      classes={classes?.length ? classes : undefined}
      difficultyLevels={difficultyLevels?.length ? difficultyLevels : undefined}
      shuffle={shuffle}
      origin={origin}
    />
  );
}
