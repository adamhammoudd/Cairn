interface ToggleProps {
  name: string;
  defaultChecked?: boolean;
}

// Transcribed from Cairn Settings.dc.html: a 46x25 track with a 19px knob that
// travels translateX(21px) on a 260ms overshoot curve, alongside the track
// colour at 240ms. On, the track is solid accent with a soft glow and the knob
// goes dark; off, it is the standard line/active pair with a grey knob. The
// overshoot is what makes the control feel like a switch rather than a
// checkbox, and it is the one place in the system that uses that curve.
export function Toggle({ name, defaultChecked }: ToggleProps) {
  return (
    <label className="relative inline-flex h-[25px] w-[46px] shrink-0 cursor-pointer items-center">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="absolute inset-0 rounded-full border border-line bg-active transition-[background-color,border-color,box-shadow] duration-base ease-standard peer-checked:border-accent peer-checked:bg-accent peer-checked:shadow-[0_0_14px_rgba(47,198,133,0.3)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
      <span className="absolute top-0.5 left-0.5 h-[19px] w-[19px] rounded-full bg-line-strong transition-[transform,background-color] duration-[260ms] ease-[cubic-bezier(0.34,1.4,0.64,1)] peer-checked:translate-x-[21px] peer-checked:bg-canvas" />
    </label>
  );
}
