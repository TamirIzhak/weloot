import { View } from 'react-native';

import { Badge, Card, Chip, Text } from '@/components';
import type { Platform } from '@/theme/tokens';

// Development-only sample cards, so the Home feed is long enough to test hide-on-scroll (issue #6).
// Never shown in release builds (PRD §1.2: no fake listings). Not localized: dev tooling, like FirebaseStatus.
const SAMPLE: { title: string; platform: Platform; platformLabel: string; photos: boolean }[] = [
  {
    title: 'The Legend of Zelda: Tears of the Kingdom',
    platform: 'nintendo',
    platformLabel: 'Switch',
    photos: true,
  },
  { title: 'Marvel’s Spider-Man 2', platform: 'ps', platformLabel: 'PS5', photos: false },
  { title: 'Forza Horizon 5', platform: 'xbox', platformLabel: 'Xbox Series X|S', photos: true },
  {
    title: 'Super Mario Bros. Wonder',
    platform: 'nintendo',
    platformLabel: 'Switch',
    photos: false,
  },
  { title: 'Elden Ring', platform: 'ps', platformLabel: 'PS5', photos: true },
  { title: 'Halo Infinite', platform: 'xbox', platformLabel: 'Xbox Series X|S', photos: false },
  { title: 'Mario Kart 8 Deluxe', platform: 'nintendo', platformLabel: 'Switch', photos: true },
  { title: 'God of War Ragnarök', platform: 'ps', platformLabel: 'PS5', photos: false },
];

export function SampleFeed() {
  return (
    <View className="gap-4">
      <Text variant="label" tone="muted" className="uppercase tracking-widest">
        Dev sample feed · not real listings
      </Text>
      {SAMPLE.map((game) => (
        <Card key={game.title}>
          <View className="h-32 bg-surface-raised" />
          <View className="gap-2 p-4">
            <View className="flex-row gap-2">
              <Chip platform={game.platform} label={game.platformLabel} />
              {game.photos ? <Badge label="Real photos" /> : null}
            </View>
            <Text variant="subheading">{game.title}</Text>
          </View>
        </Card>
      ))}
    </View>
  );
}
