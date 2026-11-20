/**
 * Screen-reader-only polite status for a menu search that matches nothing: the visible "No … match" item appears in
 * the list, but a newly inserted item isn't announced, so this always-mounted live region repeats it.
 */
export function NoMatchStatus({ text }: { text: string | undefined }) {
  return (
    <div className="pf-v6-screen-reader" role="status">
      {text}
    </div>
  );
}
