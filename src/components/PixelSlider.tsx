import React from 'react';

// Range input themed as the dithered pixel slider (option C in
// concepts/pixel-slider-options.html). The CSS in index.css draws the lit
// portion of the track from a --fill custom property; deriving it from the
// controlled props (rather than from input events) keeps the fill correct
// when the value changes programmatically — undo/redo, preset loads.
export default function PixelSlider(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const min = Number(props.min ?? 0);
  const max = Number(props.max ?? 100);
  const value = Number(props.value ?? min);
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      {...props}
      type="range"
      style={{ ...props.style, '--fill': `${pct}%` } as React.CSSProperties}
    />
  );
}
