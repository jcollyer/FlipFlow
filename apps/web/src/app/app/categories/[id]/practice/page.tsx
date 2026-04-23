import { PracticeSession } from '@/features/practice/PracticeSession';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PracticePage({ params }: Props) {
  const { id } = await params;
  return <PracticeSession categoryId={id} />;
}
