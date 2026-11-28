import React, { useMemo, useRef, useState } from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  maxHeight?: number | string;
  overscan?: number;
  gap?: number;
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  emptyState?: React.ReactNode;
}

/**
 * Lightweight zero-dependency Virtualized List (v4.2.0 §2).
 * Renders only visible viewport rows + overscan buffer so 10,000+ notes, files,
 * and search results scroll smoothly at 60fps on phones and desktops alike.
 */
export function VirtualList<T>({
  items,
  itemHeight,
  maxHeight = '56dvh',
  overscan = 6,
  gap = 8,
  getKey,
  renderItem,
  className = '',
  emptyState = null,
}: VirtualListProps<T>): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(520);

  const rowStride = itemHeight + gap;
  const totalHeight = Math.max(0, items.length * rowStride - (items.length > 0 ? gap : 0));

  const { startIndex, endIndex } = useMemo(() => {
    if (items.length === 0) return { startIndex: 0, endIndex: -1 };
    const rawStart = Math.floor(scrollTop / rowStride);
    const visibleCount = Math.ceil(viewportH / rowStride);
    return {
      startIndex: Math.max(0, rawStart - overscan),
      endIndex: Math.min(items.length - 1, rawStart + visibleCount + overscan),
    };
  }, [items.length, scrollTop, viewportH, rowStride, overscan]);

  if (items.length === 0) {
    return <>{emptyState}</>;
  }

  const visibleSlice: Array<{ item: T; index: number }> = [];
  for (let i = startIndex; i <= endIndex; i++) {
    visibleSlice.push({ item: items[i], index: i });
  }

  return (
    <div
      ref={(el) => {
        containerRef.current = el;
        if (el && el.clientHeight > 0 && Math.abs(el.clientHeight - viewportH) > 24) {
          setViewportH(el.clientHeight);
        }
      }}
      className={className}
      style={{
        maxHeight,
        overflowY: 'auto',
        position: 'relative',
        contain: 'strict',
      }}
      onScroll={(e) => {
        const el = e.currentTarget;
        setScrollTop(el.scrollTop);
        if (el.clientHeight > 0 && el.clientHeight !== viewportH) {
          setViewportH(el.clientHeight);
        }
      }}
    >
      <div style={{ height: totalHeight, position: 'relative', width: '100%' }}>
        {visibleSlice.map(({ item, index }) => (
          <div
            key={getKey(item, index)}
            style={{
              position: 'absolute',
              top: index * rowStride,
              left: 0,
              right: 0,
              height: itemHeight,
            }}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}
