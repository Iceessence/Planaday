import React, { useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Code,
  Download,
  Eraser,
  GitMerge,
  Grid,
  Hand,
  Link2,
  MousePointer2,
  PenTool,
  Plus,
  Printer,
  RotateCcw,
  Sigma,
  StickyNote,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createId } from '../../core/db';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { downloadFile } from '../../core/backup';
import type { LifeRecord } from '../../core/types';

interface WbNode {
  id: string;
  kind: 'sticky' | 'text' | 'frame' | 'code' | 'equation' | 'sticker' | 'record';
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
  linkedRecordId?: string;
}

interface WbEdge {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
}

interface WbStroke {
  id: string;
  tool: 'pen' | 'highlighter' | 'marker' | 'line' | 'rect' | 'ellipse';
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
}

interface WbBookmark {
  id: string;
  name: string;
  panX: number;
  panY: number;
  zoom: number;
}

interface WhiteboardPayload {
  nodes: WbNode[];
  edges: WbEdge[];
  strokes: WbStroke[];
  bookmarks: WbBookmark[];
}

type ToolMode = 'select' | 'pan' | 'pen' | 'highlighter' | 'marker' | 'eraser' | 'connect';

export const WhiteboardView: React.FC = () => {
  const { records, pushToast } = useApp();
  const boards = useMemo(
    () => records.filter((r) => r.type === 'whiteboard' && !r.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [records]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeBoard: LifeRecord | null = useMemo(
    () => boards.find((b) => b.id === selectedId) ?? boards[0] ?? null,
    [boards, selectedId]
  );
  const payload = activeBoard?.payload as WhiteboardPayload | undefined;

  const [tool, setTool] = useState<ToolMode>('select');
  const [strokeColor, setStrokeColor] = useState('#2b241d');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [snapGrid, setSnapGrid] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [liveStroke, setLiveStroke] = useState<WbStroke | null>(null);
  const [bookmarkName, setBookmarkName] = useState('');
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<{
    kind: 'pan' | 'node';
    nodeId?: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const mutateBoard = async (updater: (p: WhiteboardPayload) => WhiteboardPayload) => {
    if (!activeBoard) return;
    await updateRecord<WhiteboardPayload>(activeBoard.id, (c) => ({ ...c, payload: updater(c.payload) }));
  };

  const clientToWorld = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  };

  const addNode = async (kind: WbNode['kind'], extra?: Partial<WbNode>) => {
    const baseX = Math.round((120 - pan.x) / zoom);
    const baseY = Math.round((90 - pan.y) / zoom);
    const node: WbNode = {
      id: createId('nd'),
      kind,
      x: snapGrid ? Math.round(baseX / 20) * 20 : baseX,
      y: snapGrid ? Math.round(baseY / 20) * 20 : baseY,
      w: kind === 'frame' ? 320 : kind === 'sticker' ? 70 : 185,
      h: kind === 'frame' ? 220 : kind === 'sticker' ? 70 : 96,
      text:
        kind === 'sticky'
          ? 'Idea sticky note'
          : kind === 'frame'
          ? 'Section Frame'
          : kind === 'code'
          ? 'const next = state => state + 1;'
          : kind === 'equation'
          ? 'ΔG = ΔH - TΔS'
          : kind === 'sticker'
          ? '💡'
          : 'Text Block',
      color:
        kind === 'sticky'
          ? '#fff3b0'
          : kind === 'frame'
          ? 'rgba(59,110,165,0.08)'
          : kind === 'code'
          ? '#1e2430'
          : '#ffffff',
      ...extra,
    };
    await mutateBoard((p) => ({ ...p, nodes: [...(Array.isArray(p.nodes) ? p.nodes : []), node] }));
    setSelectedNodeId(node.id);
  };

  const exportSvg = () => {
    if (!svgRef.current || !activeBoard) return;
    const xml = new XMLSerializer().serializeToString(svgRef.current);
    downloadFile({ filename: `${activeBoard.title}.svg`, content: xml, mimeType: 'image/svg+xml;charset=utf-8' });
    pushToast('Exported whiteboard as SVG', { tone: 'ok' });
  };

  const nodes = Array.isArray(payload?.nodes) ? payload!.nodes : [];
  const edges = Array.isArray(payload?.edges) ? payload!.edges : [];
  const strokes = Array.isArray(payload?.strokes) ? payload!.strokes : [];
  const bookmarks = Array.isArray(payload?.bookmarks) ? payload!.bookmarks : [];
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div className="dp-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <PenTool size={20} /> Infinite Whiteboard & Visual Workspace
          </h2>
          <p className="dp-muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
            Pan & zoom canvas (25%–300%), freehand pen/highlighter/marker, sticky notes, connected flowchart/mind-map nodes, minimap & bookmarked regions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="dp-select" value={activeBoard?.id ?? ''} onChange={(e) => setSelectedId(e.target.value)}>
            {boards.length === 0 && <option value="">No whiteboards yet</option>}
            {boards.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
          <button
            type="button"
            className="dp-btn dp-btn-primary"
            onClick={async () => {
              const n1Id = createId('nd');
              const n2Id = createId('nd');
              const rec = await createRecord<WhiteboardPayload>('whiteboard', `Whiteboard ${boards.length + 1}`, {
                nodes: [
                  { id: n1Id, kind: 'sticky', x: 80, y: 80, w: 180, h: 90, text: 'Core Concept', color: '#fff3b0' },
                  { id: n2Id, kind: 'sticky', x: 340, y: 120, w: 180, h: 90, text: 'Next Action Step', color: '#d8f3dc' },
                ],
                edges: [{ id: createId('ed'), fromId: n1Id, toId: n2Id, label: 'leads to' }],
                strokes: [],
                bookmarks: [{ id: createId('bm'), name: 'Origin', panX: 0, panY: 0, zoom: 1 }],
              });
              setSelectedId(rec.id);
              pushToast('Created new infinite whiteboard', { tone: 'ok' });
            }}
          >
            <Plus size={14} /> New Board
          </button>
          {activeBoard && (
            <>
              <button type="button" className="dp-btn" onClick={exportSvg}><Download size={13} /> SVG</button>
              <button type="button" className="dp-btn" onClick={() => window.print()}><Printer size={13} /> PDF</button>
              <button type="button" className="dp-btn" onClick={async () => { await softDeleteRecord(activeBoard.id); setSelectedId(null); }}><Trash2 size={13} /></button>
            </>
          )}
        </div>
      </div>

      {!activeBoard || !payload ? (
        <div className="dp-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="dp-muted">Click "+ New Board" above to open an infinite pan-and-zoom visual brainstorming canvas.</p>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="dp-card" style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.5rem 0.7rem' }}>
            <button type="button" className={`dp-btn ${tool === 'select' ? 'dp-btn-primary' : ''}`} onClick={() => setTool('select')}><MousePointer2 size={13} /> Move</button>
            <button type="button" className={`dp-btn ${tool === 'pan' ? 'dp-btn-primary' : ''}`} onClick={() => setTool('pan')}><Hand size={13} /> Pan</button>
            <button type="button" className={`dp-btn ${tool === 'pen' ? 'dp-btn-primary' : ''}`} onClick={() => setTool('pen')}><PenTool size={13} /> Pen</button>
            <button type="button" className={`dp-btn ${tool === 'highlighter' ? 'dp-btn-primary' : ''}`} onClick={() => setTool('highlighter')}>🖍 Hi-Lite</button>
            <button type="button" className={`dp-btn ${tool === 'marker' ? 'dp-btn-primary' : ''}`} onClick={() => setTool('marker')}>Marker</button>
            <button type="button" className={`dp-btn ${tool === 'eraser' ? 'dp-btn-primary' : ''}`} onClick={() => setTool('eraser')}><Eraser size={13} /> Eraser</button>
            <button type="button" className={`dp-btn ${tool === 'connect' ? 'dp-btn-primary' : ''}`} onClick={() => { setTool('connect'); setConnectFromId(null); }}><GitMerge size={13} /> Connect Nodes</button>
            <input type="color" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} style={{ width: 28, height: 26 }} />
            <input type="range" min={1} max={14} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} style={{ width: 65 }} />

            <span style={{ width: 1, height: 20, background: 'var(--dp-border)', margin: '0 4px' }} />

            <button type="button" className="dp-btn" onClick={() => void addNode('sticky')}><StickyNote size={13} /> Sticky</button>
            <button type="button" className="dp-btn" onClick={() => void addNode('frame')}>▢ Frame</button>
            <button type="button" className="dp-btn" onClick={() => void addNode('equation')}><Sigma size={13} /> Eq</button>
            <button type="button" className="dp-btn" onClick={() => void addNode('code')}><Code size={13} /> Code</button>
            <button type="button" className="dp-btn" onClick={() => void addNode('sticker')}>✨ Sticker</button>
            <select
              className="dp-select"
              defaultValue=""
              style={{ maxWidth: 160 }}
              onChange={(e) => {
                const rec = records.find((r) => r.id === e.target.value);
                if (rec) {
                  void addNode('record', { text: `[${rec.type.toUpperCase()}]\n${rec.title}`, color: '#e8f1f8', linkedRecordId: rec.id });
                }
                e.target.value = '';
              }}
            >
              <option value="">+ Link Record…</option>
              {records.filter((r) => !r.deletedAt && ['note', 'task', 'project', 'spreadsheet'].includes(r.type)).slice(0, 30).map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <button type="button" className="dp-btn" onClick={() => void mutateBoard((p) => ({ ...p, strokes: strokes.slice(0, -1) }))} title="Undo last stroke"><RotateCcw size={13} /></button>
              <button type="button" className={`dp-btn ${showGrid ? 'dp-btn-primary' : ''}`} onClick={() => setShowGrid((g) => !g)}><Grid size={13} /></button>
              <button type="button" className={`dp-btn ${snapGrid ? 'dp-btn-primary' : ''}`} onClick={() => setSnapGrid((s) => !s)}>Snap</button>
              <button type="button" className="dp-btn" onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.15).toFixed(2)))}><ZoomOut size={13} /></button>
              <span className="dp-badge">{Math.round(zoom * 100)}%</span>
              <button type="button" className="dp-btn" onClick={() => setZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))}><ZoomIn size={13} /></button>
              <button type="button" className="dp-btn" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset</button>
            </div>
          </div>

          {tool === 'connect' && (
            <div className="dp-badge" style={{ alignSelf: 'flex-start' }}>
              <Link2 size={12} /> {connectFromId ? 'Now click destination node to attach live connector arrow…' : 'Click source node first to start connector arrow'}
            </div>
          )}

          {/* Infinite Canvas + Minimap Overlay */}
          <div style={{ position: 'relative', border: '1px solid var(--dp-border)', borderRadius: 'var(--dp-radius)', overflow: 'hidden', background: 'var(--dp-paper-alt)' }}>
            <svg
              ref={svgRef}
              style={{ width: '100%', height: 500, display: 'block', touchAction: 'none', cursor: tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }}
              onPointerDown={(e) => {
                if (tool === 'pan') {
                  dragStateRef.current = { kind: 'pan', startClientX: e.clientX, startClientY: e.clientY, origX: pan.x, origY: pan.y };
                  return;
                }
                if (tool === 'pen' || tool === 'highlighter' || tool === 'marker') {
                  const pt = clientToWorld(e.clientX, e.clientY);
                  setLiveStroke({
                    id: createId('st'),
                    tool,
                    color: strokeColor,
                    width: tool === 'highlighter' ? strokeWidth * 3.5 : tool === 'marker' ? strokeWidth * 2 : strokeWidth,
                    points: [pt],
                  });
                }
              }}
              onPointerMove={(e) => {
                if (dragStateRef.current?.kind === 'pan') {
                  setPan({
                    x: dragStateRef.current.origX + (e.clientX - dragStateRef.current.startClientX),
                    y: dragStateRef.current.origY + (e.clientY - dragStateRef.current.startClientY),
                  });
                  return;
                }
                if (dragStateRef.current?.kind === 'node' && dragStateRef.current.nodeId) {
                  const dx = (e.clientX - dragStateRef.current.startClientX) / zoom;
                  const dy = (e.clientY - dragStateRef.current.startClientY) / zoom;
                  let nx = dragStateRef.current.origX + dx;
                  let ny = dragStateRef.current.origY + dy;
                  if (snapGrid) {
                    nx = Math.round(nx / 20) * 20;
                    ny = Math.round(ny / 20) * 20;
                  }
                  const nid = dragStateRef.current.nodeId;
                  void mutateBoard((p) => ({
                    ...p,
                    nodes: (Array.isArray(p.nodes) ? p.nodes : []).map((n) => (n.id === nid ? { ...n, x: nx, y: ny } : n)),
                  }));
                  return;
                }
                if (liveStroke) {
                  const pt = clientToWorld(e.clientX, e.clientY);
                  setLiveStroke((prev) => (prev ? { ...prev, points: [...prev.points, pt] } : null));
                }
              }}
              onPointerUp={() => {
                dragStateRef.current = null;
                if (liveStroke && liveStroke.points.length > 1) {
                  const finished = liveStroke;
                  setLiveStroke(null);
                  void mutateBoard((p) => ({ ...p, strokes: [...(Array.isArray(p.strokes) ? p.strokes : []), finished] }));
                } else {
                  setLiveStroke(null);
                }
              }}
            >
              <defs>
                <pattern id="wbGrid" width={20 * zoom} height={20 * zoom} patternUnits="userSpaceOnUse" patternTransform={`translate(${pan.x % (20 * zoom)}, ${pan.y % (20 * zoom)})`}>
                  <path d={`M ${20 * zoom} 0 L 0 0 0 ${20 * zoom}`} fill="none" stroke="var(--dp-border)" strokeWidth={0.7} />
                </pattern>
                <marker id="wbArrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="var(--dp-accent)" />
                </marker>
              </defs>
              {showGrid && <rect width="100%" height="100%" fill="url(#wbGrid)" />}

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* Live-Attached Diagram Edges */}
                {edges.map((ed) => {
                  const a = nodes.find((n) => n.id === ed.fromId);
                  const b = nodes.find((n) => n.id === ed.toId);
                  if (!a || !b) return null;
                  const x1 = a.x + a.w / 2;
                  const y1 = a.y + a.h / 2;
                  const x2 = b.x + b.w / 2;
                  const y2 = b.y + b.h / 2;
                  return (
                    <g key={ed.id}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="var(--dp-accent)"
                        strokeWidth={2}
                        markerEnd="url(#wbArrow)"
                        onClick={() => tool === 'eraser' && void mutateBoard((p) => ({ ...p, edges: edges.filter((x) => x.id !== ed.id) }))}
                      />
                    </g>
                  );
                })}

                {/* Freehand Strokes */}
                {[...strokes, ...(liveStroke ? [liveStroke] : [])].map((st) => {
                  const d = st.points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
                  return (
                    <path
                      key={st.id}
                      d={d}
                      fill="none"
                      stroke={st.color}
                      strokeWidth={st.width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={st.tool === 'highlighter' ? 0.35 : 0.95}
                      onClick={() => tool === 'eraser' && void mutateBoard((p) => ({ ...p, strokes: strokes.filter((x) => x.id !== st.id) }))}
                    />
                  );
                })}

                {/* Draggable Nodes */}
                {nodes.map((nd) => {
                  const isSel = nd.id === selectedNodeId || nd.id === connectFromId;
                  return (
                    <g
                      key={nd.id}
                      transform={`translate(${nd.x}, ${nd.y})`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (tool === 'eraser') {
                          void mutateBoard((p) => ({
                            ...p,
                            nodes: nodes.filter((x) => x.id !== nd.id),
                            edges: edges.filter((ed) => ed.fromId !== nd.id && ed.toId !== nd.id),
                          }));
                          return;
                        }
                        if (tool === 'connect') {
                          if (!connectFromId) setConnectFromId(nd.id);
                          else if (connectFromId !== nd.id) {
                            void mutateBoard((p) => ({
                              ...p,
                              edges: [...edges, { id: createId('ed'), fromId: connectFromId, toId: nd.id }],
                            }));
                            setConnectFromId(null);
                          }
                          return;
                        }
                        setSelectedNodeId(nd.id);
                        dragStateRef.current = { kind: 'node', nodeId: nd.id, startClientX: e.clientX, startClientY: e.clientY, origX: nd.x, origY: nd.y };
                      }}
                      style={{ cursor: tool === 'select' ? 'move' : 'pointer' }}
                    >
                      <rect
                        width={nd.w}
                        height={nd.h}
                        rx={nd.kind === 'frame' ? 12 : 8}
                        fill={nd.color}
                        stroke={isSel ? 'var(--dp-accent)' : 'rgba(0,0,0,0.22)'}
                        strokeWidth={isSel ? 2.4 : 1.2}
                        strokeDasharray={nd.kind === 'frame' ? '6 4' : undefined}
                      />
                      <foreignObject x={8} y={6} width={Math.max(20, nd.w - 16)} height={Math.max(20, nd.h - 12)}>
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            color: nd.kind === 'code' ? '#f4f6fb' : '#1e1b18',
                            fontFamily: nd.kind === 'code' ? 'monospace' : nd.kind === 'equation' ? 'serif' : 'inherit',
                            fontSize: nd.kind === 'sticker' ? 38 : 13,
                            whiteSpace: 'pre-wrap',
                            overflow: 'hidden',
                            userSelect: 'none',
                            display: nd.kind === 'sticker' ? 'flex' : 'block',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {nd.text}
                        </div>
                      </foreignObject>
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Minimap Overlay (§34.1) */}
            <div
              style={{
                position: 'absolute',
                right: 10,
                bottom: 10,
                width: 130,
                height: 82,
                background: 'rgba(255,255,255,0.88)',
                border: '1px solid var(--dp-border)',
                borderRadius: 6,
                padding: 4,
                pointerEvents: 'none',
              }}
            >
              <div style={{ fontSize: 9, color: '#555', marginBottom: 2 }}>Minimap ({nodes.length} nodes)</div>
              <svg viewBox="-200 -200 1200 800" style={{ width: '100%', height: 60 }}>
                {nodes.map((n) => (
                  <rect key={n.id} x={n.x} y={n.y} width={n.w} height={n.h} fill="#3b6ea5" opacity={0.75} />
                ))}
              </svg>
            </div>
          </div>

          {/* Selected Node Editor & Bookmarked Canvas Locations */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
            <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <strong style={{ fontSize: '0.84rem' }}>Selected Node Inspector</strong>
              {selectedNode ? (
                <>
                  <textarea
                    className="dp-textarea"
                    rows={3}
                    value={selectedNode.text}
                    onChange={(e) =>
                      void mutateBoard((p) => ({
                        ...p,
                        nodes: nodes.map((n) => (n.id === selectedNode.id ? { ...n, text: e.target.value } : n)),
                      }))
                    }
                  />
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="color"
                      value={selectedNode.color.startsWith('#') ? selectedNode.color : '#ffffff'}
                      onChange={(e) =>
                        void mutateBoard((p) => ({
                          ...p,
                          nodes: nodes.map((n) => (n.id === selectedNode.id ? { ...n, color: e.target.value } : n)),
                        }))
                      }
                    />
                    <label style={{ fontSize: '0.74rem' }}>W <input className="dp-input" type="number" value={selectedNode.w} onChange={(e) => void mutateBoard((p) => ({ ...p, nodes: nodes.map((n) => (n.id === selectedNode.id ? { ...n, w: Number(e.target.value) } : n)) }))} style={{ width: 65 }} /></label>
                    <label style={{ fontSize: '0.74rem' }}>H <input className="dp-input" type="number" value={selectedNode.h} onChange={(e) => void mutateBoard((p) => ({ ...p, nodes: nodes.map((n) => (n.id === selectedNode.id ? { ...n, h: Number(e.target.value) } : n)) }))} style={{ width: 65 }} /></label>
                    <button
                      type="button"
                      className="dp-btn"
                      onClick={() => {
                        void mutateBoard((p) => ({
                          ...p,
                          nodes: nodes.filter((n) => n.id !== selectedNode.id),
                          edges: edges.filter((ed) => ed.fromId !== selectedNode.id && ed.toId !== selectedNode.id),
                        }));
                        setSelectedNodeId(null);
                      }}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </>
              ) : (
                <span className="dp-muted" style={{ fontSize: '0.78rem' }}>Click any sticky note, frame, sticker, or card on the canvas to edit its content, size, or color.</span>
              )}
            </div>

            <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <strong style={{ fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: 5 }}><Bookmark size={14} /> Bookmarked Canvas Regions</strong>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <input className="dp-input" placeholder="Region name..." value={bookmarkName} onChange={(e) => setBookmarkName(e.target.value)} style={{ flex: 1 }} />
                <button
                  type="button"
                  className="dp-btn"
                  onClick={() => {
                    const name = bookmarkName.trim() || `View ${bookmarks.length + 1}`;
                    void mutateBoard((p) => ({ ...p, bookmarks: [...bookmarks, { id: createId('bm'), name, panX: pan.x, panY: pan.y, zoom }] }));
                    setBookmarkName('');
                  }}
                >
                  Save View
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {bookmarks.map((bm) => (
                  <button
                    key={bm.id}
                    type="button"
                    className="dp-btn"
                    onClick={() => {
                      setPan({ x: bm.panX, y: bm.panY });
                      setZoom(bm.zoom);
                    }}
                  >
                    📍 {bm.name} ({Math.round(bm.zoom * 100)}%)
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
