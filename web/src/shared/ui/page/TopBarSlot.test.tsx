import { render, screen, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { TopBar, TopBarSlotContext } from './TopBarSlot';

/** Mimics the shell: a fixed slot and, separately, the scrolling content that declares the bar. */
function Shell({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <>
      <div ref={setSlot} data-testid="slot" />
      <div data-testid="content">
        <TopBarSlotContext.Provider value={slot}>{children}</TopBarSlotContext.Provider>
      </div>
    </>
  );
}

describe('TopBar', () => {
  it('renders its children into the shell slot, not where it is declared', () => {
    render(
      <Shell>
        <TopBar>
          <p>Project: shop</p>
        </TopBar>
        <p>Page body</p>
      </Shell>,
    );
    expect(within(screen.getByTestId('slot')).getByText('Project: shop')).toBeInTheDocument();
    expect(within(screen.getByTestId('content')).queryByText('Project: shop')).not.toBeInTheDocument();
  });

  it('renders in place without a slot (outside the shell)', () => {
    render(
      <TopBar>
        <p>Project: shop</p>
      </TopBar>,
    );
    expect(screen.getByText('Project: shop')).toBeInTheDocument();
  });
});
