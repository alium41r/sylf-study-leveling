"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  Clock3,
  Coffee,
  Headphones,
  Leaf,
  Moon,
  Mountain,
  Pause,
  Play,
  Sparkles,
  Sun,
  Target,
  Trophy,
  Users,
  WandSparkles,
} from "lucide-react";
import { useAuth } from "../../AuthProvider";
import LandingFooter from "../LandingFooter";
import RealProductScreenshot from "./RealProductScreenshot";
import JourneyPath from "./JourneyPath";
import HeroJourneyAnchor from "./HeroJourneyAnchor";
import CelestialDecor, { CelestialWorld } from "./CelestialDecor";
import WaitlistSignup from "./WaitlistSignup";
import styles from "./Journey.module.css";

function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`${styles.brand} ${small ? styles.smallBrand : ""}`}>
      <Sparkles aria-hidden="true" />
      <span>
        sylf<span className={styles.brandDot}>.</span>
      </span>
    </span>
  );
}
function Waypoint({
  side,
  pose = "idle",
  message = "One step at a time.",
  end = false,
}: {
  side: "left" | "right" | "center";
  pose?: string;
  message?: string;
  end?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.waypoint} ${styles[`${side}Waypoint`]} ${end ? styles.endWaypoint : ""}`}
      data-journey-stop
      data-pose={pose}
      data-message={message}
    >
      <span />
    </span>
  );
}
function ChapterCopy({
  number,
  label,
  title,
  description,
  children,
}: {
  number: string;
  label: string;
  title: ReactNode;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.chapterCopy}>
      <p className={styles.eyebrow}>
        <span>{number}</span>
        {label}
      </p>
      <h2>{title}</h2>
      <p className={styles.chapterDescription}>{description}</p>
      {children}
    </div>
  );
}
function Detail({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li>
      {icon}
      <span>{children}</span>
    </li>
  );
}

type ProductShot = { label: string; title: string; file: string; alt: string };
const focusShots: ProductShot[] = [
  {
    label: "Timer page",
    title: "Focus · Study timer sessions",
    file: "timer page view",
    alt: "The real Sylf timer showing tracked daily focus, active quests, and subject sessions",
  },
  {
    label: "Focus timer",
    title: "Focus · Active focus session",
    file: "focus timer view",
    alt: "The real Sylf focus timer showing an active focus session with immersive atmosphere",
  },
];
const progressionShots: ProductShot[] = [
  {
    label: "Stats",
    title: "Growth · Player statistics",
    file: "stats view",
    alt: "Sylf player statistics showing study stamina, cognitive attributes, quest milestones, and daily activity",
  },
  {
    label: "Collection",
    title: "Collection · Sylf collection",
    file: "collection view",
    alt: "Sylf collection view showing owned items, styles, personal images, and local tracks",
  },
];
const aiShots: ProductShot[] = [
  {
    label: "AI chat",
    title: "Sylvie · AI conversation",
    file: "ai chat view",
    alt: "Sylf AI chat view showing study support conversations, workspace tools, and syllabus breakdown",
  },
  {
    label: "Planner",
    title: "Sylvie · AI study planner",
    file: "planner view",
    alt: "Sylf AI study planner view with adaptive syllabus tracking and quest generation",
  },
  {
    label: "Calendar",
    title: "Calendar · Study schedule",
    file: "calender view",
    alt: "Sylf study calendar view with schedule planning and monthly study stats",
  },
];
const socialShots: ProductShot[] = [
  {
    label: "Your circle",
    title: "Social · Your study circle",
    file: "social view",
    alt: "The real Sylf Social view showing friends, study activity, and Focus Party navigation",
  },
  {
    label: "Focus Party",
    title: "Focus Party · The lobby",
    file: "focus party view",
    alt: "Sylf Focus Party lobby with its create-party control and active study coordination",
  },
  {
    label: "Focus Party timer",
    title: "Focus Party · Active focus room",
    file: "focus party timer view",
    alt: "Sylf Focus Party timer view showing shared study room with real-time active studying scholars",
  },
];
function ScreenshotGallery({
  shots,
  label,
}: {
  shots: ProductShot[];
  label: string;
}) {
  const [index, setIndex] = useState(0);
  const shot = shots[index];
  return (
    <>
      <RealProductScreenshot
        title={shot.title}
        src={`/landing/screenshots/${shot.file}.webp`}
        alt={shot.alt}
      />
      <div className={styles.screenshotViews} role="group" aria-label={label}>
        {shots.map((item, i) => (
          <button
            key={item.file}
            type="button"
            aria-pressed={index === i}
            onClick={() => setIndex(i)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-mode"],
  });
  return () => observer.disconnect();
}

export default function JourneyLanding() {
  const { user, isLoading } = useAuth();
  // Next.js replaces NODE_ENV at build time, so public builds omit app access.
  const showAppAccess = process.env.NODE_ENV === "development";
  const root = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const light = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.getAttribute("data-mode") === "light",
    () => false
  );
  const toggleTheme = () => {
    const mode = light ? "dark" : "light";
    document.documentElement.setAttribute("data-mode", mode);
    try {
      localStorage.setItem("app_mode", mode);
    } catch {
      /* Preview remains usable without storage. */
    }
    window.dispatchEvent(new Event("storage"));
  };
  return (
    <div
      ref={root}
      className={styles.landing}
      data-surface={light ? "light" : "dark"}
      data-motion={paused ? "paused" : "active"}
      data-companion-mode="original"
    >
      <a href="#the-journey" className={styles.skipLink}>
        Skip to the journey
      </a>
      <div className={styles.topGlow} aria-hidden="true" />
      <header className={styles.header}>
        <Link href="/" aria-label="Sylf home">
          <Brand />
        </Link>
        <nav aria-label="Main navigation">
          <a href="#the-journey">The journey</a>
          <a href="#your-companion">Your companion</a>
          <a href="#together">Better together</a>
        </nav>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.themeButton}
            onClick={toggleTheme}
            aria-label={
              light ? "Switch to dark theme" : "Switch to light theme"
            }
          >
            {light ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          {showAppAccess && (
            <Link
              className={styles.loginLink}
              href={!isLoading && user ? "/dashboard" : "/login"}
            >
              {!isLoading && user ? "Dashboard" : "Log in"}
            </Link>
          )}
          <a className={styles.navCta} href="#early-access">
            Get early access <ArrowRight size={14} />
          </a>
        </div>
      </header>
      <section className={styles.hero} aria-labelledby="hero-title">
        <CelestialDecor variant="hero" />
        <p className={styles.heroEyebrow}>
          <span className={styles.liveDot} /> A NEW CHAPTER IN STUDYING
        </p>
        <h1 id="hero-title">
          A little focus.
          <br />
          <em>A different you.</em>
        </h1>
        <p className={styles.heroDescription}>
          A study workspace that brings planning, focus sessions, progress
          tracking, and an AI companion into one place—turning the time you
          study into visible progress.
        </p>
        <div className={styles.heroActions}>
          <a className={styles.primaryButton} href="#early-access">
            Begin your journey <ArrowRight size={17} />
          </a>
          <a className={styles.textButton} href="#the-journey">
            Discover Sylf <ArrowDown size={16} />
          </a>
        </div>
        <p className={styles.heroNote}>
          YOUR EFFORT. YOUR CHARACTER. YOUR NEXT CHAPTER.
        </p>
        <HeroJourneyAnchor />
        <div className={styles.heroStage}>
          <RealProductScreenshot
            hero
            title="Your focus space"
            src="/landing/screenshots/dashboard view.webp"
            alt="Sylf scholar dashboard showing daily focus, active quests, and study overview"
          />
          <div className={styles.heroFloatLabel}>
            <span>
              <Sparkles size={14} /> + a little more you
            </span>
            <p>Real focus. Lasting progression.</p>
          </div>
          <span
            className={styles.heroAnchor}
            data-journey-stop
            data-pose="idle"
            data-message="Your journey starts here."
            aria-hidden="true"
          />
        </div>
        <div className={styles.heroBelow}>
          <span>Built for the beautifully ambitious.</span>
          <div>
            <span>
              <BookOpen size={14} /> STUDY
            </span>
            <i />
            <span>
              <Sparkles size={14} /> LEVEL UP
            </span>
            <i />
            <span>
              <Users size={14} /> BELONG
            </span>
          </div>
          <a href="#the-journey" aria-label="Scroll to explore the journey">
            <ArrowDown size={17} />
          </a>
        </div>
      </section>
      <div id="the-journey" className={styles.journeyIntro}>
        <CelestialDecor variant="intro" />
        <span
          className={styles.introAnchor}
          data-journey-stop
          data-message="Every journey starts with a little curiosity."
          aria-hidden="true"
        />
        <span className={styles.eyebrow}>SMALL STEPS. A BIGGER STORY.</span>
        <h2>
          Every chapter starts
          <br />
          with showing up.
        </h2>
        <p>Follow a little curiosity. See where it takes you.</p>
      </div>
      <div className={styles.chapters}>
        <section id="focus" className={styles.chapter}>
          <CelestialDecor variant="focus" />
          <Waypoint
            side="left"
            pose="sit"
            message="First, let’s find our focus."
          />
          <ChapterCopy
            number="01"
            label="FIND YOUR FOCUS"
            title={
              <>
                Less noise.
                <br />
                <em>More flow.</em>
              </>
            }
            description="A quiet corner of the internet, just for your mind. Set an intention, settle into your favorite space, and give one thing your attention."
          >
            <ul className={styles.details}>
              <Detail icon={<Clock3 />}>
                Focus sessions that fit your rhythm
              </Detail>
              <Detail icon={<Headphones />}>
                Ambient soundscapes for deep work
              </Detail>
              <Detail icon={<Mountain />}>
                A study space that feels like you
              </Detail>
            </ul>
            <a className={styles.chapterLink} href="#early-access">
              Make room for focus <ArrowRight size={16} />
            </a>
          </ChapterCopy>
          <div className={styles.chapterPreview}>
            <ScreenshotGallery
              shots={focusShots}
              label="Focus timer screenshots"
            />
            <p className={styles.previewCaption}>
              <span className={styles.captionDot} /> A space to settle in. A
              timer to begin.
            </p>
          </div>
          <Waypoint
            side="left"
            pose="sit"
            message="One good session is a start."
            end
          />
        </section>
        <section
          id="progression"
          className={`${styles.chapter} ${styles.reverseChapter}`}
        >
          <CelestialDecor variant="progression" />
          <Waypoint
            side="right"
            pose="celebrate"
            message="Look at you, leveling up."
          />
          <ChapterCopy
            number="02"
            label="GROW WITH EVERY SESSION"
            title={
              <>
                Your effort.
                <br />
                <em>Made visible.</em>
              </>
            }
            description="The work you do matters. Watch focused minutes become XP, new levels, and a story of progress that’s entirely your own."
          >
            <ul className={styles.details}>
              <Detail icon={<Sparkles />}>
                Turn real study time into experience
              </Detail>
              <Detail icon={<Trophy />}>Reach new ranks and milestones</Detail>
              <Detail icon={<ChartNoAxesCombined />}>
                See how far you’ve come
              </Detail>
            </ul>
            <span className={styles.editorialNote}>
              Progress over perfection. Always.
            </span>
          </ChapterCopy>
          <div className={styles.chapterPreview}>
            <ScreenshotGallery
              shots={progressionShots}
              label="Progression screenshots"
            />
            <p className={styles.previewCaption}>
              Your pace. Your progress. All in one place.
            </p>
          </div>
          <Waypoint
            side="right"
            pose="celebrate"
            message="That’s a little more you."
            end
          />
        </section>
        <section id="your-companion" className={styles.chapter}>
          <CelestialDecor variant="companion" />
          <Waypoint
            side="left"
            pose="wave"
            message="A little personality goes a long way."
          />
          <ChapterCopy
            number="03"
            label="A LITTLE MORE YOU"
            title={
              <>
                Serious goals.
                <br />
                <em>A little character.</em>
              </>
            }
            description="Meet the part of you that’s ready for an adventure. Find a companion, make your space your own, and bring a little personality to the everyday."
          >
            <ul className={styles.details}>
              <Detail icon={<WandSparkles />}>
                Express yourself through your avatar
              </Detail>
              <Detail icon={<Leaf />}>
                Discover your own look and atmosphere
              </Detail>
              <Detail icon={<Sparkles />}>
                Let your identity grow with you
              </Detail>
            </ul>
            <span className={styles.editorialNote}>
              Big ambitions. Small, excellent company.
            </span>
          </ChapterCopy>
          <div className={styles.chapterPreview}>
            <RealProductScreenshot
              title="Identity · Character studio"
              src="/landing/screenshots/locker view.webp"
              alt="Sylf locker view showing scholar arsenal, identity hub, and character studio options"
            />
          </div>
          <Waypoint
            side="left"
            pose="wave"
            message="There’s a little magic in all of us."
            end
          />
        </section>
        <section
          id="study-ai"
          className={`${styles.chapter} ${styles.reverseChapter}`}
        >
          <CelestialDecor variant="planning" />
          <Waypoint
            side="right"
            pose="read"
            message="Let’s work this out together."
          />
          <ChapterCopy
            number="04"
            label="A CLEARER WAY FORWARD"
            title={
              <>
                Big syllabus.
                <br />
                <em>Small next step.</em>
              </>
            }
            description="Some days, starting is the hardest part. Sylf AI helps turn a tangle of topics into a plan you can actually begin."
          >
            <ul className={styles.details}>
              <Detail icon={<CalendarDays />}>
                Break study goals into manageable steps
              </Detail>
              <Detail icon={<BookOpen />}>
                Work through ideas with study support
              </Detail>
              <Detail icon={<Target />}>Keep your next task in sight</Detail>
            </ul>
            <a className={styles.chapterLink} href="#early-access">
              Find your next step <ArrowRight size={16} />
            </a>
          </ChapterCopy>
          <div className={styles.chapterPreview}>
            <ScreenshotGallery
              shots={aiShots}
              label="AI, planner, and calendar screenshots"
            />
            <p className={styles.previewCaption}>
              Study support, with your goals in view.
            </p>
          </div>
          <Waypoint
            side="right"
            pose="read"
            message="A plan. A breath. You’ve got this."
            end
          />
        </section>
        <section id="together" className={styles.chapter}>
          <CelestialDecor variant="together" />
          <Waypoint
            side="left"
            pose="wave"
            message="There’s room for your friends, too."
          />
          <ChapterCopy
            number="05"
            label="GOOD COMPANY. BETTER FOCUS."
            title={
              <>
                On your path.
                <br />
                <em>In good company.</em>
              </>
            }
            description="Meet in a focus party, find your rhythm, and put in the work together. Different desks and different dreams. A little shared momentum."
          >
            <ul className={styles.details}>
              <Detail icon={<Users />}>
                A shared study room for your circle
              </Detail>
              <Detail icon={<Clock3 />}>Settle into a session together</Detail>
              <Detail icon={<Coffee />}>
                Show up for yourself, and each other
              </Detail>
            </ul>
            <a className={styles.chapterLink} href="#early-access">
              Find your study people <ArrowRight size={16} />
            </a>
          </ChapterCopy>
          <div className={styles.chapterPreview}>
            <ScreenshotGallery shots={socialShots} label="Social screenshots" />
            <p className={styles.previewCaption}>
              <span className={styles.captionDot} /> A little less alone. A
              little further along.
            </p>
          </div>
          <Waypoint side="left" pose="wave" message="Better, together." end />
        </section>
      </div>
      <section id="early-access" className={styles.finalChapter}>
        <CelestialDecor variant="finale" />
        <Waypoint
          side="center"
          pose="celebrate"
          message="Your story is just beginning."
        />
        <div className={styles.finalEmblem}>
          <Sparkles size={30} strokeWidth={1} />
        </div>
        <p className={styles.eyebrow}>THIS IS ONLY THE BEGINNING</p>
        <h2>
          Your next chapter
          <br />
          <em>looks good on you.</em>
        </h2>
        <p>
          Start with a little focus. We’ll be here for the rest.
          <br />
          Join the waitlist and be among the first to find your Sylf.
        </p>
        <WaitlistSignup />
        <div className={styles.closingLine}>
          <span />
          <Sparkles size={14} />
          <span />
        </div>
        <p className={styles.closingWords}>
          A little, every day, becomes a lot.
        </p>
      </section>
      <div className={styles.footerWrap}>
        <CelestialDecor variant="footer" />
        <div className={styles.footerTop}>
          <Link href="/" aria-label="Sylf home">
            <Brand />
          </Link>
          <span>For who you’re becoming.</span>
          <button
            type="button"
            className={styles.motionButton}
            aria-pressed={paused}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
            {paused ? "Resume companion" : "Pause companion"}
          </button>
        </div>
        <LandingFooter showAppAccess={showAppAccess} />
      </div>
      <JourneyPath root={root} paused={paused} />
      <CelestialWorld root={root} paused={paused} />
    </div>
  );
}
