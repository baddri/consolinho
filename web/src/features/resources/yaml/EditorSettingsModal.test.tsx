import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { EditorSettingsModal } from './EditorSettingsModal';
import { useEditorSettings } from './useEditorSettings';

/** The modal wired to the real stored settings, as the editor toolbar opens it. */
function Harness() {
  return <EditorSettingsModal isOpen onClose={() => undefined} settings={useEditorSettings()} />;
}

describe('Editor settings (OCP edit-yaml-settings-modal)', () => {
  beforeEach(() => localStorage.clear());

  it('starts from OCP defaults and remembers changes', async () => {
    const { user } = renderWithProviders(<Harness />);

    const dialog = await screen.findByRole('dialog', { name: 'Editor settings' });
    expect(dialog).toHaveTextContent('Changes apply immediately');
    const fontSize = screen.getByRole('spinbutton', { name: 'Enter a font size' });
    expect(fontSize).toHaveValue(14);
    const tooltips = screen.getByRole('switch', { name: 'Tooltips' });
    const sticky = screen.getByRole('switch', { name: 'Sticky scroll' });
    expect(tooltips).toBeChecked();
    expect(sticky).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Increase font size' }));
    await user.click(tooltips);

    expect(fontSize).toHaveValue(15);
    expect(tooltips).not.toBeChecked();
    expect(localStorage.getItem('fleetconsole.yamlEditor.fontSize')).toBe('15');
    expect(localStorage.getItem('fleetconsole.yamlEditor.tooltips')).toBe('false');
  });

  it('offers the colour scheme: Default follows the console, Dark and Light override it', async () => {
    const { user } = renderWithProviders(<Harness />);

    const toggle = await screen.findByRole('button', { name: 'Color scheme' });
    expect(toggle).toHaveTextContent('Default');
    await user.click(toggle);
    expect(screen.getByRole('option', { name: /Default/ })).toHaveTextContent('Follow your user preference');
    await user.click(screen.getByRole('option', { name: /Always use dark mode/ }));

    expect(toggle).toHaveTextContent('Dark');
    expect(localStorage.getItem('fleetconsole.yamlEditor.colorScheme')).toBe('dark');
  });

  it('never goes below the minimum font size', async () => {
    localStorage.setItem('fleetconsole.yamlEditor.fontSize', '5');
    const { user } = renderWithProviders(<Harness />);

    await user.click(await screen.findByRole('button', { name: 'Decrease font size' }));

    expect(screen.getByRole('spinbutton', { name: 'Enter a font size' })).toHaveValue(5);
  });
});
