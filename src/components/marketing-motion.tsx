// Motion for the two logged-out marketing surfaces (/waitlist, /welcome) and
// the ProofCard they share. These keyframes stay out of globals.css on purpose:
// nothing behind the login uses them, and the app shell should not carry a
// marketing page's animation vocabulary.
//
// The reduced-motion guard is scoped to `.wl-anim` rather than `*` so it cannot
// reach into the app's own transitions if this is ever rendered inside one.
export function MarketingMotion() {
  return (
    <style>{`
      @keyframes wl-rise { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:none; } }
      @keyframes wl-fade { from { opacity:0; } to { opacity:1; } }
      @keyframes wl-grow { from { transform:scaleX(0); } to { transform:scaleX(1); } }
      @keyframes wl-glow { 0%,100% { opacity:.4; transform:scale(1); } 50% { opacity:.85; transform:scale(1.08); } }
      @keyframes wl-ping { 0% { transform:scale(1); opacity:.7; } 70%,100% { transform:scale(2.2); opacity:0; } }
      @keyframes wl-drift { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-7px); } }
      @media (prefers-reduced-motion: reduce) {
        .wl-anim, .wl-anim * { animation-duration:.01ms !important; animation-iteration-count:1 !important; }
      }
    `}</style>
  );
}
