import { GroupsDashboard } from '@/features/groups/GroupsDashboard';

/**
 * /app/groups — list all groups the current user is in, plus any pending
 * invitations awaiting their response. Sister page to /app/folders.
 */
export default function GroupsPage() {
  return <GroupsDashboard />;
}
