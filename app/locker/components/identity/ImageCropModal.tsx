"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FlipHorizontal,
  Move,
  Maximize2,
  Check,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Sparkles,
} from "lucide-react";

interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  cropType: "avatar" | "banner";
  title?: string;
  onApply: (croppedDataUrl: string) => void;
  onClose: () => void;
}

export function ImageCropModal({
  isOpen,
  imageSrc,
  cropType,
  title,
  onApply,
  onClose,
}: ImageCropModalProps) {
  const isAvatar = cropType === "avatar";

  // Target aspect ratios & output dimensions
  // Avatar: 1:1 (400x400), Banner: 3:1 or 16:9 (1200x400)
  const targetAspect = isAvatar ? 1 : 3;
  const outputW = isAvatar ? 400 : 1200;
  const outputH = isAvatar ? 400 : 400;

  // Viewport container and image refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Transformation states
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [isFlipped, setIsFlipped] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Drag interaction
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  // Reset parameters when imageSrc changes or modal opens
  useEffect(() => {
    if (isOpen && imageSrc) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setRotation(0);
      setIsFlipped(false);

      const img = new Image();
      img.onload = () => {
        setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = imageSrc;
    }
  }, [isOpen, imageSrc]);

  // Handle Drag / Pan Events
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        panX: pan.x,
        panY: pan.y,
      };
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      });
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      setPan({
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove);
      window.addEventListener("touchend", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleMouseUp);
    };
  }, [isDragging]);

  // Quick Preset Alignments (Left, Center, Right, Top, Bottom)
  const handleAlign = (preset: "left" | "center" | "right" | "top" | "bottom" | "fit") => {
    if (!containerRef.current || !naturalSize.width) return;

    if (preset === "fit") {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const { clientWidth: cw, clientHeight: ch } = containerRef.current;
    // Calculate effective rendered dimension
    const baseScale = Math.max(cw / naturalSize.width, ch / naturalSize.height);
    const scaledW = naturalSize.width * baseScale * zoom;
    const scaledH = naturalSize.height * baseScale * zoom;

    const maxShiftX = Math.max(0, (scaledW - cw) / 2);
    const maxShiftY = Math.max(0, (scaledH - ch) / 2);

    if (preset === "left") {
      setPan((p) => ({ ...p, x: maxShiftX }));
    } else if (preset === "right") {
      setPan((p) => ({ ...p, x: -maxShiftX }));
    } else if (preset === "center") {
      setPan({ x: 0, y: 0 });
    } else if (preset === "top") {
      setPan((p) => ({ ...p, y: maxShiftY }));
    } else if (preset === "bottom") {
      setPan((p) => ({ ...p, y: -maxShiftY }));
    }
  };

  // Perform Final Crop & Render onto Canvas
  const handleApplyCrop = () => {
    if (!containerRef.current || !imageSrc) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = outputW;
      canvas.height = outputH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const container = containerRef.current;
      if (!container) return;

      const cw = container.clientWidth;
      const ch = container.clientHeight;

      // Base cover scale of container
      const baseScale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const currentScale = baseScale * zoom;

      // Center offset
      const cx = cw / 2;
      const cy = ch / 2;

      // Scale to canvas coordinates
      const scaleCanvas = outputW / cw;

      ctx.save();
      // Translate to canvas center
      ctx.translate(outputW / 2, outputH / 2);
      // Apply pan scaled to canvas
      ctx.translate(pan.x * scaleCanvas, pan.y * scaleCanvas);
      // Apply rotation
      ctx.rotate((rotation * Math.PI) / 180);
      // Apply flip
      if (isFlipped) {
        ctx.scale(-1, 1);
      }

      // Draw image centered
      const drawW = img.naturalWidth * currentScale * scaleCanvas;
      const drawH = img.naturalHeight * currentScale * scaleCanvas;

      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      const croppedDataUrl = canvas.toDataURL("image/webp", 0.90);
      onApply(croppedDataUrl);
      onClose();
    };
    img.src = imageSrc;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl bg-bg-panel border border-border-subtle shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-border-subtle bg-bg-abyss/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-400">
              <Move className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold font-['Rajdhani'] text-text-primary">
                {title || (isAvatar ? "Frame & Position Avatar" : "Frame & Position Banner")}
              </h3>
              <p className="text-xs text-text-muted font-['Rajdhani']">
                Drag to reposition • Use sliders or presets to zoom and align dimensions
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-card transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Framing Viewport Stage */}
        <div className="p-6 flex flex-col items-center justify-center bg-bg-abyss/60 select-none">
          <div
            className={`relative overflow-hidden bg-black border-2 border-dashed border-emerald-500/50 shadow-2xl flex items-center justify-center cursor-grab active:cursor-grabbing ${
              isAvatar
                ? "w-64 h-64 rounded-full"
                : "w-full max-w-lg h-44 sm:h-52 rounded-xl"
            }`}
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >
            {/* Background Image with Transform */}
            {imageSrc && (
              <img
                ref={imageRef}
                src={imageSrc}
                alt="Framing preview"
                className="max-w-none pointer-events-none transition-transform duration-75"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg) scaleX(${
                    isFlipped ? -1 : 1
                  })`,
                  transformOrigin: "center center",
                  objectFit: "cover",
                  width: isAvatar ? "100%" : "100%",
                  height: isAvatar ? "100%" : "100%",
                }}
                draggable={false}
              />
            )}

            {/* Framing Guide Lines Overlay */}
            <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-white/10 opacity-30">
              <div className="border-r border-b border-white/15" />
              <div className="border-r border-b border-white/15" />
              <div className="border-b border-white/15" />
              <div className="border-r border-b border-white/15" />
              <div className="border-r border-b border-white/15" />
              <div className="border-b border-white/15" />
              <div className="border-r border-white/15" />
              <div className="border-r border-white/15" />
              <div />
            </div>

            {/* Floating Drag Prompt */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-sm border border-white/10 text-[10px] font-['Rajdhani'] font-bold text-emerald-400 pointer-events-none shadow-sm flex items-center gap-1">
              <Move className="w-3 h-3" />
              <span>Drag to Pan</span>
            </div>
          </div>
        </div>

        {/* Transformation & Alignment Controls Panel */}
        <div className="p-5 border-t border-border-subtle bg-bg-panel/95 space-y-4">
          {/* Zoom Slider Row */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, +(z - 0.15).toFixed(2)))}
              className="p-2 rounded-xl bg-bg-abyss border border-border-subtle text-text-muted hover:text-text-primary hover:border-emerald-500/40 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="flex-1 flex items-center gap-3">
              <span className="text-[11px] font-bold font-mono text-text-muted w-10">
                {Math.round(zoom * 100)}%
              </span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.02"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-bg-abyss rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))}
              className="p-2 rounded-xl bg-bg-abyss border border-border-subtle text-text-muted hover:text-text-primary hover:border-emerald-500/40 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Alignment Presets */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border-subtle/60">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted mr-1">
                Quick Align:
              </span>
              {!isAvatar && (
                <>
                  <button
                    type="button"
                    onClick={() => handleAlign("left")}
                    className="px-2.5 py-1 rounded-lg bg-bg-abyss border border-border-subtle hover:border-emerald-500/40 text-[11px] font-['Rajdhani'] font-bold text-text-secondary hover:text-text-primary flex items-center gap-1 transition-all"
                  >
                    <AlignLeft className="w-3 h-3" />
                    <span>Show Left</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAlign("center")}
                    className="px-2.5 py-1 rounded-lg bg-bg-abyss border border-border-subtle hover:border-emerald-500/40 text-[11px] font-['Rajdhani'] font-bold text-text-secondary hover:text-text-primary flex items-center gap-1 transition-all"
                  >
                    <AlignCenter className="w-3 h-3" />
                    <span>Center</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAlign("right")}
                    className="px-2.5 py-1 rounded-lg bg-bg-abyss border border-border-subtle hover:border-emerald-500/40 text-[11px] font-['Rajdhani'] font-bold text-text-secondary hover:text-text-primary flex items-center gap-1 transition-all"
                  >
                    <AlignRight className="w-3 h-3" />
                    <span>Show Right</span>
                  </button>
                </>
              )}
              {isAvatar && (
                <>
                  <button
                    type="button"
                    onClick={() => handleAlign("center")}
                    className="px-2.5 py-1 rounded-lg bg-bg-abyss border border-border-subtle hover:border-emerald-500/40 text-[11px] font-['Rajdhani'] font-bold text-text-secondary hover:text-text-primary flex items-center gap-1 transition-all"
                  >
                    <AlignCenter className="w-3 h-3" />
                    <span>Center Face</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAlign("top")}
                    className="px-2.5 py-1 rounded-lg bg-bg-abyss border border-border-subtle hover:border-emerald-500/40 text-[11px] font-['Rajdhani'] font-bold text-text-secondary hover:text-text-primary flex items-center gap-1 transition-all"
                  >
                    <span>Top</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAlign("bottom")}
                    className="px-2.5 py-1 rounded-lg bg-bg-abyss border border-border-subtle hover:border-emerald-500/40 text-[11px] font-['Rajdhani'] font-bold text-text-secondary hover:text-text-primary flex items-center gap-1 transition-all"
                  >
                    <span>Bottom</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => handleAlign("fit")}
                className="px-2.5 py-1 rounded-lg bg-bg-abyss border border-border-subtle hover:border-emerald-500/40 text-[11px] font-['Rajdhani'] font-bold text-text-secondary hover:text-text-primary flex items-center gap-1 transition-all"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Reset Fit</span>
              </button>
            </div>

            {/* Rotate & Flip Tools */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="p-1.5 rounded-lg bg-bg-abyss border border-border-subtle text-text-muted hover:text-text-primary hover:border-emerald-500/40 transition-colors"
                title="Rotate 90°"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsFlipped((f) => !f)}
                className="p-1.5 rounded-lg bg-bg-abyss border border-border-subtle text-text-muted hover:text-text-primary hover:border-emerald-500/40 transition-colors"
                title="Flip Horizontal"
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-bg-abyss hover:bg-bg-panel border border-border-subtle text-xs font-['Rajdhani'] font-bold text-text-secondary hover:text-text-primary transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyCrop}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-['Rajdhani'] font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg hover:shadow-emerald-500/20"
            >
              <Check className="w-4 h-4" />
              <span>Apply & Save Framing</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImageCropModal;
