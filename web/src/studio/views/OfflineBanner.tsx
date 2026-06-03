/**
 * Shown across the whole view area when the cue dashboard server isn't
 * reachable. One clear CTA (the command to start it) instead of every view
 * repeating the same transport error.
 */

export function OfflineBanner({ message }: { message: string }) {
  return (
    <div className="edit-blank" style={{ padding: 40, textAlign: "center" }}>
      <div className="eb-logo">cue<span>studio</span></div>
      <p style={{ maxWidth: 460, lineHeight: 1.6 }}>
        The cue dashboard server isn't responding, so there's no live data to show.
        Start it, then this reconnects automatically.
      </p>
      <div className="mc-cmd" style={{ maxWidth: 420 }}>
        <span className="prompt">$</span>
        <span className="cmd-txt">cue dashboard</span>
      </div>
      <p style={{ fontSize: 11, color: "var(--fg3)", fontFamily: "var(--mono)" }}>{message}</p>
    </div>
  );
}
