import { screen, waitFor, within } from '@testing-library/react';
import type { Pod } from '@/shared/k8s';
import { renderWithProviders } from '@/test/render';
import { ContainerSelect } from './ContainerSelect';
import { useSelectedContainer } from './useSelectedContainer';

const pod: Pod = {
  metadata: { name: 'web-1', namespace: 'shop' },
  spec: {
    initContainers: [{ name: 'migrate' }],
    containers: [{ name: 'web' }, { name: 'proxy' }],
  },
  status: {
    initContainerStatuses: [
      {
        name: 'migrate',
        image: 'i',
        imageID: '',
        ready: false,
        restartCount: 0,
        state: { terminated: { exitCode: 0, reason: 'Completed' } },
      },
    ],
    containerStatuses: [
      { name: 'web', image: 'i', imageID: '', ready: true, restartCount: 0, state: { running: {} } },
      {
        name: 'proxy',
        image: 'i',
        imageID: '',
        ready: false,
        restartCount: 3,
        state: { waiting: { reason: 'CrashLoopBackOff' } },
      },
    ],
  },
};

/** The select wired to `?container=` as the Logs/Terminal toolbars will use it. */
function Harness({
  includeInit,
  isOptionDisabled,
}: {
  includeInit?: boolean;
  isOptionDisabled?: (name: string) => boolean;
}) {
  const [container, setContainer] = useSelectedContainer(pod, { includeInit });
  return (
    <ContainerSelect
      pod={pod}
      value={container}
      onChange={setContainer}
      includeInit={includeInit}
      isOptionDisabled={isOptionDisabled}
    />
  );
}

describe('ContainerSelect', () => {
  it('groups init containers; options show badge and name only (OCP)', async () => {
    const { user } = renderWithProviders(<Harness />);

    await user.click(await screen.findByRole('button', { name: 'Container web' }));

    const containers = screen.getByRole('listbox', { name: 'Containers' });
    expect(
      within(containers)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Cweb', 'Cproxy']);
    const init = screen.getByRole('listbox', { name: 'Init containers' });
    expect(within(init).getByRole('option')).toHaveTextContent(/^Cmigrate$/);
  });

  it('disables the options isOptionDisabled names', async () => {
    const onlyRunning = (name: string) => name !== 'web';
    const { user } = renderWithProviders(<Harness isOptionDisabled={onlyRunning} />);

    await user.click(await screen.findByRole('button', { name: 'Container web' }));

    expect(screen.getByRole('option', { name: /web/ })).toBeEnabled();
    expect(screen.getByRole('option', { name: /proxy/ })).toBeDisabled();
    expect(screen.getByRole('option', { name: /migrate/ })).toBeDisabled();
  });

  it('omits init containers without includeInit', async () => {
    const { user } = renderWithProviders(<Harness includeInit={false} />);

    await user.click(await screen.findByRole('button', { name: 'Container web' }));

    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.queryByRole('listbox', { name: 'Init containers' })).not.toBeInTheDocument();
  });

  it('writes the pick to ?container= and keeps other parameters', async () => {
    const { user, router } = renderWithProviders(<Harness />, { url: '/?view=x' });

    await user.click(await screen.findByRole('button', { name: 'Container web' }));
    await user.click(screen.getByRole('option', { name: /migrate/ }));

    await waitFor(() => expect(router.state.location.search).toBe('?view=x&container=migrate'));
    expect(screen.getByRole('button', { name: 'Container migrate' })).toBeInTheDocument();
  });

  it('reads ?container= and falls back to the first container for an unknown name', async () => {
    const { unmount } = renderWithProviders(<Harness />, { url: '/?container=proxy' });
    expect(await screen.findByRole('button', { name: 'Container proxy' })).toBeInTheDocument();
    unmount();

    renderWithProviders(<Harness />, { url: '/?container=nope' });
    expect(await screen.findByRole('button', { name: 'Container web' })).toBeInTheDocument();
  });

  it('falls back to the default for an init container name without includeInit', async () => {
    renderWithProviders(<Harness includeInit={false} />, { url: '/?container=migrate' });
    expect(await screen.findByRole('button', { name: 'Container web' })).toBeInTheDocument();
  });
});
