import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TogglePlay } from './TogglePlay';

describe('TogglePlay', () => {
  it('labels the action by state and calls onClick', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<TogglePlay active onClick={onClick} />);

    await userEvent.click(screen.getByRole('button', { name: 'Pause event streaming' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<TogglePlay active={false} onClick={onClick} />);
    expect(screen.getByRole('button', { name: 'Start streaming events' })).toBeInTheDocument();
  });
});
