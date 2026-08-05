"use client";

import { useEffect, useState } from "react";

interface LevelUpOverlayProps {
  show: boolean;
  newLevel: number;
  newRank?: string;
  onClose: () => void;
}

export default function LevelUpOverlay({ show, newLevel, newRank, onClose }: LevelUpOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onClose, 400); // wait for fade out
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  if (!show && !visible) return null;

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-400 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={() => {
        setVisible(false);
        setTimeout(onClose, 400);
      }}
    >
      <div className="relative flex flex-col items-center justify-center pointer-events-none" style={{ animation: "level-up-flash 0.8s ease-out forwards" }}>
        
        {/* Glow effect behind text */}
        <div className="absolute inset-0 bg-cyan-500/20 blur-[100px] rounded-full w-96 h-96 -z-10"></div>
        
        <p className="text-cyan-400 font-bold tracking-[0.3em] uppercase text-sm mb-2 opacity-80" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
          The System Notices Your Growth
        </p>
        
        <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-cyan-300 drop-shadow-[0_0_30px_rgba(6,182,212,0.8)]" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
          LEVEL UP!
        </h1>
        
        <div className="mt-8 flex items-center gap-6">
          <div className="text-center">
            <p className="text-muted text-xs uppercase tracking-widest mb-1 font-bold">New Level</p>
            <p className="text-4xl text-white font-bold" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
              {newLevel}
            </p>
          </div>
          
          {newRank && (
            <>
              <div className="w-px h-12 bg-white/20"></div>
              <div className="text-center">
                <p className="text-muted text-xs uppercase tracking-widest mb-1 font-bold">New Rank</p>
                <div className={`rank-badge rank-${newRank} scale-110 shadow-[0_0_20px_rgba(255,255,255,0.2)]`}>
                  {newRank}
                </div>
              </div>
            </>
          )}
        </div>

        <p className="mt-12 text-sm text-white/50 tracking-widest uppercase animate-pulse">
          Click anywhere to continue
        </p>

      </div>
    </div>
  );
}
