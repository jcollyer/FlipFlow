import { FolderDetail } from '@/features/folders/FolderDetail';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * /app/folders/[id] — single folder detail with the decks it contains and
 * an "Add deck" dropdown for toggling membership.
 */
export default async function FolderDetailPage({ params }: Props) {
  const { id } = await params;
  return <FolderDetail folderId={id} />;
}
