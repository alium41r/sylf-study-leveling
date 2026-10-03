import styles from "./HeroJourneyAnchor.module.css";

/** A zero-height waypoint keeps the opening companion out of the content flow. */
export default function HeroJourneyAnchor() {
  return (
    <div className={styles.origin} aria-hidden="true">
      <span
        className={styles.anchor}
        data-journey-stop
        data-journey-start
        data-pose="wave"
        data-message="Your journey starts here."
      />
    </div>
  );
}
