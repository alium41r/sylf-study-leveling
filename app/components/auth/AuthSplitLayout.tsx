"use client";

import { useState, type ReactNode, type FocusEvent } from "react";
import AuthHeader from "./AuthHeader";
import CelestialDecor from "../landing/journey/CelestialDecor";
import StudyIslandScene, {
  type IslandAttention,
  type IslandGreeting,
} from "./StudyIslandScene";
import styles from "./AuthLayout.module.css";

/** Shared, naturally scrolling composition for both authentication routes. */
export function AuthSplitLayout({
  children,
  greeting,
}: {
  children: ReactNode;
  greeting: IslandGreeting;
}) {
  const [attention, setAttention] = useState<IslandAttention>("reading");
  const noticeFocus = (event: FocusEvent<HTMLElement>) => {
    const target = event.target;
    setAttention(
      target.closest("[data-private-field]")
        ? "private"
        : target instanceof HTMLInputElement
          ? "curious"
          : "reading"
    );
  };
  return (
    <div className={styles.page}>
      <div className={styles.edgeDecor} aria-hidden="true">
        <CelestialDecor variant="auth" />
      </div>
      <a className={styles.skipLink} href="#auth-form">
        Skip to sign in or sign up
      </a>
      <AuthHeader />
      <div className={styles.mainSplit}>
        <section
          id="auth-form"
          className={styles.formColumn}
          aria-label="Authentication"
          tabIndex={-1}
          onFocusCapture={noticeFocus}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              setAttention("reading");
          }}
        >
          <div className={styles.floatingFormContainer}>{children}</div>
          <p className={styles.formFootnote}>
            A calmer place to study. A little more you.
          </p>
        </section>
        <StudyIslandScene attention={attention} greeting={greeting} />
      </div>
    </div>
  );
}
export default AuthSplitLayout;
