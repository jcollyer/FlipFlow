import { CategoryDetail } from '@/features/categories/CategoryDetail';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CategoryDetailPage({ params }: Props) {
  const { id } = await params;
  return <CategoryDetail categoryId={id} />;
}
