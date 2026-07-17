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


  ---

  ## Week 2, Day 2: Cleaning the Code and Automated Testing

**Objective:** Learn how to use a "linter" to automatically find messy code, and write automated tests so I don't have to manually check the database every time I make a change.

**AI Interaction Log:**

- **Prompt 7:** "My internship guide says I need to 'configure a linter on the backend'. What exactly is a linter, and how do I use it on my new API routes?"
  - **Application & Learning:** I learned that a linter (like ESLint) is basically an automatic spell-checker for code. Instead of checking for spelling mistakes, it scans the code to find messy formatting, broken rules, or things that might cause bugs later. I ran the command `npm run lint` in my terminal to check my files.

- **Prompt 8:** "I ran the linter, but it gave me warnings about 'unused variables' in my error catch blocks. Why is this a problem and how do I fix it to get a clean pass?"
  - **Application & Learning:** I learned that if you define a variable but never actually use it, the linter gets mad because it clutters the code. I fixed the catch blocks in my API routes to clean up the code. I learned that committing a "clean pass" means fixing all these warnings before saving the code to GitHub.

- **Prompt 9:** "Now I need to write unit tests for my API using Vitest. But I have a question: if the tests automatically create and delete notes, won't that fill my real database with fake junk data?"
  - **Application & Learning:** I learned a really cool concept called "mocking". Instead of letting the tests talk to my real SQLite database, we set up a fake, temporary database in the computer's memory. The tests run against the fake database, so my real data stays perfectly safe.

- **Prompt 10:** "Can you help me write the actual Vitest code to test my POST and GET routes? How do we check if the API is returning the right HTTP status codes?"
  - **Application & Learning:** I used AI to help generate the test files. I learned how unit tests work: they send a fake request to the API, and then check the response. For example, the test checks if sending good data returns a `201 Created` status, and if sending bad data (which Zod blocks) correctly returns a `400 Bad Request` status.


  ---

  ## Week 3, Day 1: Locking down the API with JWT Authentication

**Objective:** Learn how to restrict access to the backend so that only logged-in users with a valid "VIP pass" (Token) can create or modify notes.

**AI Interaction Log:**

- **Prompt 11:** "It's Week 3 Day 1 and I need to add JWT Authentication to my API. What exactly is a JWT and how do I do this? Please guide me step-by-step so I can learn."
  - **Application & Learning:** I learned that a JWT (JSON Web Token) is like a digital VIP pass. We started by updating the `schema.prisma` file to add a required `password` field to the User model, then pushed the changes to the SQLite database.

- **Prompt 12:** "When I pushed the changes, it gave an error about adding a required column without a default value. Also, how do I actually write the code to let a user register?"
  - **Application & Learning:** I learned that adding a required column to a database with existing data causes a conflict. I fixed it by running `npx prisma db push --force-reset` to safely wipe the local test database. Then, I installed `bcryptjs` and `jose`, and created an `/api/auth/register` route. I learned how `bcrypt.hash()` scrambles passwords into gibberish so we never save raw text in the database.

- **Prompt 13:** "My IDE is throwing a 'password does not exist' error in my code even though I added it to the database! Also, how do I create the login route?"
  - **Application & Learning:** I learned that code editors cache old database blueprints. Running `npx prisma generate` and restarting the TypeScript server fixed the errors! I then built the `/api/auth/login` route. I learned how to use `bcrypt.compare()` to check passwords, and the `jose` library to sign and create a secure JWT token.

- **Prompt 14:** "Now that users can register and login, how do I actually protect my Notes API so only logged-in users can post notes?"
  - **Application & Learning:** I learned about separating logic into helper files (the industry standard). I created a `lib/auth.ts` file with a `verifyToken` function. Then, I updated my `app/api/notes/route.ts` to check the `Authorization` header for a "Bearer" token before allowing any notes to be created!


  ---

  ## Week 3, Day 2: Role-Based Authorization (RBAC)

**Objective:** Learn how to enforce different rules for different types of users so that some users have more power than others (like an "ADMIN").

**AI Interaction Log:**

- **Prompt 15:** "It's day 2, I need to do this task: Add at least one role-based authorization rule. Guide me the same way you did yesterday."
  - **Application & Learning:** I learned that while Authentication proves *who* you are, Authorization proves *what you are allowed to do*. I started by trying to add a `role` field to my database, but I accidentally put it outside the `User` model, which caused a Prisma error.

- **Prompt 16:** "I got an error: 'This line is invalid. It does not start with any known Prisma schema keyword.' How do I fix this?"
  - **Application & Learning:** I learned that database schemas require strict placement. I moved `role String @default("USER")` inside the `User` block, successfully ran the `npx prisma db push` and `generate` commands, and then added the `role` into my JWT token payload when users log in.

- **Prompt 17:** "My IDE is throwing a 'Property role does not exist' error again! How do I fix this, and how do we enforce the rule?"
  - **Application & Learning:** I hit the same IDE caching bug as yesterday, and fixed it by restarting my TypeScript Server. Finally, I updated the `DELETE` function in my Notes API to enforce the rule: it reads the token, checks the user's role, and returns a `403 Forbidden` error if the user is not an `ADMIN`!


---

## Week 3, Day 3: Frontend to Backend Integration (Full Stack CRUD)

**Objective:** Connect the frontend to the backend so users can register, login, and manage their own notes using a secure token.

**AI Interaction Log:**

- **Prompt 18:** "ok its day 3 now, i need to do this task: Connect Week 1 frontend to the backend — full end-to-end CRUD with login"
  - **Application & Learning:** Built the `/register` and `/login` pages with forms that send data to our new API. Learned how to save the JWT token in the browser's `localStorage` so it persists even when I navigate to other pages.
- **Prompt 19:** "an issue is ocurring, the website is getting an error"
  - **Application & Learning:** Discovered that Next.js treats anything inside the `app/api` folder as strictly backend code. I accidentally created my visual frontend Notes dashboard inside `app/api/notes/page.tsx`, causing a huge route conflict! I learned to keep frontend pages safely outside of the `api` directory.
- **Prompt 20:** "its still saying Validation failed when trying to create a note. fix this"
  - **Application & Learning:** Learned a massive security lesson! Our old API required the frontend to send a `userId`. But since we now have JWT tokens, relying on the frontend to send the user ID is a huge security flaw (hackers could spoof it). We updated the API to securely extract the `userId` directly out of the verified token payload instead.
- **Prompt 21:** "there is no edit option here"
  - **Application & Learning:** Added the final piece of CRUD functionality (Update/PUT). Learned how to structure my React state to smoothly switch between "Create" mode (POST) and "Edit" mode (PUT). Also saw our backend RBAC rule in action when the server correctly rejected my request to delete a note because I wasn't an Admin!


---

## Week 3, Day 4: Automated API Integration Testing

**Objective:** Write automated tests using Vitest to test the API routes instead of clicking through the website manually.

**AI Interaction Log:**

- **Prompt 22:** "ok its done. now i want to do this task: Write at least 5 API tests covering auth + CRUD + error paths. tell me whats the purpose of this and guide me through this"
  - **Application & Learning:** Learned the power of API integration testing. Instead of testing visual buttons, we wrote a test robot that automatically sends `fetch` requests directly to our local server.
- **Prompt 23:** "take a look at the terminal, it passed a few tests an failed a few"
  - **Application & Learning:** Realized that Vitest automatically runs all old test files by default. Learned how to isolate tests by running `npm run test api.test.ts`. Wrote 5 powerful tests to verify the "Happy Path" (creating notes successfully) and the "Error Path" (getting kicked out for missing a token or lacking Admin privileges).
- **Prompt 24:** "i need to do this last task for the week: Add at least 1 integration test that runs the happy path end-to-end. but wait, didnt we already do the happy and error path?"
  - **Application & Learning:** Learned the crucial difference between isolated API unit tests and End-to-End (E2E) integration tests. An E2E test proves that all the individual pieces connect together to form a working product. I wrote a massive final test script that simulated a user's entire journey in one continuous flow: Registering, Logging in, Creating a Note, and Updating that Note!

---

## Week 4: Building an Autonomous AI Agent

**Objective:** Pivot from traditional web development to Artificial Intelligence by building a standalone Node.js Agent capable of searching the web, reading files, and using memory.

**AI Interaction Log:**

- **Prompt 25:** "Alright, it's week 4! My first task is to build a research agent with a web-search skill. But wait, what exactly is the difference between an AI Agent, a Chatbot, and a Copilot?"
  - **Application & Learning:** Learned the difference between a Chatbot (passive text generator) and an Agent (an autonomous system that acts using a Planner, Executor, and Memory). Set up a brand new `ai-agent` directory, installed the Google GenAI SDK, and wrote my first script. I also learned how to use a hidden `.env` file to securely store my API key.
- **Prompt 26:** "I ran the script and the terminal said 'AI WANTS TO USE A TOOL', but it didn't actually answer my question about the Superbowl. Why did it stop, and how do I make it actually search?"
  - **Application & Learning:** Learned about "Function Calling". We gave the AI a `searchWeb` tool definition so instead of replying with text, it returns a request for *me* to run a function. I built an "Executor" function to run the search on my computer, and learned how to feed the result back into the AI's memory so it could generate the final answer.
- **Prompt 27:** "Okay, the web search is working perfectly! The next task on my list is 'Add memory'. Do I have to manually send the whole chat history every time, or does the AI remember things automatically?"
  - **Application & Learning:** Learned about "In-Context Memory". We switched to the `chat.sendMessage` method which automatically saves the chat history behind the scenes. I proved the memory worked by asking "Who did they beat?" without explicitly mentioning the team name, and the AI correctly remembered the context of our conversation!
- **Prompt 28:** "It remembered the 49ers! My next task is about 'Hooks'. What exactly is a hook, and how do I make the terminal print a timestamp log every time the AI decides to use a tool?"
  - **Application & Learning:** Learned about "Hooks" (interceptors). I built a "Pre-Action Hook" that prints a timestamp and the tool's name to the terminal right before the AI uses a tool. This is super important for security and tracking exactly what autonomous bots are doing on a live server.
- **Prompt 29:** "The hook logs are working. For the final demo, I need the AI to read a text file AND do a web search. How do I let it use multiple tools in a row without stopping?"
  - **Application & Learning:** Learned the "ReAct" pattern (Multi-Hop Reasoning). We created a `secret.txt` file and built a `readFile` tool using Node's `fs` module. Then, we wrapped the Executor in a `while` loop! The AI successfully read the text file to find the year 2024, and then autonomously executed a second tool to search the web for the 2024 Superbowl winner without me holding its hand.
- **Prompt 30:** "Can we make it so that I can ask it questions directly in the terminal, instead of hardcoding my question into the script? Would a Python-style `input()` function work here?"
  - **Application & Learning:** Learned that Node.js is asynchronous and doesn't have a simple synchronous `input()` function like Python. Instead, I used the built-in `readline/promises` library to open an interactive text-stream in the terminal, allowing me to chat with my agent live!
- **Prompt 31:** "Haha look at this! I asked it how many goals Ronaldo scored, but it just kept searching for the Superbowl three times and then gave up. Why did it do that?"
   - **Application & Learning:** Discovered the limitations of mocked data! Because we hardcoded the `executeSearch` function to always return "The Chiefs won the Superbowl", the AI got incredibly confused when trying to research Ronaldo. This proved exactly why we need to upgrade our mock search to a real live internet Search API (like SerpAPI or DuckDuckGo) for production environments!

---

## Week 5: Distributed AI Architecture (Model Context Protocol & Multi-Agent Orchestration)

**Objective:** Upgrade from a single standalone script to a distributed architecture by building a custom MCP Server, connecting an MCP Client, and orchestrating multiple specialized AI Workers under a single Supervisor.

**AI Interaction Log:**

- **Prompt 32:** "I need to do Week 5's tasks right now: Build a custom MCP server exposing one app resource and one tool. Guide me through these and also explain the concepts side by side slowly step by step."
  - **Application & Learning:** Learned about the Model Context Protocol (MCP), a universal standard that lets AI safely connect to local resources. Built `mcp-server.ts` using the `@modelcontextprotocol/sdk`. Exposed a passive "Resource" (`notes://memo`) and an active "Tool" (`calculate_sum`). Learned that instead of HTTP, MCP communicates securely and instantly over `stdio` (Standard Input/Output) by piping JSON messages directly in the terminal, meaning `console.log` would corrupt the protocol so we had to use `console.error` to debug.
- **Prompt 33:** "Phase 1 is done, next task. How do we connect to this server?"
  - **Application & Learning:** Built `mcp-client.ts`. Learned how AI IDEs like Cursor or Claude Code secretly spawn background processes to securely read local files without internet access. Ran the client which spawned the server in the background, negotiated capabilities, listed the tools, and remotely executed the `calculate_sum` math tool.
- **Prompt 34:** "It's done, move to the next phase: Implement a supervisor + worker agent that routes tasks to >= 2 sub-agents."
  - **Application & Learning:** Built `multi-agent.ts`, a true distributed Multi-Agent system. Implemented the "Supervisor + Worker" pattern. Created a Supervisor boss that isn't allowed to answer questions directly due to a strict `systemInstruction` (Guardrail). Instead, the Supervisor dynamically routes tasks to either a Math Worker or a Research Worker depending on the user's prompt. 
- **Prompt 35:** "Look at this error: '429 RESOURCE_EXHAUSTED'. Why did this happen?"
  - **Application & Learning:** Learned a massive lesson in "Cost & Latency Strategy". Because multi-agent systems trigger huge chain reactions of API calls (User -> Supervisor -> Worker -> Tool -> Supervisor), we instantly hit Google's free-tier rate limits! We fixed it by injecting a `sleep(2000)` pace-limiter. In production, this proves why you only use expensive, smart models for the Supervisor routing, and tiny, cheap, fast models for the Workers.
- **Prompt 36:** "What's left? How do I debug this if something breaks?"
  - **Application & Learning:** Implemented Phase 4: A Tracing Layer. When 3 different agents are talking back and forth, debugging is a nightmare. Built an `AgentTracer` class to act as a centralized wiretap that logs the exact timestamp, Agent ID, action, and JSON payload every time a tool is used.