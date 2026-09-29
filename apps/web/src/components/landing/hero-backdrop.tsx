'use client';

/**
 * There is no product video asset in this repo, and this component never fabricates a URL to one.
 * Instead it fakes the *feel* of a looping hero video -- slow drifting light sources over a near-black
 * base, plus a grain overlay -- entirely with CSS and one inline SVG filter, so it costs nothing to load
 * and never stutters. `prefers-reduced-motion` freezes the drift entirely.
 */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-[#07070a]">
      <div className="hero-drift-a absolute left-[-10%] top-[-20%] size-[70vmax] rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_oklch,var(--primary)_55%,white_10%)_0%,transparent_65%)] opacity-40 blur-3xl" />
      <div className="hero-drift-b absolute bottom-[-30%] right-[-15%] size-[60vmax] rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_oklch,var(--accent-foreground)_45%,white_5%)_0%,transparent_65%)] opacity-30 blur-3xl" />
      <div className="hero-drift-c absolute left-1/3 top-1/2 size-[45vmax] rounded-full bg-[radial-gradient(circle_at_center,white_0%,transparent_70%)] opacity-[0.06] blur-3xl" />
      <svg className="absolute inset-0 h-full w-full opacity-[0.05] mix-blend-overlay">
        <filter id="hero-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#hero-grain)" />
      </svg>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#07070a]" />
    </div>
  );
}
