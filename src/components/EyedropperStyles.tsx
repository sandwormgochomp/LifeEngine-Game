import React from 'react';
import './styles/EyedropperAlternatives.css';

interface EyedropperStyleProps {
  color: string;
  colors5x5?: string[][]; // 5x5 grid of colors for the loupe
  col: number;
  row: number;
  isMoving: boolean;
}

// Helper to convert hex to rgba for glow customization
const hexToRgba = (hex: string, alpha: number): string => {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// 1. Cyberpunk Ring
export const CyberpunkRing: React.FC<EyedropperStyleProps> = ({ color }) => {
  return (
    <div
      className="cyberpunkContainer"
      style={{ '--active-color': color } as React.CSSProperties}
    >
      <div className="cyberpunkRingOuter" />
      <div className="cyberpunkRingInner" />
      <div className="cyberpunkCenter" />
      <div className="cyberpunkLabel">{color.toUpperCase()}</div>
    </div>
  );
};

// 2. Magnifying Loupe
export const MagnifyingLoupe: React.FC<EyedropperStyleProps> = ({ color, colors5x5 }) => {
  // Use a default grid if none is provided
  const grid = colors5x5 || Array(5).fill(null).map(() => Array(5).fill('#111118'));
  const colorAlpha = hexToRgba(color, 0.3);

  return (
    <div
      className="loupeContainer"
      style={{
        '--active-color': color,
        '--active-color-alpha': colorAlpha
      } as React.CSSProperties}
    >
      <div className="loupePill">
        <span className="loupePillColor" />
        <span className="loupePillText">{color.toUpperCase()}</span>
      </div>
      <div className="loupeFrame">
        <div className="loupeGrid">
          {grid.map((rowArr, rIdx) =>
            rowArr.map((cellColor, cIdx) => (
              <div
                key={`${rIdx}-${cIdx}`}
                className="loupeGridCell"
                style={{ backgroundColor: cellColor || '#111118' }}
              />
            ))
          )}
        </div>
        <div className="loupeCrosshair" />
        <div className="loupeGlassSheen" />
      </div>
      <div className="loupeHandle" />
    </div>
  );
};

// 3. Modern Reticle
export const ModernReticle: React.FC<EyedropperStyleProps> = ({ color, isMoving }) => {
  const offset = isMoving ? '5px' : '0px';

  return (
    <div
      className="reticleContainer"
      style={{
        '--active-color': color,
        '--reticle-offset': offset
      } as React.CSSProperties}
    >
      <div className="reticleBracket rb1" />
      <div className="reticleBracket rb2" />
      <div className="reticleBracket rb3" />
      <div className="reticleBracket rb4" />
      <div className="reticleCenter" />
      <div className="reticleLabel">{color.toUpperCase()}</div>
    </div>
  );
};

// 4. Retro Console Pipette
export const RetroConsole: React.FC<EyedropperStyleProps> = ({ color }) => {
  return (
    <div
      className="retroConsoleContainer"
      style={{ '--active-color': color } as React.CSSProperties}
    >
      <svg className="retroHand" viewBox="0 0 16 16" width="32" height="32">
        {/* Pixel-art retro hand pointer */}
        <path d="M0,0 h1 v1 h-1 z" fill="#000" />
        <path d="M1,1 h1 v1 h-1 z" fill="#000" />
        <path d="M2,2 h1 v1 h-1 z" fill="#000" />
        <path d="M3,3 h1 v2 h-1 z" fill="#000" />
        <path d="M4,5 h2 v1 h-2 z" fill="#000" />
        <path d="M6,6 h1 v1 h-1 z" fill="#000" />
        <path d="M7,7 h2 v1 h-2 z" fill="#000" />
        <path d="M9,8 h2 v1 h-2 z" fill="#000" />
        <path d="M11,9 h3 v1 h-3 z" fill="#000" />
        {/* Fill color */}
        <path d="M1,2 h1 v12 h-1 z" fill="#fff" />
        <path d="M2,3 h1 v10 h-1 z" fill="#fff" />
        <path d="M3,5 h1 v8 h-1 z" fill="#fff" />
        <path d="M4,6 h2 v6 h-2 z" fill="#fff" />
        <path d="M6,7 h1 v5 h-1 z" fill="#fff" />
        <path d="M7,8 h2 v3 h-2 z" fill="#fff" />
        <path d="M9,9 h2 v2 h-2 z" fill="#fff" />
      </svg>
      <div className="retroFlask">
        <div className="retroLiquid" />
      </div>
      {/* Floating retro pixels */}
      <div className="retroParticle" style={{ top: '10px', left: '15px', animationDelay: '0s' }} />
      <div className="retroParticle" style={{ top: '24px', left: '35px', animationDelay: '0.4s' }} />
      <div className="retroParticle" style={{ top: '16px', left: '42px', animationDelay: '0.8s' }} />
    </div>
  );
};

// 5. Sci-Fi HUD Tracker
export const SciFiHud: React.FC<EyedropperStyleProps> = ({ color, col, row }) => {
  const colorAlpha = hexToRgba(color, 0.2);

  return (
    <div
      className="hudContainer"
      style={{
        '--active-color': color,
        '--active-color-alpha': colorAlpha
      } as React.CSSProperties}
    >
      <div className="hudRing1" />
      <div className="hudRing2" />
      <div className="hudCross" />
      <div className="hudCornerBracket hcb1" />
      <div className="hudCornerBracket hcb2" />
      <div className="hudCornerBracket hcb3" />
      <div className="hudCornerBracket hcb4" />
      <div className="hudInfoPanel">
        <span className="hudInfoLine">SYS: SAMPLER_V2</span>
        <span className="hudInfoLine">COL: {col} ROW: {row}</span>
        <span className="hudInfoLine" style={{ color: '#fff' }}>HEX: {color.toUpperCase()}</span>
      </div>
    </div>
  );
};

// 6. Orbital Fluid Droplet
export const OrbitalFluid: React.FC<EyedropperStyleProps> = ({ color }) => {
  return (
    <div
      className="orbitalContainer"
      style={{ '--active-color': color } as React.CSSProperties}
    >
      <div className="orbitalRing or1">
        <div className="orbitalDot" />
      </div>
      <div className="orbitalRing or2">
        <div className="orbitalDot" style={{ animationDelay: '-1.3s' }} />
      </div>
      <div className="orbitalRing or3">
        <div className="orbitalDot" style={{ animationDelay: '-2.5s' }} />
      </div>
      <div className="orbitalCenterOrb" />
    </div>
  );
};

// 7. Sleek Pipette (Frosted Glass)
export const GlassPipette: React.FC<EyedropperStyleProps> = ({ color }) => {
  return (
    <div
      className="pipetteContainer"
      style={{
        '--active-color': color,
        '--liquid-level': '65%'
      } as React.CSSProperties}
    >
      <div className="pipetteBulb" />
      <div className="pipetteShaft">
        <div className="pipetteLiquid" />
      </div>
      <div className="pipetteTip" />
      <div className="pipetteDrip" />
    </div>
  );
};

// 8. Chrono Gear
export const ChronoGear: React.FC<EyedropperStyleProps> = ({ color }) => {
  return (
    <div
      className="gearContainer"
      style={{ '--active-color': color } as React.CSSProperties}
    >
      <div className="gearLarge" />
      <div className="gearSmall" />
      <div className="gearGem" />
      <div className="gearGemOverlay" />
    </div>
  );
};

// 9. Chameleon Blob
export const ChameleonBlob: React.FC<EyedropperStyleProps> = ({ color }) => {
  return (
    <div
      className="blobContainer"
      style={{ '--active-color': color } as React.CSSProperties}
    >
      <div className="chameleonBlob" />
    </div>
  );
};

// Lookup Map to render based on selection
export const EYEDROPPER_MAP = {
  'cyberpunk-ring': CyberpunkRing,
  'magnifying-loupe': MagnifyingLoupe,
  'modern-reticle': ModernReticle,
  'retro-console': RetroConsole,
  'sci-fi-hud': SciFiHud,
  'orbital-fluid': OrbitalFluid,
  'glass-pipette': GlassPipette,
  'chrono-gear': ChronoGear,
  'chameleon-blob': ChameleonBlob,
};

export type EyedropperStyleKey = keyof typeof EYEDROPPER_MAP;

export const EYEDROPPER_LABELS: Record<EyedropperStyleKey, string> = {
  'cyberpunk-ring': 'Neo-Glow Ring (Cyberpunk)',
  'magnifying-loupe': 'The Magnifying Loupe',
  'modern-reticle': 'Minimalist Target (Modern Reticle)',
  'retro-console': 'Retro Console Dropper',
  'sci-fi-hud': 'Sci-Fi HUD Tracker',
  'orbital-fluid': 'Orbital Fluid Droplet',
  'glass-pipette': 'Sleek Pipette (Material Glass)',
  'chrono-gear': 'Chrono Gear (Steampunk)',
  'chameleon-blob': 'Chameleon Blob (Minimal Flow)',
};
