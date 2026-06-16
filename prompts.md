# Arbisoft Internship AI Prompts Log

## Day 1: Environment Setup & Framework Initialization

**Objective:** Establish local development environment, clone remote GitHub repository, and initialize the Next.js framework.

**AI Interaction Log:**

- **Prompt:** "How do I clone my remote GitHub repository to my Mac desktop?"
  - **Application & Learning:** Utilized secure authentication to pull the repository locally. Established the foundational link between local files and remote version control.
- **Prompt:** "Give me the terminal command to create a new Next.js app in the current directory using TypeScript, Tailwind CSS, and ESLint."
  - **Application & Learning:** Executed `npx create-next-app` to scaffold the frontend architecture. Learned that Node.js provides the local execution environment, and `npx` runs the necessary packages.
- **Prompt:** "Why is npm throwing a 'name can no longer contain capital letters' error during installation?"
  - **Application & Learning:** Resolved directory conflict by applying `npm` registry naming rules, which strictly enforce lowercase structures (e.g., modifying `Arbisoft-internship` to `arbisoft-internship`).

---

## Day 2: Server Initialization & Route Architecture

**Objective:** Boot the local development server, construct the initial `/about` route, and map out the core frontend stack mechanics.

**AI Interaction Log:**

- **Prompt:** "What are the terminal commands to initialize the Next.js local development server?"
  - **Application & Learning:** Executed `npm run dev` to boot the compiler. Learned how this establishes a continuous background process that translates TypeScript/React into a browser-readable format on `localhost:3000`.
- **Prompt:** "How do I build a new page and URL route in this framework?"
  - **Application & Learning:** Constructed the `app/about/page.tsx` directory. Learned the mechanics of Next.js file-system routing, where physical folder structures dictate the available URL paths.
- **Prompt:** "I am getting a 'Runtime Error: The default export is not a React Component' on my new route. How do I fix this?"
  - **Application & Learning:** Discovered that the local development server hot-reloading mechanism strictly requires physical disk writes. Saving the file `Cmd + S`) resolves the blank file read error and compiles the React component.