import { Redirect, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
  Text,
  useToast,
} from '@/components';

/**
 * Development-only gallery of the base components (issue #4), for checking them on a real phone.
 * Not user-facing, so its text isn't localized. Redirects home in release builds.
 */
export default function KitchenSink() {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<'all' | 'trade' | 'sale'>('all');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView contentContainerClassName="gap-8 p-4 pb-24">
        <View className="flex-row items-center justify-between">
          <Text variant="heading">Kitchen sink</Text>
          <Button variant="ghost" label="Back" onPress={() => router.back()} />
        </View>

        <Section title="Text">
          <Text variant="title">Title 28 · Rubik</Text>
          <Text variant="heading">Heading 22</Text>
          <Text variant="subheading">Subheading 18</Text>
          <Text>Body 16. The quick brown fox jumps over the lazy dog.</Text>
          <Text>גוף טקסט בעברית: החלפת משחקים בקלות</Text>
          <Text variant="label" tone="secondary">
            Label 14 · secondary
          </Text>
          <Text variant="caption" tone="muted">
            Caption 13 · muted
          </Text>
          <View className="flex-row gap-3">
            <Text tone="accent">Accent</Text>
            <Text tone="success">Success</Text>
            <Text tone="danger">Danger</Text>
          </View>
        </Section>

        <Section title="Buttons">
          <Button label="Make an offer" onPress={() => toast.show('Primary pressed')} />
          <Button
            variant="secondary"
            label="Ask a question"
            onPress={() => toast.show('Secondary pressed')}
          />
          <Button
            variant="ghost"
            label="Ghost button"
            onPress={() => toast.show('Ghost pressed')}
          />
          <Button
            variant="danger"
            label="Cancel deal"
            onPress={() => toast.show('Danger pressed', 'error')}
          />
          <Button
            size="lg"
            fullWidth
            label="Large, full width"
            onPress={() => toast.show('Large pressed')}
          />
          <Button
            label="Tap to load"
            loading={loading}
            onPress={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 1500);
            }}
          />
          <Button label="Disabled" disabled onPress={() => undefined} />
        </Section>

        <Section title="Chips and badges">
          <View className="flex-row flex-wrap gap-2">
            <Chip platform="ps" label="PS5" />
            <Chip platform="xbox" label="Xbox Series X|S" />
            <Chip platform="nintendo" label="Switch" />
          </View>
          <View className="flex-row flex-wrap gap-2">
            {(['all', 'trade', 'sale'] as const).map((value) => (
              <Chip
                key={value}
                label={value === 'all' ? 'All' : value === 'trade' ? 'For trade' : 'For sale'}
                selected={selected === value}
                onPress={() => setSelected(value)}
              />
            ))}
          </View>
          <View className="flex-row flex-wrap gap-2">
            <Badge label="Real photos" />
            <Badge tone="primary" label="Perfect match" />
            <Badge tone="success" label="Traded" />
            <Badge tone="warning" label="Reserved" />
            <Badge tone="neutral" label="Trade" />
          </View>
        </Section>

        <Section title="Card">
          <Card
            onPress={() => toast.show('Card pressed')}
            accessibilityLabel="Zelda: Tears of the Kingdom"
          >
            <View className="h-40 bg-surface-raised" />
            <View className="gap-2 p-4">
              <View className="flex-row gap-2">
                <Chip platform="nintendo" label="Switch" />
                <Badge label="Real photos" />
              </View>
              <Text variant="subheading">The Legend of Zelda: Tears of the Kingdom</Text>
              <Text variant="caption" tone="secondary">
                Like new · Ramat Gan · 3 km
              </Text>
            </View>
          </Card>
        </Section>

        <Section title="Input">
          <Input
            label="Username"
            placeholder="gamer_il"
            value={name}
            onChangeText={setName}
            helper="3–20 letters, numbers or _"
          />
          <Input
            label="Username (error)"
            value="ab"
            error="That name's too short. Use at least 3 characters."
          />
        </Section>

        <Section title="Skeleton">
          <Skeleton className="h-40 w-full rounded-card" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </Section>

        <Section title="Empty and error states">
          <Card>
            <EmptyState
              title="No one has it yet"
              body="We'll let you know the moment someone near you lists it."
              primaryAction={{
                label: 'Notify me',
                onPress: () => toast.show('Alert created', 'success'),
              }}
              secondaryAction={{ label: 'Add to want list', onPress: () => toast.show('Added') }}
            />
          </Card>
          <Card>
            <ErrorState
              title="Couldn't load games"
              message="Check your connection and try again."
              retryLabel="Try again"
              onRetry={() => toast.show('Retrying…')}
            />
          </Card>
        </Section>

        <Section title="Toasts">
          <View className="flex-row flex-wrap gap-2">
            <Button variant="secondary" label="Info" onPress={() => toast.show('Offer sent')} />
            <Button
              variant="secondary"
              label="Success"
              onPress={() => toast.show('Trade completed', 'success')}
            />
            <Button
              variant="secondary"
              label="Error"
              onPress={() => toast.show("Couldn't send. Try again.", 'error')}
            />
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text variant="label" tone="muted" className="uppercase tracking-widest">
        {title}
      </Text>
      {children}
    </View>
  );
}
