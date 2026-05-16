import { GroupDetail } from '@/features/groups/GroupDetail';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * /app/groups/[id] — single group detail with members, invite controls,
 * and the list of shared decks.
 */
export default async function GroupDetailPage({ params }: Props) {
  const { id } = await params;
  return <GroupDetail groupId={id} />;
}
