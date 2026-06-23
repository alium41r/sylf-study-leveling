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

---

## Day 3 & Day 4: Interactive State Validation & Linter Tooling Integration

**Objective:** Build a contact form that validates user input on the client, and configure Prettier alongside ESLint so code formatting and lint rules stay consistent without conflicting.

**AI Interaction Log:**

- **Prompt:** "i need to build the contact form for day 3 with name, email, and message fields. im used to python scripts where i read input once at the end also how does react actually keep track of what the user is typing?"
  - **Application & Learning:** Built the form with controlled inputs and `useState`. Learned that React stores field values in state and re-renders the page when they change, so the UI stays in sync on every keystroke instead of reading the inputs only when the user clicks submit.
- **Prompt:** "i added useState to contact/page.tsx and got this error: 'useState only works in a Client Component'. whats the difference between a server and client component, and what do i need to change?"
  - **Application & Learning:** Added `"use client"` at the top of the file. Learned that files in the App Router are Server Components by default, which run on the server and cannot use hooks or browser events — interactive pages need the client directive.
- **Prompt:** "explain the contact form code in app/contact/page.tsx line by line. im new to coding — especially validateForm. how does it check for empty fields and validate the email?"
  - **Application & Learning:** Walked through the validation flow: `trim()` catches blank fields, a regex checks the email format, and a length check enforces a minimum message size. Errors are stored in an `activeErrors` object, passed to state with `setErrors`, and shown under each field before `handleSubmit` clears the form and shows the success message.
- **Prompt:** "day 4 asks for prettier with eslint. how do i set them up so they dont fight each other? what should go in the prettier config?"
  - **Application & Learning:** Installed `prettier` and `eslint-config-prettier`. Created `.prettierrc.json` with 2-space indents, double quotes, semicolons, and ES5 trailing commas. Added `eslint-config-prettier` to `eslint.config.mjs` so ESLint skips formatting rules that Prettier already handles.
- **Prompt:** "my .prettierrc file has no syntax highlighting in cursor — it just looks like plain text. is the file broken or do i need a different extension?"
  - **Application & Learning:** Renamed the config to `.prettierrc.json` so the editor treats it as JSON and applies syntax highlighting. Ran format and lint to confirm everything passes cleanly.

---

## Day 5: Automated Unit Testing & Asynchronous API Integration

**Objective:** Install Vitest to build an automated testing suite for the frontend form, and implement an asynchronous HTTP `fetch` request to pull and render external data.

**AI Interaction Log:**

- **Prompt:** "day 5 syllabus says i need to do unit testing. how do i install vitest into next.js and what are the exact terminal commands?"
  - **Application & Learning:** Installed Vitest, jsdom, and React Testing Library. Learned how to configure `vitest.config.ts` and update package scripts to create an isolated virtual DOM environment for testing components without opening a browser.
- **Prompt:** "the test failed with 'TestingLibraryElementError: Found a label... however no form control was found'. why can't it see my input boxes and how do i fix it?"
  - **Application & Learning:** Diagnosed an accessibility flaw. Discovered that testing libraries read the DOM like screen readers. Fixed the error by explicitly linking `<label>` elements to `<input>` fields using matching `htmlFor` and `id` tags, resulting in a clean test pass.
- **Prompt:** "i need to do the http api fetch task now. how do i request data from an external json server and handle errors?"
  - **Application & Learning:** Built an asynchronous `fetchUsers` function inside a `useEffect` hook. Learned how to manage loading states, intercept HTTP status errors, and map the returned JSON array into UI elements.
- **Prompt:** "i added the users page but it isn't showing up on localhost. how do i fix the routing and put it in the nav bar?"
  - **Application & Learning:** Investigated Next.js App Router architecture. Verified the exact physical directory paths (`app/users/page.tsx`) and injected the new `<Link>` route into the persistent `layout.tsx` navigation bar to resolve the 404 error.

---

## Week 2, Day 1: Building a Backend to Save Data

**Objective:** Figure out how to connect the app to a real database so information doesn't delete when the page reloads.

**AI Interaction Log:**

- **Prompt 1:** "Every time I refresh my app, my form data disappears. How do I save it permanently? What exactly is a 'backend' and a 'database'?"
  - **Application & Learning:** Learned the difference between temporary frontend memory (React state) and permanent backend memory (databases). A database is like a digital filing cabinet, and an API is the waiter that carries data between the website and the cabinet.
- **Prompt 2:** "You mentioned using tools called 'Prisma' and 'SQLite'. What do they actually do, and what are the exact terminal commands to install them?"
  - **Application & Learning:** Learned that SQLite is a simple, local database file. Prisma is an ORM, which acts as an automatic translator so I don't have to write complex SQL database code myself. Installed the tools and learned to hide my `.env` file so secret credentials don't end up on GitHub.
- **Prompt 3:** "I followed the setup, but the terminal gave a red error: 'P1012 The datasource property url is no longer supported'. What did I do wrong and how do I fix it?"
  - **Application & Learning:** Discovered that software updates change how tools work. Prisma v7.8.0 removed the old way of connecting to databases. I had to delete the URL string from my `schema.prisma` file and rely on the `.env` file to handle the connection.
- **Prompt 4:** "Now when I try to run the app, my server crashes with 'PrismaClientConstructorValidationError'. Why is it broken?"
  - **Application & Learning:** Learned about server "cache" (temporary memory). Because I was creating database files while the server was actively running, the server got confused and was reading outdated files. I learned to stop the server and run `rm -rf .next` to delete the broken memory.
- **Prompt 5:** "I have no idea how to actually write the API code. What exact files do I need to make, and what code goes inside them to save and read notes?"
  - **Application & Learning:** Built my first REST API by creating `app/api/notes/route.ts`. Wrote a `POST` function to create new notes and a `GET` function to read them. Learned about Zod, a tool that checks if the user's data is valid (not empty) before saving it to the database.
- **Prompt 6:** "The code is pasted in, but how do I actually test if the database is saving my notes? You mentioned a command called 'curl', what is that?"
  - **Application & Learning:** Learned that `curl` is a terminal command used to send data to an API without needing a physical website button. Used it to send a test note to my `POST` route, and verified it was permanently saved in the SQLite database.