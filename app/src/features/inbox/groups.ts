import type { Conversation } from '@/features/offers/offersApi';

export const INBOX_GROUPS = ['needsAction', 'activeDeals', 'chats', 'completed'] as const;
export type InboxGroup = (typeof INBOX_GROUPS)[number];

const OPEN_DEAL = new Set(['agreed', 'awaiting_confirmation']);
const FINISHED_DEAL = new Set(['completed', 'unconfirmed', 'disputed']);

/**
 * Which inbox group a conversation belongs to (PRD §9-B4): an offer waiting for my answer or a swap waiting for my
 * confirmation needs action; open deals next; finished deals last; everything else is a chat.
 */
export function groupOf(conversation: Conversation, me: string): InboxGroup {
  const deal = conversation.deal;
  if (conversation.pendingOfferTo === me) return 'needsAction';
  if (deal?.status === 'awaiting_confirmation' && !deal.confirmedBy.includes(me))
    return 'needsAction';
  if (deal && OPEN_DEAL.has(deal.status)) return 'activeDeals';
  if (deal && FINISHED_DEAL.has(deal.status)) return 'completed';
  return 'chats';
}

/** Conversations by group, each most recently active first (the order they arrive in). */
export function groupConversations(
  conversations: readonly Conversation[],
  me: string,
): { group: InboxGroup; data: Conversation[] }[] {
  const byGroup = new Map<InboxGroup, Conversation[]>(INBOX_GROUPS.map((g) => [g, []]));
  for (const conversation of conversations)
    byGroup.get(groupOf(conversation, me))?.push(conversation);
  return INBOX_GROUPS.flatMap((group) => {
    const data = byGroup.get(group) ?? [];
    return data.length > 0 ? [{ group, data }] : [];
  });
}

/** Unread messages across all conversations (the Inbox tab badge). */
export function totalUnread(conversations: readonly Conversation[], me: string): number {
  return conversations.reduce((sum, c) => sum + (c.unread[me] ?? 0), 0);
}
