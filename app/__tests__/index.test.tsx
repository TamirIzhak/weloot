import { render, screen } from '@testing-library/react-native';

import Index from '@/app/index';

describe('Index', () => {
  it('renders the WeLoot wordmark', async () => {
    await render(<Index />);
    expect(screen.getByText('WeLoot')).toBeTruthy();
  });
});
