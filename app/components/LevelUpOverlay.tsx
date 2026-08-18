"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface LevelUpOverlayProps {
  show: boolean;
  newLevel: number;
  newRank?: string;
  onClose: () => void;
}

export default function LevelUpOverlay({ show, newLevel, newRank, onClose }: LevelUpOverlayProps) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg-void/85 backdrop-blur-md cursor-pointer"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="relative flex flex-col items-center justify-center pointer-events-none"
          >
            {/* Pulsing ambient glow */}
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 bg-accent-primary-dim blur-[120px] rounded-full w-96 h-96 -z-10"
            />

            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 0.9, y: 0 }}
              transition={{ delay: 0.15 }}
              className="text-accent-text-light font-bold tracking-[0.3em] uppercase text-sm mb-2"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              The System Notices Your Growth
            </motion.p>

            <motion.h1
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 15, stiffness: 350, delay: 0.2 }}
              className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-text-primary to-accent-primary drop-shadow-[0_0_40px_var(--accent-primary-dim)]"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              LEVEL UP!
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.3 }}
              className="mt-8 flex items-center gap-6"
            >
              <div className="text-center">
                <p className="text-muted text-xs uppercase tracking-widest mb-1 font-bold">New Level</p>
                <p
                  className="text-4xl text-text-primary font-bold"
                  style={{ fontFamily: "'Rajdhani', sans-serif" }}
                >
                  {newLevel}
                </p>
              </div>

              {newRank && (
                <>
                  <div className="w-px h-12 bg-white/20"></div>
                  <div className="text-center">
                    <p className="text-muted text-xs uppercase tracking-widest mb-1 font-bold">New Rank</p>
                    <motion.div
                      initial={{ rotate: -15, scale: 0.5 }}
                      animate={{ rotate: 0, scale: 1.15 }}
                      transition={{ type: "spring", damping: 12, stiffness: 300, delay: 0.4 }}
                      className={`rank-badge rank-${newRank} shadow-[0_0_25px_var(--accent-primary-mid)]`}
                    >
                      {newRank}
                    </motion.div>
                  </div>
                </>
              )}
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.3, 0.8, 0.3] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.6 }}
              className="mt-12 text-sm text-text-primary/60 tracking-widest uppercase"
            >
              Click anywhere to continue
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
