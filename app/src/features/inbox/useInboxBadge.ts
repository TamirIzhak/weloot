import { useAuth } from '@/features/auth/AuthProvider';
import { useMyConversations } from '@/features/offers/offersApi';

import { totalUnread } from './groups';

/** Unread messages for the Inbox tab badge (0 for guests). */
export function useInboxBadge(): number {
  const auth = useAuth();
  const me = auth.status === 'signedIn' ? auth.user.uid : undefined;
  const conversations = useMyConversations(me);
  return me && conversations ? totalUnread(conversations, me) : 0;
}
