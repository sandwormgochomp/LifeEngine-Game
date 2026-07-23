import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

// CSS Imports
import '@fontsource/press-start-2p';
import '@fontsource/vt323';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './components/styles/index.css';
import './components/styles/EyedroppersDemo.css';

// Eyedroppers styling and definitions
import { EYEDROPPER_MAP, EYEDROPPER_LABELS, EyedropperStyleKey } from './components/EyedropperStyles';

const PIXELS = [
  // y = 0
  { x: 12, y: 0, t: 'B' }, { x: 13, y: 0, t: 'B' }, { x: 14, y: 0, t: 'B' },
  // y = 1
  { x: 11, y: 1, t: 'B' }, { x: 12, y: 1, t: 'P' }, { x: 13, y: 1, t: 'P' }, { x: 14, y: 1, t: 'P' }, { x: 15, y: 1, t: 'B' },
  // y = 2
  { x: 10, y: 2, t: 'B' }, { x: 11, y: 2, t: 'P' }, { x: 12, y: 2, t: 'H' }, { x: 13, y: 2, t: 'P' }, { x: 14, y: 2, t: 'P' }, { x: 15, y: 2, t: 'B' },
  // y = 3
  { x: 9, y: 3, t: 'B' }, { x: 10, y: 3, t: 'B' }, { x: 11, y: 3, t: 'P' }, { x: 12, y: 3, t: 'P' }, { x: 13, y: 3, t: 'B' }, { x: 14, y: 3, t: 'B' },
  // y = 4
  { x: 8, y: 4, t: 'B' }, { x: 9, y: 4, t: 'G' }, { x: 10, y: 4, t: 'G' }, { x: 11, y: 4, t: 'B' }, { x: 12, y: 4, t: 'B' },
  // y = 5
  { x: 7, y: 5, t: 'B' }, { x: 8, y: 5, t: 'G' }, { x: 9, y: 5, t: 'W' }, { x: 10, y: 5, t: 'L' }, { x: 11, y: 5, t: 'G' }, { x: 12, y: 5, t: 'B' },
  // y = 6
  { x: 6, y: 6, t: 'B' }, { x: 7, y: 6, t: 'G' }, { x: 8, y: 6, t: 'W' }, { x: 9, y: 6, t: 'L' }, { x: 10, y: 6, t: 'L' }, { x: 11, y: 6, t: 'G' }, { x: 12, y: 6, t: 'B' },
  // y = 7
  { x: 5, y: 7, t: 'B' }, { x: 6, y: 7, t: 'G' }, { x: 7, y: 7, t: 'W' }, { x: 8, y: 7, t: 'L' }, { x: 9, y: 7, t: 'L' }, { x: 10, y: 7, t: 'G' }, { x: 11, y: 7, t: 'B' },
  // y = 8
  { x: 4, y: 8, t: 'B' }, { x: 5, y: 8, t: 'G' }, { x: 6, y: 8, t: 'W' }, { x: 7, y: 8, t: 'L' }, { x: 8, y: 8, t: 'L' }, { x: 9, y: 8, t: 'G' }, { x: 10, y: 8, t: 'B' },
  // y = 9
  { x: 3, y: 9, t: 'B' }, { x: 4, y: 9, t: 'G' }, { x: 5, y: 9, t: 'W' }, { x: 6, y: 9, t: 'L' }, { x: 7, y: 9, t: 'L' }, { x: 8, y: 9, t: 'G' }, { x: 9, y: 9, t: 'B' },
  // y = 10
  { x: 2, y: 10, t: 'B' }, { x: 3, y: 10, t: 'G' }, { x: 4, y: 10, t: 'W' }, { x: 5, y: 10, t: 'L' }, { x: 6, y: 10, t: 'L' }, { x: 7, y: 10, t: 'G' }, { x: 8, y: 10, t: 'B' },
  // y = 11
  { x: 1, y: 11, t: 'B' }, { x: 2, y: 11, t: 'G' }, { x: 3, y: 11, t: 'W' }, { x: 4, y: 11, t: 'W' }, { x: 5, y: 11, t: 'G' }, { x: 6, y: 11, t: 'G' }, { x: 7, y: 11, t: 'B' },
  // y = 12
  { x: 0, y: 12, t: 'B' }, { x: 1, y: 12, t: 'G' }, { x: 2, y: 12, t: 'W' }, { x: 3, y: 12, t: 'W' }, { x: 4, y: 12, t: 'G' }, { x: 5, y: 12, t: 'B' },
  // y = 13
  { x: 0, y: 13, t: 'B' }, { x: 1, y: 13, t: 'G' }, { x: 2, y: 13, t: 'W' }, { x: 3, y: 13, t: 'G' }, { x: 4, y: 13, t: 'B' },
  // y = 14
  { x: 0, y: 14, t: 'B' }, { x: 1, y: 14, t: 'G' }, { x: 2, y: 14, t: 'G' }, { x: 3, y: 14, t: 'B' },
  // y = 15
  { x: 1, y: 15, t: 'B' }, { x: 2, y: 15, t: 'B' }
];

const COLOR_MAP: Record<string, string> = {
  B: '#111118',
  P: '#ff0055',
  H: '#ff80aa',
  G: 'rgba(67, 232, 224, 0.45)',
  W: '#ffffff',
  L: 'var(--eyedropper-liquid-color, #00FF41)'
};

// 10x10 beautiful hex color grid for sandbox testing
const SANDBOX_COLORS = [
  '#ff5e62', '#ff6b6b', '#ff8787', '#ffa8a8', '#ffc9c9', '#ffe3e3', '#eebefa', '#e599f7', '#da77f2', '#cc5de8',
  '#ff9966', '#ffa94d', '#ffd8a8', '#ffe8cc', '#fff3bf', '#fff9db', '#d0ebff', '#a5d8ff', '#74c0fc', '#4dabf7',
  '#ffbe0b', '#fb5607', '#ff006e', '#8338ec', '#3a86c8', '#06d6a0', '#118ab2', '#073b4c', '#ffd166', '#ef476f',
  '#00ff41', '#39ff14', '#00ff66', '#00ffcc', '#00ffff', '#00ccff', '#0066ff', '#7f00ff', '#ff00ff', '#ff0066',
  '#ff0055', '#e6004c', '#cc0044', '#b3003b', '#990033', '#80002b', '#660022', '#4d001a', '#330011', '#1a0009',
  '#43e8e0', '#3ccac4', '#34ada8', '#2d908c', '#257370', '#1d5754', '#153a38', '#0c1d1c', '#000000', '#111118',
  '#bf55ec', '#a240d4', '#852bbc', '#6816a3', '#4b008b', '#3d0c6f', '#2e1352', '#201536', '#12121a', '#08080c',
  '#cca43b', '#e5ba45', '#ffd14f', '#ffe082', '#ffecb3', '#fff8e1', '#b2dfdb', '#80cbc4', '#4db6ac', '#26a69a',
  '#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#34495e', '#16a085', '#27ae60', '#2980b9', '#8e44ad', '#2c3e50',
  '#f1c40f', '#e67e22', '#e74c3c', '#ecf0f1', '#95a5a6', '#f39c12', '#d35400', '#c0392b', '#bdc3c7', '#7f8c8d'
];

const OFFSETS: Record<string, { x: number; y: number }> = {
  'pixel-art': { x: 4, y: 56 },
  'cyberpunk-ring': { x: 32, y: 32 },
  'magnifying-loupe': { x: 40, y: 40 },
  'modern-reticle': { x: 32, y: 32 },
  'retro-console': { x: 4, y: 56 },
  'sci-fi-hud': { x: 40, y: 40 },
  'orbital-fluid': { x: 32, y: 32 },
  'glass-pipette': { x: 14, y: 58 },
  'chrono-gear': { x: 32, y: 32 },
  'chameleon-blob': { x: 32, y: 32 },
};

// Descriptions & metadata for cards
const ALTERNATIVES = [
  {
    key: 'cyberpunk-ring',
    title: 'Neo-Glow Ring',
    theme: 'Cyberpunk / Tech',
    description: 'Double glowing circles with spinning HUD dashes and hovering tech readout. Emits a neon shadow that adapts to the sampled color.'
  },
  {
    key: 'magnifying-loupe',
    title: 'The Magnifying Loupe',
    theme: 'High Fidelity / Utility',
    description: 'A metallic glass lens magnifying a 5x5 layout of individual pixels underneath, with a central reticle and floating color bubble.'
  },
  {
    key: 'modern-reticle',
    title: 'Minimalist Target',
    theme: 'Precision / Modern',
    description: 'Four slender corners wrapping a center core. The brackets extend outward on motion and contract to focus when standing still.'
  },
  {
    key: 'retro-console',
    title: 'Retro Console Dropper',
    theme: 'Classic Gaming / Retro',
    description: 'An 8-bit console hand cursor holding a beaker flask. Features real-time sloshing fluid and rising pixel dust particles.'
  },
  {
    key: 'sci-fi-hud',
    title: 'Sci-Fi HUD Tracker',
    theme: 'Sci-Fi / Hologram',
    description: 'Fighter-jet tracking sight with rotating coordinates (X/Y col/row), scan lines, and target vectors that follow the color source.'
  },
  {
    key: 'orbital-fluid',
    title: 'Orbital Fluid Droplet',
    theme: 'Astronomy / Physics',
    description: 'A glossy floating color droplet locked in position by three intersecting orbits rotating in three dimensions.'
  },
  {
    key: 'glass-pipette',
    title: 'Sleek Glass Pipette',
    theme: 'Glassmorphism / Flat',
    description: 'A frosted glass pipette holding color fluid that bounces and shifts. A droplet hangs off the tip, ready to drip.'
  },
  {
    key: 'chrono-gear',
    title: 'Chrono Gear',
    theme: 'Steampunk / Clockwork',
    description: 'A heavy brass clockwork system of spinning gears with a central gemstone that refracts and radiates the sampled color.'
  },
  {
    key: 'chameleon-blob',
    title: 'Chameleon Blob',
    theme: 'Fluid / Organic',
    description: 'A morphing organic fluid dot that changes shape dynamically. Projects a large colored light matching the sample.'
  }
];

const EyedroppersDemo: React.FC = () => {
  const [selectedStyle, setSelectedStyle] = useState<string>('pixel-art');
  const [hoverColor, setHoverColor] = useState<string>('#00ff41');
  const [col, setCol] = useState<number>(3);
  const [row, setRow] = useState<number>(3);
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const [colors5x5, setColors5x5] = useState<string[][]>([]);
  const [toast, setToast] = useState<string | null>(null);
  
  // Custom cursor movement state
  const [showCursor, setShowCursor] = useState<boolean>(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const sandboxRef = useRef<HTMLDivElement>(null);
  const moveTimeoutRef = useRef<number | null>(null);

  // Initialize selected style from localStorage
  useEffect(() => {
    const style = localStorage.getItem('eyedropper-style') || 'pixel-art';
    setSelectedStyle(style);
  }, []);

  const handleActivateStyle = (key: string) => {
    localStorage.setItem('eyedropper-style', key);
    setSelectedStyle(key);
    showNotification(`Activated style: ${key === 'pixel-art' ? 'Default Pixel Art' : EYEDROPPER_LABELS[key as EyedropperStyleKey]}`);
  };

  const showNotification = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Handle cursor events inside the color sandbox
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!sandboxRef.current) return;
    const rect = sandboxRef.current.getBoundingClientRect();
    
    // Check if mouse is within boundary
    const x = e.clientX;
    const y = e.clientY;
    
    setCursorPos({ x, y });
    setIsMoving(true);

    if (moveTimeoutRef.current) {
      clearTimeout(moveTimeoutRef.current);
    }
    moveTimeoutRef.current = window.setTimeout(() => {
      setIsMoving(false);
    }, 150);

    // Calculate grid row/col
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    
    const cellW = rect.width / 10;
    const cellH = rect.height / 10;
    
    const c = Math.max(0, Math.min(9, Math.floor(relX / cellW)));
    const r = Math.max(0, Math.min(9, Math.floor(relY / cellH)));
    
    setCol(c);
    setRow(r);

    const activeColor = SANDBOX_COLORS[r * 10 + c];
    setHoverColor(activeColor);

    // Build 5x5 sub-grid for loupe zoom
    const subGrid: string[][] = [];
    for (let dy = -2; dy <= 2; dy++) {
      const rowColors: string[] = [];
      for (let dx = -2; dx <= 2; dx++) {
        const targetCol = c + dx;
        const targetRow = r + dy;
        
        let color = '#111118'; // Void color for out of bounds
        if (targetCol >= 0 && targetCol < 10 && targetRow >= 0 && targetRow < 10) {
          color = SANDBOX_COLORS[targetRow * 10 + targetCol];
        }
        rowColors.push(color);
      }
      subGrid.push(rowColors);
    }
    setColors5x5(subGrid);
  };

  const handleCellClick = () => {
    navigator.clipboard.writeText(hoverColor);
    showNotification(`Copied color ${hoverColor.toUpperCase()} to clipboard!`);
  };

  const currentOffset = OFFSETS[selectedStyle] || { x: 32, y: 32 };
  const EyedropperComponent = EYEDROPPER_MAP[selectedStyle as EyedropperStyleKey];

  return (
    <div className="demo-container">
      {/* Toast Notification */}
      {toast && (
        <div className="toast">
          <i className="fa-solid fa-circle-check toast-icon"></i>
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <header className="demo-header">
        <a href="/" className="back-btn">
          <i className="fa-solid fa-arrow-left"></i>
          <span>Back to Game</span>
        </a>
        <h1 className="demo-title-glow">Eyedropper Selection Hub</h1>
        <p className="demo-subtitle">
          Configure your sampling device. Choose from <strong>9 distinct high-fidelity alternative cursors</strong>. 
          Your choice automatically overrides the default cursor inside <strong>The Life Engine</strong> simulation!
        </p>
      </header>

      {/* Main Sandbox & Cards Row */}
      <div className="demo-layout">
        
        {/* Left Side: Sandbox Preview */}
        <section className="sandbox-card">
          <h2 className="sandbox-title">
            <i className="fa-solid fa-wand-magic-sparkles" style={{ color: 'var(--neon-green)' }}></i>
            <span>Interactive Sandbox</span>
          </h2>
          <p style={{ fontSize: '13px', color: '#a1a1aa', margin: '0' }}>
            Hover over the color swatch below to test your cursor. Click on a square to copy its Hex color.
          </p>

          <div 
            className="sandbox-area" 
            ref={sandboxRef}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setShowCursor(true)}
            onMouseLeave={() => setShowCursor(false)}
            onClick={handleCellClick}
          >
            <div className="sandbox-grid">
              {SANDBOX_COLORS.map((color, index) => (
                <div 
                  key={index} 
                  className="sandbox-cell" 
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            {/* Sandbox Custom Cursor Overlay */}
            {showCursor && (
              <div 
                className="sandbox-cursor-container"
                style={{
                  display: 'block',
                  transform: `translate3d(calc(${cursorPos.x}px - ${currentOffset.x}px), calc(${cursorPos.y}px - ${currentOffset.y}px), 0)`,
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  pointerEvents: 'none'
                }}
              >
                {EyedropperComponent ? (
                  <EyedropperComponent 
                    color={hoverColor}
                    colors5x5={colors5x5}
                    col={col}
                    row={row}
                    isMoving={isMoving}
                  />
                ) : (
                  // Render standard pixel art eyedropper if pixel-art is selected
                  <div style={{
                    width: '64px',
                    height: '64px',
                    filter: `drop-shadow(0 0 6px ${hoverColor})`
                  }}>
                    <svg viewBox="0 0 16 16" style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }}>
                      {PIXELS.map((p, idx) => {
                        let fillVal = COLOR_MAP[p.t];
                        if (p.t === 'L') fillVal = hoverColor;
                        return (
                          <rect
                            key={idx}
                            x={p.x}
                            y={p.y}
                            width={1}
                            height={1}
                            fill={fillVal}
                          />
                        );
                      })}
                    </svg>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Color Readout */}
          <div className="color-readout">
            <div 
              className="color-preview-bar"
              style={{ 
                backgroundColor: hoverColor,
                color: '#fff'
              }}
            >
              {hoverColor.toUpperCase()}
            </div>
            <div className="readout-row">
              <span className="readout-label">GRID COORDS</span>
              <span className="readout-value">COL: {col} | ROW: {row}</span>
            </div>
            <div className="readout-row">
              <span className="readout-label">SAMPLER STATE</span>
              <span className="readout-value" style={{ color: isMoving ? 'var(--neon-green)' : '#a1a1aa' }}>
                {isMoving ? 'SCANNING...' : 'STATIONARY'}
              </span>
            </div>
          </div>
        </section>

        {/* Right Side: Options Grid */}
        <section className="cards-section">
          <h2 className="section-heading">
            <i className="fa-solid fa-palette" style={{ color: 'var(--neon-blue)' }}></i>
            <span>Select Eyedropper Skin</span>
          </h2>
          
          <div className="eyedroppers-grid">
            
            {/* CARD 0: Pixel Art Eyedropper (Original) */}
            <div className={`eyedropper-card ${selectedStyle === 'pixel-art' ? 'active' : ''}`}>
              <div className="card-header-row">
                <div>
                  <h3 className="card-title">Default Retro Pipette</h3>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontWeight: 'bold' }}>CLASSIC / PIXEL</span>
                </div>
                {selectedStyle === 'pixel-art' && <span className="active-badge">ACTIVE</span>}
              </div>
              <p className="card-description">
                The original 16x16 pixel-art eyedropper. A neat nostalgic computer pipette design with dynamic glow color fluid.
              </p>
              
              <div className="card-preview-box">
                {/* Float it with basic animation */}
                <div style={{
                  width: '64px',
                  height: '64px',
                  filter: 'drop-shadow(0 0 6px #00ff41)',
                  transform: 'translateY(-5px)',
                  animation: 'retroSlosh 2s ease-in-out infinite alternate'
                }}>
                  <svg viewBox="0 0 16 16" style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }}>
                    {PIXELS.map((p, idx) => (
                      <rect
                        key={idx}
                        x={p.x}
                        y={p.y}
                        width={1}
                        height={1}
                        fill={COLOR_MAP[p.t]}
                      />
                    ))}
                  </svg>
                </div>
              </div>
              
              <button 
                className="activate-btn"
                onClick={() => handleActivateStyle('pixel-art')}
              >
                <i className="fa-solid fa-circle-check"></i>
                <span>{selectedStyle === 'pixel-art' ? 'Currently Selected' : 'Select Retro Pipette'}</span>
              </button>
            </div>

            {/* Alternating Cards */}
            {ALTERNATIVES.map((alt) => {
              const AltComponent = EYEDROPPER_MAP[alt.key as EyedropperStyleKey];
              const isActive = selectedStyle === alt.key;
              
              // Generate mock colors for the zoom inside card preview
              const mockColors = [
                ['#ff0055', '#43e8e0', '#cca43b', '#bf55ec', '#00ff41'],
                ['#0c1d1c', '#ff5e62', '#ffd8a8', '#00ff66', '#00ff41'],
                ['#bf55ec', '#da77f2', '#00ff41', '#4dabf7', '#7f00ff'],
                ['#fb5607', '#39ff14', '#06d6a0', '#cca43b', '#cc5de8'],
                ['#ffbe0b', '#8338ec', '#00ff41', '#ef476f', '#3ccac4'],
              ];

              return (
                <div key={alt.key} className={`eyedropper-card ${isActive ? 'active' : ''}`}>
                  <div className="card-header-row">
                    <div>
                      <h3 className="card-title">{alt.title}</h3>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontWeight: 'bold' }}>{alt.theme.toUpperCase()}</span>
                    </div>
                    {isActive && <span className="active-badge">ACTIVE</span>}
                  </div>
                  <p className="card-description">{alt.description}</p>
                  
                  <div className="card-preview-box">
                    <div style={{ transform: 'scale(1.1)' }}>
                      <AltComponent 
                        color={isActive ? hoverColor : '#00ff41'}
                        colors5x5={mockColors}
                        col={14}
                        row={9}
                        isMoving={false}
                      />
                    </div>
                  </div>
                  
                  <button 
                    className="activate-btn"
                    onClick={() => handleActivateStyle(alt.key)}
                  >
                    <i className="fa-solid fa-circle-check"></i>
                    <span>{isActive ? 'Currently Selected' : `Select ${alt.title}`}</span>
                  </button>
                </div>
              );
            })}

          </div>
        </section>

      </div>
    </div>
  );
};

// Mount application
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<EyedroppersDemo />);
}
