import { useId, useState } from 'react';

// A lightweight before/after comparison slider. Two stacked images share the same box;
// the "after" image is clipped with an inset() driven by a range input, so dragging the
// handle reveals more or less of the "after" side. No external dependency required.
export default function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = 'Before',
  afterLabel = 'After',
  width = 800,
  height = 600,
  initialValue = 50,
}) {
  const [value, setValue] = useState(initialValue);
  const id = useId();

  return (
    <div className="before-after" style={{ aspectRatio: `${width} / ${height}` }}>
      <div className="before-after-frame">
        <img
          src={beforeSrc}
          alt={beforeLabel}
          width={width}
          height={height}
          className="before-after-img"
          loading="lazy"
        />
        <div className="before-after-clip" style={{ clipPath: `inset(0 ${100 - value}% 0 0)` }}>
          <img
            src={afterSrc}
            alt={afterLabel}
            width={width}
            height={height}
            className="before-after-img"
            loading="lazy"
          />
        </div>
        <div className="before-after-divider" style={{ left: `${value}%` }} aria-hidden="true" />
        <span className="before-after-tag before-after-tag-left">{beforeLabel}</span>
        <span className="before-after-tag before-after-tag-right">{afterLabel}</span>
      </div>
      <label htmlFor={id} className="sr-only">
        Drag to compare {beforeLabel} and {afterLabel}
      </label>
      <input
        id={id}
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="before-after-range"
        aria-label={`Comparison slider between ${beforeLabel} and ${afterLabel}`}
      />
    </div>
  );
}
