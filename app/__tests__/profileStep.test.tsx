import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ProfileSetupError } from '@/features/profile/profileApi';
import { ProfileStep } from '@/features/profile/ProfileStep';
import { USERNAME_CHECK_DELAY_MS } from '@/features/profile/useUsernameCheck';

const mockIsAvailable = jest.fn();
const mockCreateProfile = jest.fn();

jest.mock('@/features/profile/profileApi', () => ({
  ...jest.requireActual<object>('@/features/profile/profileApi'),
  isUsernameAvailable: (...args: unknown[]) => mockIsAvailable(...args),
  createProfile: (...args: unknown[]) => mockCreateProfile(...args),
}));
jest.mock('@react-native-firebase/firestore', () => ({}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockIsAvailable.mockResolvedValue(true);
  mockCreateProfile.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

const saveButton = () => screen.getByTestId('save-profile');
const isDisabled = () => saveButton().props.accessibilityState?.disabled === true;
const usernameMessage = () => screen.getByTestId('username-input-message').props.children;

async function typeUsername(value: string) {
  await fireEvent.changeText(screen.getByTestId('username-input'), value);
  await act(async () => {
    jest.advanceTimersByTime(USERNAME_CHECK_DELAY_MS);
  });
}

async function fillValidForm() {
  await typeUsername('Gamer_1');
  await fireEvent.changeText(screen.getByTestId('city-input'), 'hai');
  await fireEvent.press(screen.getByTestId('city-haifa'));
  await fireEvent.press(screen.getByTestId('accept-terms'));
}

describe('ProfileStep', () => {
  it('enables Continue only with an available username, a city and the 16+/Terms box', async () => {
    await render(<ProfileStep uid="u1" />);
    expect(isDisabled()).toBe(true);
    await typeUsername('Gamer_1');
    expect(usernameMessage()).toBe('✓ Available');
    expect(isDisabled()).toBe(true);
    await fireEvent.changeText(screen.getByTestId('city-input'), 'hai');
    await fireEvent.press(screen.getByTestId('city-haifa'));
    expect(screen.getByTestId('city-input').props.value).toBe('Haifa');
    expect(isDisabled()).toBe(true);
    await fireEvent.press(screen.getByTestId('accept-terms'));
    expect(isDisabled()).toBe(false);
  });

  it('explains an invalid username without asking the server', async () => {
    await render(<ProfileStep uid="u1" />);
    await typeUsername('ab');
    expect(usernameMessage()).toBe('Use 3–20 letters (English or Hebrew), digits or _. No spaces.');
    expect(mockIsAvailable).not.toHaveBeenCalled();
  });

  it('checks availability once typing pauses, and says when a name is taken', async () => {
    mockIsAvailable.mockResolvedValue(false);
    await render(<ProfileStep uid="u1" />);
    await fireEvent.changeText(screen.getByTestId('username-input'), 'Gam');
    await fireEvent.changeText(screen.getByTestId('username-input'), 'Gamer');
    expect(usernameMessage()).toBe('Checking…');
    await act(async () => {
      jest.advanceTimersByTime(USERNAME_CHECK_DELAY_MS);
    });
    expect(mockIsAvailable).toHaveBeenCalledTimes(1);
    expect(mockIsAvailable).toHaveBeenCalledWith('Gamer');
    expect(usernameMessage()).toBe('That username is taken. Try another one.');
  });

  it('still lets the user submit when the availability check itself fails', async () => {
    mockIsAvailable.mockRejectedValue(new Error('offline'));
    await render(<ProfileStep uid="u1" />);
    await fillValidForm();
    expect(isDisabled()).toBe(false);
  });

  it('finds cities in Hebrew spelling too, and says when nothing matches', async () => {
    await render(<ProfileStep uid="u1" />);
    await fireEvent.changeText(screen.getByTestId('city-input'), 'חיפה');
    expect(screen.getByTestId('city-haifa')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('city-input'), 'Atlantis');
    expect(screen.queryByTestId('city-results')).toBeNull();
    expect(screen.getByText('No city found. Try another spelling.')).toBeTruthy();
  });

  it('saves the profile with the current language', async () => {
    await render(<ProfileStep uid="u1" />);
    await fillValidForm();
    await fireEvent.press(saveButton());
    expect(mockCreateProfile).toHaveBeenCalledWith(
      'u1',
      { username: 'Gamer_1', cityId: 'haifa' },
      'en',
    );
  });

  it('marks the username taken when someone claimed it first', async () => {
    mockCreateProfile.mockRejectedValueOnce(new ProfileSetupError('usernameTaken'));
    await render(<ProfileStep uid="u1" />);
    await fillValidForm();
    await fireEvent.press(saveButton());
    expect(usernameMessage()).toBe('That username is taken. Try another one.');
    expect(isDisabled()).toBe(true);
  });

  it('shows a friendly message when saving fails', async () => {
    mockCreateProfile.mockRejectedValueOnce(new ProfileSetupError('failed'));
    await render(<ProfileStep uid="u1" />);
    await fillValidForm();
    await fireEvent.press(saveButton());
    expect(screen.getByTestId('profile-error').props.children).toBe(
      'Couldn’t save your profile. Check your connection and try again.',
    );
    expect(isDisabled()).toBe(false);
  });
});
