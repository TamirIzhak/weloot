import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text as RNText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  AppErrorBoundary,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
  Text,
  ToastProvider,
  useToast,
} from '@/components';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('Text', () => {
  it('marks titles and headings as headers for screen readers', async () => {
    await render(
      <>
        <Text variant="title">Title</Text>
        <Text>Body</Text>
      </>,
    );
    expect(screen.getByRole('header', { name: 'Title' })).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Body' })).toBeNull();
  });
});

describe('Button', () => {
  it('calls onPress and exposes its label', async () => {
    const onPress = jest.fn();
    await render(<Button label="Make an offer" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Make an offer' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire while disabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Send" disabled onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Send' });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('shows a spinner, reports busy, and ignores presses while loading', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" loading onPress={onPress} testID="save" />);
    expect(screen.getByTestId('save-loading')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Card', () => {
  it('is a plain view without onPress and a button with it', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <Card testID="static">
          <RNText>Static</RNText>
        </Card>
        <Card onPress={onPress} accessibilityLabel="Zelda card">
          <RNText>Pressable</RNText>
        </Card>
      </>,
    );
    expect(screen.queryByRole('button', { name: 'Static' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Zelda card' }));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('Chip', () => {
  it('works as a toggle with selected state', async () => {
    const onPress = jest.fn();
    await render(<Chip label="For trade" selected onPress={onPress} />);
    const chip = screen.getByRole('togglebutton', { name: 'For trade' });
    expect(chip.props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalled();
  });

  it('renders platform chips as static labels', async () => {
    await render(<Chip platform="nintendo" label="Switch" />);
    expect(screen.getByText('Switch')).toBeTruthy();
    expect(screen.queryByRole('togglebutton')).toBeNull();
  });
});

describe('Badge', () => {
  it('shows its label', async () => {
    await render(<Badge label="Real photos" />);
    expect(screen.getByText('Real photos')).toBeTruthy();
  });
});

describe('Input', () => {
  it('shows the helper, then the error instead of it', async () => {
    const { rerender } = await render(
      <Input label="Username" helper="3–20 characters" testID="username" />,
    );
    expect(screen.getByTestId('username-message').props.children).toBe('3–20 characters');
    await rerender(
      <Input label="Username" helper="3–20 characters" error="Too short" testID="username" />,
    );
    expect(screen.getByTestId('username-message').props.children).toBe('Too short');
    expect(screen.queryByText('3–20 characters')).toBeNull();
  });

  it('passes text changes through and is labelled for screen readers', async () => {
    const onChangeText = jest.fn();
    await render(<Input label="City" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText('City'), 'Haifa');
    expect(onChangeText).toHaveBeenCalledWith('Haifa');
  });
});

describe('Skeleton', () => {
  it('is hidden from screen readers', async () => {
    await render(<Skeleton testID="sk" className="h-4 w-20" />);
    expect(
      screen.getByTestId('sk', { includeHiddenElements: true }).props.accessibilityElementsHidden,
    ).toBe(true);
  });
});

describe('EmptyState and ErrorState', () => {
  it('offers its actions', async () => {
    const notify = jest.fn();
    const want = jest.fn();
    await render(
      <EmptyState
        title="No one has it yet"
        primaryAction={{ label: 'Notify me', onPress: notify }}
        secondaryAction={{ label: 'Add to want list', onPress: want }}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Notify me' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add to want list' }));
    expect(notify).toHaveBeenCalled();
    expect(want).toHaveBeenCalled();
  });

  it('retries from the error state', async () => {
    const retry = jest.fn();
    await render(
      <ErrorState title="Couldn't load" retryLabel="Try again" onRetry={retry} testID="err" />,
    );
    expect(screen.getByTestId('err').props.accessibilityRole).toBe('alert');
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });

  it('hides the retry button without a handler', async () => {
    await render(<ErrorState title="Couldn't load" retryLabel="Try again" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Toast', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  function ShowButton() {
    const toast = useToast();
    return <Button label="Show" onPress={() => toast.show('Offer sent', 'success', 1000)} />;
  }

  it('shows a message and hides it after the duration', async () => {
    jest.useFakeTimers();
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <ToastProvider>
          <ShowButton />
        </ToastProvider>
      </SafeAreaProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByText('Offer sent')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(1100);
    });
    expect(screen.queryByText('Offer sent')).toBeNull();
  });

  it('throws a clear error outside the provider', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(render(<ShowButton />)).rejects.toThrow(
      'useToast must be used inside <ToastProvider>',
    );
    spy.mockRestore();
  });
});

describe('AppErrorBoundary', () => {
  it('shows a calm message and retries', async () => {
    const retry = jest.fn(() => Promise.resolve());
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await render(<AppErrorBoundary error={new Error('boom')} retry={retry} />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.queryByText('boom')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
    spy.mockRestore();
  });
});
