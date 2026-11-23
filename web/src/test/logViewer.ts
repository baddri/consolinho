/**
 * Makes PF `LogViewer` renderable in jsdom; call in `beforeEach` of any test that mounts the Pod Logs tab.
 * jsdom has no canvas (the viewer measures a character's width with one) and computes `lineHeight: 'normal'`, which
 * gives NaN row heights and sends react-window's binary search into an endless loop. Only log-viewer elements get the
 * fixed metrics (matched on the class attribute: SVG `className` is no string), so other components see jsdom's styles
 * unchanged.
 */
export function stubLogViewerLayout(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText: () => ({ width: 8 }),
  } as unknown as CanvasRenderingContext2D);
  const computed = window.getComputedStyle.bind(window);
  const metrics: Record<string, string> = {
    lineHeight: '20px',
    paddingLeft: '0px',
    paddingRight: '0px',
    width: '0px',
  };
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = computed(element, pseudo);
    if (!(element.getAttribute('class') ?? '').includes('pf-v6-c-log-viewer')) return style;
    return new Proxy(style, {
      get: (target, prop) =>
        typeof prop === 'string' && prop in metrics
          ? metrics[prop]
          : (Reflect.get(target, prop, target) as unknown),
    });
  });
}
