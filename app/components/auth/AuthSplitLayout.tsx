import React from "react";
import AuthHeader from "./AuthHeader";
import CelestialStudyArtwork from "./CelestialStudyArtwork";
import AuthGlowingStars from "./AuthGlowingStars";
import styles from "./AuthLayout.module.css";

interface AuthSplitLayoutProps {
  children: React.ReactNode;
  rightContent?: React.ReactNode;
}

/**
 * AuthSplitLayout: Responsive 2-column split composition for Login and Register.
 * 
 * - Background layer: exact Figma exported artwork from "celestial-study — full illustration.svg"
 * - Glow layers: illuminated hanging/standing lanterns + subtle glowing stars & sparkles
 * - Left side: open, floating form with zero enclosing card.
 * - Right side: study scene area with floating study timer HUD.
 * - Header: Sylf branding and "A CALMER PLACE TO STUDY" tagline.
 */
export function AuthSplitLayout({ children, rightContent }: AuthSplitLayoutProps) {
  return (
    <div className={styles.page}>
      {/* ─── Layer 1: Figma Celestial Study Artwork with Lantern Illumination ─── */}
      <CelestialStudyArtwork />

      {/* ─── Layer 2: Subtle Glowing Stars & Sparkles Overlay ─── */}
      <AuthGlowingStars />

      {/* ─── Layer 3: Top Branding Header (✦ sylf. & tagline) ─── */}
      <AuthHeader />

      {/* ─── Layer 4: Main Two-Column Split (Form on left, Scene on right) */}
      <main className={styles.mainSplit}>
        {/* Left Column: Floating Auth Form Area */}
        <section className={styles.leftColumn} aria-label="Authentication">
          <div className={styles.floatingFormContainer}>
            {/* Auth Form Children */}
            {children}
          </div>
        </section>

        {/* Right Column: Scene Container (Preserving grid layout on desktop) */}
        <aside className={styles.rightColumn} aria-label="Study Scene">
          {rightContent !== undefined ? rightContent : null}
        </aside>
      </main>
    </div>
  );
}

export default AuthSplitLayout;
