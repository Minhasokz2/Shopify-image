import { useCallback, useRef, useState } from 'react';
import { Box, Text } from '@shopify/polaris';

export function BeforeAfterSlider({ beforeSrc, afterSrc, beforeLabel = 'Before', afterLabel = 'After' }) {
  const containerRef = useRef(null);
  const [position, setPosition] = useState(50);
  const draggingRef = useRef(false);

  const updateFromClientX = useCallback((clientX) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, ratio)));
  }, []);

  const handlePointerDown = (event) => {
    draggingRef.current = true;
    updateFromClientX(event.clientX);
  };

  const handlePointerMove = (event) => {
    if (!draggingRef.current) return;
    updateFromClientX(event.clientX);
  };

  const stopDragging = () => {
    draggingRef.current = false;
  };

  return (
    <div>
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerLeave={stopDragging}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1 / 1',
          overflow: 'hidden',
          borderRadius: 'var(--p-border-radius-200, 8px)',
          cursor: 'ew-resize',
          userSelect: 'none',
          touchAction: 'none',
          background: 'var(--p-color-bg-surface-secondary, #f1f1f1)',
        }}
      >
        <img
          src={beforeSrc}
          alt={beforeLabel}
          draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            clipPath: `inset(0 ${100 - position}% 0 0)`,
          }}
        >
          <img
            src={afterSrc}
            alt={afterLabel}
            draggable={false}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${position}%`,
            width: 2,
            background: '#ffffff',
            boxShadow: '0 0 4px rgba(0,0,0,0.5)',
            transform: 'translateX(-1px)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `${position}%`,
            transform: 'translate(-50%, -50%)',
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: '#ffffff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            fontSize: 12,
          }}
        >
          ↔
        </div>
      </div>
      <Box paddingBlockStart="150">
        <input
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          style={{ width: '100%' }}
          aria-label="Reveal after image"
        />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text as="span" variant="bodySm" tone="subdued">
            {beforeLabel}
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            {afterLabel}
          </Text>
        </div>
      </Box>
    </div>
  );
}

export default BeforeAfterSlider;
