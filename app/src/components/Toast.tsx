import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from './cn';
import { Text } from './Text';

export type ToastTone = 'info' | 'success' | 'error';
type ToastMessage = { id: number; text: string; tone: ToastTone };

const TONE: Record<ToastTone, string> = {
  info: 'border-border',
  success: 'border-success',
  error: 'border-danger',
};

const DEFAULT_DURATION_MS = 3000;

type ToastApi = { show: (text: string, tone?: ToastTone, durationMs?: number) => void };

const ToastContext = createContext<ToastApi | null>(null);

/** Shows one short message at a time near the bottom of the screen. Wrap the app once, in the root layout. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);
  const insets = useSafeAreaInsets();

  const show = useCallback<ToastApi['show']>(
    (text, tone = 'info', durationMs = DEFAULT_DURATION_MS) => {
      if (timer.current) clearTimeout(timer.current);
      nextId.current += 1;
      setToast({ id: nextId.current, text, tone });
      timer.current = setTimeout(() => setToast(null), durationMs);
    },
    [],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View
        pointerEvents="none"
        className="absolute start-0 end-0 items-center px-4"
        style={{ bottom: insets.bottom + 96 }}
      >
        {toast ? (
          <Animated.View
            key={toast.id}
            entering={FadeInDown}
            exiting={FadeOutDown}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            testID="toast"
            className={cn(
              'max-w-md rounded-button border bg-surface-raised px-4 py-3',
              TONE[toast.tone],
            )}
          >
            <Text variant="label">{toast.text}</Text>
          </Animated.View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
