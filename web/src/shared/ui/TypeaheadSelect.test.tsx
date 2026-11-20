import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { TypeaheadSelect, type TypeaheadItem } from './TypeaheadSelect';

const ITEMS: TypeaheadItem[] = [{ value: 'alpha' }, { value: 'beta', isDisabled: true }, { value: 'gamma' }];

/** Harness owning the input text, like the real callers. */
function Harness({ onSelect }: { onSelect: (value: string) => void }) {
  const [text, setText] = useState('');
  return (
    <TypeaheadSelect
      ariaLabel="Pick"
      clearAriaLabel="Clear pick"
      placeholder="Pick one"
      inputValue={text}
      onInputChange={setText}
      items={ITEMS.filter((item) => item.value.includes(text))}
      onSelect={onSelect}
    />
  );
}

describe('TypeaheadSelect', () => {
  it('points aria-controls at the list and moves the highlight over enabled options only', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const input = screen.getByRole('combobox', { name: 'Pick' });

    await user.click(input);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    const list = await screen.findByRole('listbox');
    expect(input).toHaveAttribute('aria-controls', list.id);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    const gamma = screen.getByRole('option', { name: 'gamma' });
    expect(input).toHaveAttribute('aria-activedescendant', gamma.id);

    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('gamma');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });
});
