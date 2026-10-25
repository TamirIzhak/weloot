import {
  addToAverage,
  conversationIdFor,
  ratingIdFor,
  rateUserInputSchema,
  respondToOfferInputSchema,
  sendOfferInputSchema,
  startConversationInputSchema,
} from './conversations';

describe('conversation inputs', () => {
  it('derives one conversation per listing and interested user', () => {
    expect(conversationIdFor('l1', 'u2')).toBe('l1_u2');
  });

  it('opens with a question (text) or an offer (games and/or cash)', () => {
    expect(
      startConversationInputSchema.safeParse({ listingId: 'l1', opener: 'question', text: ' Hi ' })
        .data,
    ).toEqual({
      listingId: 'l1',
      opener: 'question',
      text: 'Hi',
    });
    expect(
      startConversationInputSchema.safeParse({ listingId: 'l1', opener: 'question', text: '  ' })
        .success,
    ).toBe(false);
    expect(
      startConversationInputSchema.safeParse({
        listingId: 'l1',
        opener: 'offer',
        offer: { itemsFrom: ['a'], itemsTo: ['l1'], cashAgorot: 0 },
      }).success,
    ).toBe(true);
    expect(
      startConversationInputSchema.safeParse({ listingId: 'l1', opener: 'offer' }).success,
    ).toBe(false);
  });

  it('validates offers: a payer for cash, whole shekels up to ₪2,000', () => {
    const base = { conversationId: 'c', offer: { itemsFrom: [], itemsTo: ['l1'] } };
    expect(
      sendOfferInputSchema.safeParse({ ...base, offer: { ...base.offer, cashAgorot: 5000 } })
        .success,
    ).toBe(false);
    expect(
      sendOfferInputSchema.safeParse({
        ...base,
        offer: { ...base.offer, cashAgorot: 5000, cashPayerId: 'u2' },
      }).success,
    ).toBe(true);
    expect(
      sendOfferInputSchema.safeParse({
        ...base,
        offer: { ...base.offer, cashAgorot: 300000, cashPayerId: 'u2' },
      }).success,
    ).toBe(false);
  });

  it('responds with accept, decline or withdraw only', () => {
    expect(
      respondToOfferInputSchema.safeParse({ conversationId: 'c', offerId: 'o', action: 'accept' })
        .success,
    ).toBe(true);
    expect(
      respondToOfferInputSchema.safeParse({ conversationId: 'c', offerId: 'o', action: 'counter' })
        .success,
    ).toBe(false);
  });
});

describe('ratings', () => {
  it('averages one more rating, two decimals', () => {
    expect(addToAverage(0, 0, 4)).toBe(4);
    expect(addToAverage(4, 1, 5)).toBe(4.5);
    expect(addToAverage(4.5, 2, 3)).toBe(4);
    expect(addToAverage(5, 2, 4)).toBe(4.67);
  });

  it('takes 1–5 whole stars and an optional comment', () => {
    expect(
      rateUserInputSchema.safeParse({ conversationId: 'c', stars: 5, comment: ' Great ' }).data,
    ).toEqual({
      conversationId: 'c',
      stars: 5,
      comment: 'Great',
    });
    expect(rateUserInputSchema.safeParse({ conversationId: 'c', stars: 0 }).success).toBe(false);
    expect(rateUserInputSchema.safeParse({ conversationId: 'c', stars: 4.5 }).success).toBe(false);
    expect(ratingIdFor('c1', 'u1')).toBe('c1_u1');
  });
});
