/** OCP `SecondaryStatus` (`console-shared/.../status/SecondaryStatus.tsx`): a small, subtle line under a cell's value. */
export function SecondaryLine({ text }: { text: string }) {
  return <div className="pf-v6-u-font-size-xs pf-v6-u-text-color-subtle">{text}</div>;
}
