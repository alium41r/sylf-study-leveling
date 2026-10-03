"use client";

import React, { useState } from "react";
import {
  SYLV_ANCHORS,
  SYLV_COLOR_PRESETS,
  SylvAnchorKey,
  SylvAppearance,
  SylvColors,
  SylvGender,
  SylvRenderer,
  createDefaultSylvAppearance,
  getDefaultColors,
} from "../../lib/sylvs";
import s from "./SylvPreview.module.css";

type ViewSizeMode = "compare" | 48 | 80 | 140 | 240 | 380;

export default function SylvPreviewPage() {
  const [gender, setGender] = useState<SylvGender>("male");
  const [viewSize, setViewSize] = useState<ViewSizeMode>(240);
  const [showAnchors, setShowAnchors] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showCoordinates, setShowCoordinates] = useState<boolean>(true);
  const [selectedAnchor, setSelectedAnchor] = useState<SylvAnchorKey | null>(
    "HEAD"
  );

  const [maleColors, setMaleColors] = useState<SylvColors>(
    getDefaultColors("male")
  );
  const [femaleColors, setFemaleColors] = useState<SylvColors>(
    getDefaultColors("female")
  );

  const currentColors = gender === "male" ? maleColors : femaleColors;
  const setCurrentColors = (updater: (prev: SylvColors) => SylvColors) => {
    if (gender === "male") {
      setMaleColors(updater);
    } else {
      setFemaleColors(updater);
    }
  };

  const appearance: SylvAppearance = {
    gender,
    colors: currentColors,
  };

  const maleAppearance = createDefaultSylvAppearance("male", maleColors);
  const femaleAppearance = createDefaultSylvAppearance("female", femaleColors);

  const handleColorChange = (key: keyof SylvColors, value: string) => {
    setCurrentColors((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handlePresetSelect = (presetColors: SylvColors) => {
    setCurrentColors(() => ({
      ...presetColors,
    }));
  };

  const resetDefaults = () => {
    setMaleColors(getDefaultColors("male"));
    setFemaleColors(getDefaultColors("female"));
  };

  return (
    <div className={s.container}>
      {/* Header Bar */}
      <header className={s.header}>
        <div className={s.titleArea}>
          <h1 className={s.title}>Sylv Companion Workbench</h1>
          <span className={s.badge}>Phase 1 Foundation</span>
        </div>

        <button
          onClick={resetDefaults}
          className={s.presetChip}
          style={{ background: "#1e293b" }}
        >
          Reset All Defaults
        </button>
      </header>

      {/* Main Grid Layout */}
      <div className={s.content}>
        {/* Stage Area */}
        <div className={s.stageCard}>
          {/* Stage Controls */}
          <div className={s.stageToolbar}>
            <div className={s.viewModePillGroup}>
              <button
                className={`${s.viewModeBtn} ${
                  viewSize === "compare" ? s.viewModeBtnActive : ""
                }`}
                onClick={() => setViewSize("compare")}
              >
                Side-by-Side
              </button>
              <button
                className={`${s.viewModeBtn} ${
                  viewSize === 48 ? s.viewModeBtnActive : ""
                }`}
                onClick={() => setViewSize(48)}
              >
                48px
              </button>
              <button
                className={`${s.viewModeBtn} ${
                  viewSize === 80 ? s.viewModeBtnActive : ""
                }`}
                onClick={() => setViewSize(80)}
              >
                80px
              </button>
              <button
                className={`${s.viewModeBtn} ${
                  viewSize === 140 ? s.viewModeBtnActive : ""
                }`}
                onClick={() => setViewSize(140)}
              >
                140px
              </button>
              <button
                className={`${s.viewModeBtn} ${
                  viewSize === 240 ? s.viewModeBtnActive : ""
                }`}
                onClick={() => setViewSize(240)}
              >
                240px
              </button>
              <button
                className={`${s.viewModeBtn} ${
                  viewSize === 380 ? s.viewModeBtnActive : ""
                }`}
                onClick={() => setViewSize(380)}
              >
                380px
              </button>
            </div>

            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
              Canvas: 400 × 600 (viewBox)
            </div>
          </div>

          {/* Interactive Stage Canvas */}
          <div className={s.stageCanvasWrapper}>
            {viewSize === "compare" ? (
              <div className={s.sideBySideWrapper}>
                <div className={s.characterColumn}>
                  <SylvRenderer
                    appearance={maleAppearance}
                    size={280}
                    showAnchors={showAnchors}
                    selectedAnchor={selectedAnchor}
                    onSelectAnchor={setSelectedAnchor}
                    showGrid={showGrid}
                    showCoordinates={showCoordinates}
                  />
                  <div className={s.characterLabel}>Male Base (Porcelain / Slate)</div>
                </div>

                <div className={s.characterColumn}>
                  <SylvRenderer
                    appearance={femaleAppearance}
                    size={280}
                    showAnchors={showAnchors}
                    selectedAnchor={selectedAnchor}
                    onSelectAnchor={setSelectedAnchor}
                    showGrid={showGrid}
                    showCoordinates={showCoordinates}
                  />
                  <div className={s.characterLabel}>Female Base (Porcelain / Rose)</div>
                </div>
              </div>
            ) : (
              <div className={s.characterColumn}>
                <SylvRenderer
                  appearance={appearance}
                  size={viewSize}
                  showAnchors={showAnchors}
                  selectedAnchor={selectedAnchor}
                  onSelectAnchor={setSelectedAnchor}
                  showGrid={showGrid}
                  showCoordinates={showCoordinates}
                />
                <div className={s.characterLabel}>
                  {gender === "male" ? "Male Base Sylv" : "Female Base Sylv"} (
                  {viewSize}px)
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Controls */}
        <aside className={s.sidebar}>
          {/* Gender Switcher */}
          <div className={s.panel}>
            <h2 className={s.panelTitle}>Gender Skeleton</h2>
            <div className={s.genderGrid}>
              <button
                className={`${s.genderBtn} ${
                  gender === "male" ? s.genderBtnActive : ""
                }`}
                onClick={() => setGender("male")}
              >
                Male Base
              </button>
              <button
                className={`${s.genderBtn} ${
                  gender === "female" ? s.genderBtnActive : ""
                }`}
                onClick={() => setGender("female")}
              >
                Female Base
              </button>
            </div>
          </div>

          {/* Color Variable Architecture */}
          <div className={s.panel}>
            <h2 className={s.panelTitle}>Color Token System</h2>
            <div className={s.colorPresets}>
              {SYLV_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={s.presetChip}
                  onClick={() => handlePresetSelect(preset.colors)}
                >
                  {preset.name}
                </button>
              ))}
            </div>

            <div className={s.colorRow}>
              <span className={s.colorLabel}>--sylv-primary (Body)</span>
              <div className={s.colorInputWrap}>
                <input
                  type="color"
                  className={s.colorPicker}
                  value={currentColors.primary}
                  onChange={(e) => handleColorChange("primary", e.target.value)}
                />
                <input
                  type="text"
                  className={s.hexInput}
                  value={currentColors.primary}
                  onChange={(e) => handleColorChange("primary", e.target.value)}
                />
              </div>
            </div>

            <div className={s.colorRow}>
              <span className={s.colorLabel}>--sylv-secondary (Shade)</span>
              <div className={s.colorInputWrap}>
                <input
                  type="color"
                  className={s.colorPicker}
                  value={currentColors.secondary}
                  onChange={(e) =>
                    handleColorChange("secondary", e.target.value)
                  }
                />
                <input
                  type="text"
                  className={s.hexInput}
                  value={currentColors.secondary}
                  onChange={(e) =>
                    handleColorChange("secondary", e.target.value)
                  }
                />
              </div>
            </div>

            <div className={s.colorRow}>
              <span className={s.colorLabel}>--sylv-eye (Pupil)</span>
              <div className={s.colorInputWrap}>
                <input
                  type="color"
                  className={s.colorPicker}
                  value={currentColors.eye}
                  onChange={(e) => handleColorChange("eye", e.target.value)}
                />
                <input
                  type="text"
                  className={s.hexInput}
                  value={currentColors.eye}
                  onChange={(e) => handleColorChange("eye", e.target.value)}
                />
              </div>
            </div>

            <div className={s.colorRow}>
              <span className={s.colorLabel}>--sylv-accent (Contour)</span>
              <div className={s.colorInputWrap}>
                <input
                  type="color"
                  className={s.colorPicker}
                  value={currentColors.accent ?? currentColors.secondary}
                  onChange={(e) => handleColorChange("accent", e.target.value)}
                />
                <input
                  type="text"
                  className={s.hexInput}
                  value={currentColors.accent ?? currentColors.secondary}
                  onChange={(e) => handleColorChange("accent", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Anchor & Alignment Debug Controls */}
          <div className={s.panel}>
            <h2 className={s.panelTitle}>Anchor Debug Overlay</h2>
            <div className={s.toggleRow}>
              <span className={s.toggleLabel}>Show Anchors</span>
              <label className={s.switch}>
                <input
                  type="checkbox"
                  checked={showAnchors}
                  onChange={(e) => setShowAnchors(e.target.checked)}
                />
                <span className={s.slider}></span>
              </label>
            </div>

            <div className={s.toggleRow}>
              <span className={s.toggleLabel}>Show Alignment Grid</span>
              <label className={s.switch}>
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={(e) => setShowGrid(e.target.checked)}
                />
                <span className={s.slider}></span>
              </label>
            </div>

            <div className={s.toggleRow}>
              <span className={s.toggleLabel}>Show Coordinates</span>
              <label className={s.switch}>
                <input
                  type="checkbox"
                  checked={showCoordinates}
                  onChange={(e) => setShowCoordinates(e.target.checked)}
                />
                <span className={s.slider}></span>
              </label>
            </div>

            {selectedAnchor && SYLV_ANCHORS[selectedAnchor] && (
              <div className={s.anchorInspector}>
                <div className={s.anchorInspectorTitle}>
                  {SYLV_ANCHORS[selectedAnchor].name} [{selectedAnchor}]
                </div>
                <div style={{ color: "#38bdf8", marginBottom: "0.2rem" }}>
                  Coordinates: X: {SYLV_ANCHORS[selectedAnchor].point.x}, Y:{" "}
                  {SYLV_ANCHORS[selectedAnchor].point.y}
                </div>
                <div className={s.anchorDesc}>
                  {SYLV_ANCHORS[selectedAnchor].description}
                </div>
              </div>
            )}
          </div>

          {/* SVGO & Complexity Metrics */}
          <div className={s.panel}>
            <h2 className={s.panelTitle}>Asset Geometry Quality</h2>
            <div className={s.statsGrid}>
              <div className={s.statCard}>
                <div className={s.statVal}>
                  {gender === "male" ? "14" : "15"}
                </div>
                <div className={s.statLbl}>Vector Paths</div>
              </div>
              <div className={s.statCard}>
                <div className={s.statVal}>4</div>
                <div className={s.statLbl}>Eye Ellipses</div>
              </div>
              <div className={s.statCard}>
                <div className={s.statVal}>
                  {gender === "male" ? "3.9 KB" : "4.1 KB"}
                </div>
                <div className={s.statLbl}>Optimized Size</div>
              </div>
              <div className={s.statCard}>
                <div className={s.statVal}>15</div>
                <div className={s.statLbl}>Shared Anchors</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
