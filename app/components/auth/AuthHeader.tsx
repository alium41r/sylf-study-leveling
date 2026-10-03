import React from "react";
import Link from "next/link";
import styles from "./AuthLayout.module.css";

/**
 * AuthHeader: Top navigation bar for auth pages.
 * Displays brand mark '✦ sylf.' on the left and '✦ A CALMER PLACE TO STUDY' on the right.
 */
export function AuthHeader() {
  return (
    <header className={styles.header}>
      {/* Brand logo linking back to home */}
      <Link href="/" className={styles.brand} aria-label="Sylf Home">
        <svg
          className={styles.brandSparkle}
          width="18"
          height="18"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M8 0L9.8 6.2L16 8L9.8 9.8L8 16L6.2 9.8L0 8L6.2 6.2L8 0Z"
            fill="currentColor"
          />
        </svg>
        <span>
          sylf<span className={styles.brandDot}>.</span>
        </span>
      </Link>

      {/* Right tagline */}
      <div className={`${styles.tagline} hidden sm:flex`}>
        <svg
          className={styles.taglineSparkle}
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M8 0L9.8 6.2L16 8L9.8 9.8L8 16L6.2 9.8L0 8L6.2 6.2L8 0Z"
            fill="currentColor"
          />
        </svg>
        <span>A Calmer Place to Study</span>
      </div>
    </header>
  );
}
export default AuthHeader;
