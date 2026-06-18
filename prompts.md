# Arbisoft Internship AI Prompts Log

## Day 1: Environment Setup & Framework Initialization

**Objective:** Establish the local development environment, securely clone the remote GitHub repository, initialize the Next.js framework, and decode the foundational mechanics of version control and local JavaScript runtimes.

**AI Interaction Log:**

- **Prompt:** "how do i do the github task overall completely? what steps should i take to clone the repo to my mac and what exactly is version control?"
  - **Application & Learning:** Executed Git cloning protocols. Mapped the conceptual relationship between a remote cloud repository (GitHub) and a local working directory, establishing the secure authentication link required to track and synchronize code changes over time.
- **Prompt:** "give me the terminal command to build the next.js app. after that explain EVEYTHING to me. what is node.js, local execution environment, typescript, tailwind css, and eslint?"
  - **Application & Learning:** Executed `npx create-next-app` to scaffold the frontend architecture. Analyzed how Node.js acts as an underlying engine that runs code outside the browser, while `npx` dynamically fetches and executes framework packages. Discovered that TypeScript adds strict type-safety to prevent runtime bugs before they occur.
- **Prompt:** "it gave me an npm naming restriction error about capital letters. what is npm, why is it doing this, and how do i fix the folder name?"
  - **Application & Learning:** Investigated Node Package Manager (`npm`) architecture. Learned that local directories used to initialize modern frameworks are registered as software packages and must strictly comply with URL-safe registry standards. Resolved the conflict by restructuring the local directory from `Arbisoft-internship` to `arbisoft-internship`.

---

## Day 2: Server Initialization & Route Architecture

**Objective:** Boot the local development server, construct the initial route architecture (`/about`, `/contact`), establish a shared Single Page Application (SPA) layout, and decode the underlying mechanics of modern frontend routing.

**AI Interaction Log:**

- **Prompt:** "its day 2 what do i do today? tell me the steps i should take to boot the local server and explain what a local execution environment and npm run dev actually are."
  - **Application & Learning:** Executed `npm run dev` to boot the compiler. Analyzed how Node.js creates a local execution environment that actively monitors directory changes, compiling TypeScript into browser-readable JavaScript in real-time and serving it via port `3000`.
- **Prompt:** "how do i build a new page for /about? explain the process done here and how next.js routing works."
  - **Application & Learning:** Constructed the `app/about/page.tsx` directory. Mapped the concept of file-system routing, understanding that physical folder hierarchies strictly dictate the application's URL paths, and React components act as the UI payload for those specific endpoints.
- **Prompt:** "look at this error: 'The default export is not a React Component'. why is it happening and how do i fix it?"
  - **Application & Learning:** Investigated the hot-reloading mechanism. Discovered that the local server requires explicit physical disk writes to trigger a state change. Executing a save (`Cmd + S`) resolves the read error by pushing the code into the compiler loop.
- **Prompt:** "i need to build a small SPA with at least 3 routes and a shared layout. guide me through todays task step by step. also define what an SPA is and how i keep the layout.tsx fonts safe."
  - **Application & Learning:** Initialized the `/contact` route. Decoded the difference between client-side routing and traditional full-page HTTP reloads. Injected a persistent `<nav>` wrapper utilizing the Next.js `<Link>` component directly into `app/layout.tsx`. Verified that this architecture isolates the static navigation UI while dynamically swapping the `{children}` component payload, successfully preserving the default `Geist` typography engine and anti-aliased rendering classes.
