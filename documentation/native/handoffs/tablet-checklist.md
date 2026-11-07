# Sylf Native — Samsung tablet verification, Phases 7 to 13

**Status, 1 November 2026: much of this has run.** Results are in the [Stage 3 verification report](../reports/stage-3-verification/report.md). Passed in portrait: P1 to P6, P8 to P23, Parts 4 and 6 except Spaces past World and the layouts memory budget, and Part 7. **Still to do:** P7, landscape, split screen and pop-up, dock numbers 1, 2 and 8 to 14, and Part 5. Device settings still need the owner's approval, and do not dismiss a security prompt.

**What remains is on the [Expansion stage's entry gate](../expansion/README.md#3-entry-gate),** and Part 1 waits for it unless the owner accepts an item in writing. Nothing here runs without the owner's authorization.

The numbering below stays as it was, so a result can be traced.

The device is a Galaxy Tab S9 FE (SM-X510, Android 16, One UI 8.5). Run every step in order and one at a time, because this Mac has 8 GB. Save results under `documentation/native/reports/stage-3-verification/evidence/android/`, and crop anything that shows the owner's own apps or notifications.

**Order of importance.** Part 1 decides whether the app is usable on a device at all, so if it fails, stop and report. Part 2 protects a student's study time, which is the critical promise. Part 3 is the student's day. Parts 4 to 7 are the Stage 2 checks, kept in full. If time runs short, stop at the end of a part, and say which parts ran.

## Before starting

**Stop and ask if** Avast One shows "Suspicious app", or Google Play Protect shows "Send app for a security check?". Each blocks automated runs, and each is the owner's security software: do not dismiss one or change its settings. Sending the app to Google would upload an unreleased build, and the owner chose not to.

The tablet can drop off USB, so check `adb devices` and use timeouts. USB does not charge it, and a full run costs about 20% of the battery.

```bash
export ANDROID_HOME=~/Library/Android/sdk
```

```bash
export JAVA_HOME=~/development/jdk17/zulu17.70.113-ca-jdk17.0.21.0.3-macosx_aarch64/Contents/Home
```

```bash
export PATH="$PATH:$ANDROID_HOME/platform-tools"
```

From `native/`:

```bash
npm run android:build
```

```bash
adb devices
```

```bash
npm run android:smoke
```

```bash
adb shell dumpsys window | grep mCurrentFocus
```

If that shows Avast or Play Protect, **stop and ask the owner.**

## Part 1. Does it run, sign in and save a session (about 30 minutes)

**Against a local server only. Never a hosted one.** On the Mac, start `node scripts/test/run-backend-local.mjs --serve --build` with the overrides from the [Stage 3 handoff](stage-3.md#6-harness). A device reaches it through a reversed port, so its origin stays `http://127.0.0.1`, the only plain-http origin the client accepts. This build keeps `DEV_TOOLS` on, as `build:android` does today.

```bash
adb reverse tcp:3111 tcp:3111
```

```bash
EXPO_PUBLIC_SYLF_API_ORIGIN=http://127.0.0.1:3111 npm run android:build
```

| # | Try | Pass if |
| --- | --- | --- |
| P1 | Open the app with no account | The sign-in page appears, with no flash of Home, and it scrolls clear of the keyboard in both orientations |
| P2 | Type with the Samsung keyboard and the S Pen. Use a wrong password | The server's refusal appears once, and Sign in stays reachable above the keyboard |
| P3 | Create an account, then kill the app from Recents and reopen | Home opens with no password. This is `expo-secure-store` surviving a kill |
| P4 | Begin a session, end it after two minutes | "Saved to your study record" arrives, and it is under Recent sessions. **This is the first time TimerSync, zod and SessionProtocolV2 run on Hermes.** A red screen here stops the run |
| P5 | Begin a session, kill the app, reopen, end it | One session on the server, not two. Ask the server: `/api/sessions?limit=5` |
| P6 | Sign out, and sign in as someone else | Nothing of the last person anywhere, including the dock and Workspace |
| P7 | Sign in with a provider, if a real one is authorized | The system browser opens, and `sylf-native://auth` returns to the app. **Needs a real OAuth app, and the owner's decision** |

## Part 2. The study session, on and off the network (about 40 minutes)

| # | Try | Pass if |
| --- | --- | --- |
| P8 | Airplane mode with a session running, then end it | "Not saved yet" under On this device. Nothing says saved |
| P9 | Turn the network back on, and wait up to a minute | It saves by itself, once. `keepalive` is ignored on React Native, so a request cut off by the app dying must replay on return |
| P10 | End a session and background the app at once | It is saved on return, not lost |
| P11 | Begin a session, background the app for 15 minutes, return | The right time at once, and no second session |
| P12 | With a session running, revoke this device from Sylf on the web | The session pauses, the sign-in page says why, and signing back in lets it resume |
| P13 | Study with no account, then sign in | One question, asked once. Both answers do what they say |

### Hermes and secure storage (Phase 12)

- `expo-secure-store` writes, reads back after the app is killed, and clears on sign-out. Reading while locked fails quietly as signed out.
- A backup restored to another device reads as signed out, with no crash.
- Bearer requests, refresh, and `credentials: "omit"` on OkHttp: no cookie is stored.
- `TimerSync` runs on Hermes, and `zod` schemas parse there. `portability.test.ts` proves only that the code stopped reaching for what Hermes lacks.
- `client.stream` delivers chunks on Hermes, or needs another way to read a stream. React Native's `fetch` may have no `response.body`, and then the client reads the whole answer at once.
- `sylf-native://auth` returns to the app from the system browser, and a killed app restarts the sign-in cleanly.
- `keepalive` is ignored, so ending a session and leaving the app at once should replay on return.
- `signal.throwIfAborted`, `structuredClone` and `window.dispatchEvent` are gone from these paths, and nothing else on Hermes should fail after a server has accepted.

### Timer dock and session (Phase 10)

| # | Try | Pass if |
| --- | --- | --- |
| 1 | Open the dock with a finger and the S Pen, and leave it open | It grows from the small plate with no flash, and the shadow arrives cleanly |
| 2 | Open and close it twenty times | It stays smooth. Motion here is worklets on the UI thread, never tested on a device |
| 3 | Begin in Workspace, go to Home → Focus | The same running time, with no reset and no second session |
| 4 | Pause in Focus, resume in Workspace's Timer, end from the dock | Each follows at once. Ending asks first |
| 5 | Begin, press Home on the tablet, wait 3 minutes, return | The time is right at once, and the screen did not count while hidden |
| 6 | Begin a 15 minute session, background the app past its end, return | Finished, showing 15 minutes and not more |
| 7 | Begin, then kill the app from Recents, and reopen | The same session, with the time away counted |
| 8 | Change the system clock backwards with a session running, if the owner agrees | The clock keeps going. **This is a device setting, so ask first** |
| 9 | Look at the dock in landscape, portrait, split screen and pop-up | Clear of the status bar, the camera, the Spaces icon, and everything else on its line |
| 10 | Pull down the notification shade from above the dock | The shade opens, and the dock is not pressed |
| 11 | Open the panel, then Back | Back closes the panel first |
| 12 | In World, with a session running | Enter is replaced by Pause session and Go to Focus. Pausing opens the way in. In the game there is no dock |
| 13 | Turn on reduced motion in Android settings | The panel fades, and nothing scales. **This is a device setting, so ask first** |
| 14 | Largest display size and font size, if the owner agrees | The dock's time fits, and the panel scrolls in a short window. **Device settings, so ask first** |

## Part 3. The student's day, on a device (about 20 minutes)

These are Phase 13's screens. They passed in Electron on every theme, and none has run on a device.

| # | Try | Pass if |
| --- | --- | --- |
| P14 | Today with events and quests, in landscape and portrait | The line reads well, and no quest has a time |
| P15 | Study this, on a quest | Focus has the subject and the task, and nothing starts by itself |
| P16 | The subject picker in Focus, in the dock and in Timer | The menu opens above everything, by touch, and closes with Back |
| P17 | Progress after a session, and Claim on an achievement | Numbers match the web, and a second press does nothing |
| P18 | Circle with a friend who hides things | Hidden reads as hidden |
| P19 | Tick a quest in Planner, and add an event in Calendar, with the keyboard up | One tap is enough. A button under a field is what `keyboardShouldPersistTaps` fixed, and Android's keyboard is the real test |
| P20 | Ask Sylvie something a local build answers with no provider, such as "What is my level?" | The answer arrives. **React Native's `fetch` may have no `response.body`, and then the reply arrives whole, not as it is written.** Say which. A real provider is a paid call: do not make one |
| P21 | Notes, PDFs, Whiteboard and Resources | Each says plainly what is true, with no sample |
| P22 | World's Traveller and Collection | The real name, level and items. World's art is untouched |
| P23 | Offline, open each Space | The Offline badge and honest empty pages, with no crash and no spinner left running |

## Part 4. Automated (about 20 minutes)

| # | Command, from `native/` | Look for |
| --- | --- | --- |
| 1 | `npm run android:workspace-check -- --out=<dir>` | 21 checks. Read `dragFrames` and `panFrames` |
| 2 | `npm run android:spaces-check -- --out=<dir>` | 34 checks. It was edited in Phase 9 for the new title and has not run since |
| 3 | `npm run android:home-check -- --out=<dir>` | 40 checks |
| 4 | `npm run android:interaction-check -- --out=<file>` | 9 checks |
| 5 | `npm run android:design-check -- --out=<dir>` | 12 themes, 0 crashes |
| 6 | `npm run android:scroll-check -- --window=<left,top,right,bottom> --out=<file>` | Home against the Showcase. A full-screen portrait page does not scroll, so use a pop-up window |
| 7 | `npm run android:pinch-check -- --out=<file>` | 13 scenarios of real two-finger input |

## Part 5. By hand, with the owner (about 40 minutes)

`adb` cannot do these. The owner's judgment is the result on anything about feel. Numbers 1 to 14 are in Part 2.

### Spaces, Home and device adaptation (Phases 5, 6 and 10)

| # | Try | Pass if |
| --- | --- | --- |
| 15 | Rotate in each Space | Layout follows, nothing remounts visibly, and nothing is lost |
| 16 | Split screen and pop-up windows across 600 pt, in each Space | Compact layouts appear, the dock moves to the right, and nothing remounts |
| 17 | A hardware keyboard, if there is one | Tab reaches controls. Command + digit and Alt + T do nothing yet, by design |

### Workspace (Phases 7 and 8)

| # | Try | Pass if |
| --- | --- | --- |
| 18 | Pinch on empty canvas, then over a window | Zoom follows the fingers, and the point between them stays put |
| 19 | Pinch while a tool is scrolling | No fight, and no jump |
| 20 | Fling the canvas | It coasts and stops at the world's edge, with no jump at the end |
| 21 | Drag a title bar at 50%, 100% and 200% | The window stays under the finger at every zoom |
| 22 | Resize from each corner of the focused window, with a finger | Live and smooth, and the shadow returns cleanly |
| 23 | Zoom to 200% and read a note | Text stays sharp |
| 24 | S Pen on empty canvas, on a title bar and in a tool | Pans, moves, and acts as a tap in a tool. Nothing is drawn yet |
| 25 | Rest a palm while dragging | No stray pinch |
| 26 | Swipe from the bottom edge near the Command Center | The gesture bar and the dock do not fight, and the dock is clear of it |
| 27 | Rotate with windows open, in Free and in Focus | Nothing is lost, and the camera keeps its place |

### World (Phase 9)

| # | Try | Pass if |
| --- | --- | --- |
| 28 | Open World, and leave it open for a minute | Clouds and petals move evenly, and the tablet stays cool |
| 29 | Every section by touch, and Back on an open panel | Back closes the panel first |
| 30 | Enter, pause, save and leave | The walk is smooth, and it returns to the Space you came from |
| 31 | Change the sky in Preparations | The crossfade is clean, with no flash |
| 32 | Reduced motion in Android settings | Nothing drifts, and the walk becomes a fade |
| 33 | Look at the status bar on a dark sky | Icons stay readable |
| 34 | Background the app in play, then return | The menu is waiting |

### Overall

| # | Try | Pass if |
| --- | --- | --- |
| 35 | Ten minutes of real use: begin a session, arrange tools, switch Spaces, visit the lobby | It feels smooth and like one app. The owner decides |

## Part 6. Memory (about 50 minutes)

All from `native/`, one at a time.

```bash
npm run android:memory-check -- --sweep=workspaceEntry --cycles=48 --rest-every=12 --wait=500 --budget-native=10 --out=<file>
```

```bash
npm run android:memory-check -- --sweep=workspaceTools --cycles=24 --rest-every=6 --wait=800 --budget-native=10 --out=<file>
```

```bash
npm run android:memory-check -- --sweep=workspaceCamera --cycles=24 --rest-every=6 --wait=500 --budget-native=5 --out=<file>
```

```bash
npm run android:memory-check -- --sweep=workspaceLayouts --cycles=24 --rest-every=6 --wait=800 --budget-native=5 --out=<file>
```

```bash
npm run android:memory-check -- --sweep=world --cycles=24 --rest-every=6 --wait=800 --budget-native=10 --out=<file>
```

**Watch for, with the dock:** opening the panel repeatedly, by hand with `dumpsys meminfo` before and after, because no sweep drives it yet. The shadow arrives only after the plate has stopped, which is the rule that avoids GPU growth, and it has only been reasoned about on Android. If it grows, remove the shadow first. If World's plates cost too much native memory, shrink the gate and sea first in `tooling/world-art/scenes.mjs`.

**New since Phase 10, by hand with `dumpsys meminfo`:** sign in, sign out and sign in again five times, because the whole Spaces tree remounts on a change of account ([ADR 0012](../decisions/0012-connected-app.md)).

## Part 7. R15, the bare reproduction (about 30 minutes)

This replaces the app on the tablet, so finish by reinstalling the normal build.

```bash
EXPO_PUBLIC_SYLF_R15=1 npm run android:build
```

```bash
npm run android:install
```

```bash
npm run android:r15-check -- --scenario=views --minutes=6 --out=<file>
```

```bash
npm run android:r15-check -- --scenario=text --minutes=6 --out=<file>
```

```bash
npm run android:r15-check -- --scenario=pressable --minutes=6 --out=<file>
```

Then rebuild and reinstall the normal app, and run a scenario inside it:

```bash
npm run android:build
```

```bash
npm run android:install
```

```bash
npm run android:r15-check -- --scenario=views --minutes=6 --in-app --out=<file>
```

**How to read D.** If native heap climbs steadily in the bare build, the cause is in the stack, so it is a bug to report and a cost to budget. If it levels off bare and climbs in-app, the cause is in how Sylf uses the stack, and the next suspects are Reanimated and the design system's shared values. If both level off, R15 as a per-mount leak is hard to sustain, and Phase 6's plateau is the better description.

## Part 8. Report

Add an Android section to the [Phase 13 report](../reports/phase-13/report.md), update R1, R12 and R15 in the [master plan](../master-plan.md#81-major-technical-risks), and list anything that failed before fixing it. If the owner authorized only part of this, say which part ran.

---

## Expansion Part 3 additions (5 November 2026, none of this has been run on the tablet)

Run in portrait and landscape, on a build made after `npx expo prebuild` (three new native modules), against a **disposable** or owner-approved backend, with the owner's authorization. Everything below ran only in Electron against a local server, so Hermes, touch and the system pickers are unverified.

- [ ] **Circle.** Find a person, send and answer a request, message, edit and delete, a group (create, rename, leave), Notifications, **Blocked** and Unblock. Each tap lands on the first press (the keyboard rule).
- [ ] **Parties.** Start one, invite a friend, accept on a second device, the room panel lists both. **With** on Focus, **Study together** from Parties, the dialog when a solo session is running, the room strip in the environment, ending leaves the room, **exactly one study session** in Recent sessions. Airplane mode mid-session: the time still counts, the strip says the room will catch up, and the exit reaches the server on return. Kill and reopen mid-session: the party mark survives.
- [ ] **Sylvie.** Streamed answer, a proposal with Apply and Not now, a stale proposal refused, **attach an image** (system picker, up to 4, 5 MB), the image shown back in the chat, readable maths in a reply, the daily note and insights on Today, Ask Sylvie inside the environment (and "Review in Plans" steps out of it without ending the session).
- [ ] **Plan.** With Planner V2 on: details saved free, spending ceiling and consent, **add a PDF or text file** through the system picker (a 4 MB file is refused in words), watch, stop, answer, confirm. With it off: the plain "not switched on" note.
- [ ] **Realtime** (only if the build has an address and the grants exist): a message from a second device appears without waiting 30 s, nothing arrives for a conversation you are not in, and with the app backgrounded nothing is read.
- [ ] **Battery and heat** over a 30 minute party session with the screen on, and memory after opening the environment, Plan, and a long chat ten times.

## Phase 14 additions (5 November 2026)

Run on the tablet by the agent with `adb input stylus` and `npm run android:notes-check` ([report](../reports/phase-14/report.md#3-verification)): library, writing, eraser, finger scrolling, persistence, whiteboard, typed note, PDF import and annotation, split layout. **Still by hand, with the S Pen:**

1. Write a paragraph quickly: does ink keep up, with no gap at the start of a stroke and no change in shape at pen-up?
2. Pressure and tilt: press harder and lighter; tilt the pencil nib. Lines should thicken and thin.
3. Rest a palm on the page while writing: no marks from the palm.
4. Hold the S Pen's side button while drawing: it erases. Hover above the page: nothing is drawn.
5. Two fingers on a whiteboard: it pans and zooms smoothly; on a handwritten page, one finger scrolls once the pen has been used.
6. Lasso a word, drag it, recolour it, delete it, undo.
7. A real past paper PDF from Downloads: pages render sharp at 100% and 200%; highlight a line.
8. Two typed notes open side by side: both editable; a third shows its text until touched.

9. **One note, typing and writing.** New note: type a few lines in Type, switch to Write, write over and between the lines. The text should not move when the editor closes, and ink should sit over the text and any picture.
10. **Erasing.** Write five lines, then sweep the eraser over all of them, the last one included: nothing should be left. One Undo brings all five back.
11. **Insert.** Insert a PDF into a note with writing on its first page: the PDF's pages follow that page. Insert a picture while typing. Change a page to grid, wide spacing, Mint paper, then every page.
12. **Endless and pull to add.** Make a "Note, endless" and write near the bottom: the page should extend as you go. In a normal note, scroll to the end of the last page, then pull up slowly until the zone is fully shown and let go: one page is added. Flicking at the end, or a short pull, adds nothing. Does the pull feel natural with a finger?
13. **Full screen.** In a note, press Full screen at the toolbar's right end: only the toolbar and page remain. Exit full screen restores everything. Full-screen two notes and the Calculator, drag a seam, and dock a tile against another's edge.
14. **Folders.** Make a folder and a subfolder, colour and icon them, move a note in, search for it from the top level.
15. **Search and sound.** The search button at the top right opens the palette; type part of a note's text and open it. Open the timer, choose a sound in Sound, play it: the bars beside the timer move, and they rest when paused.
16. **Text in Write.** Type two lines, switch to Write: the text stays, at full strength, and writing goes over it.
17. **Pinch a note.** Two fingers zoom about the point between them; one finger still scrolls. Same on a whiteboard.
18. **Ink weight.** Write slowly and quickly with light and firm pressure: the line should not change width when the pen lifts.
19. **Shapes.** Rectangle, ellipse and line: draw them roughly; each becomes a clean shape of that size.
20. **New and names.** The gear sets the note style; New asks for a name and opens the note in that style; tapping the name in the title bar renames it.
21. **Pen settings.** Tap the pen in hand: its panel opens. Turn **Pen pressure** off and write lightly, then press hard: the line keeps one width, while you write and after the pen lifts. Turn it on again and the hard part is wider. Try each pen kind, the size slider, dashed and dotted lines, Straighten lines (a nearly straight line becomes straight), a colour from another set and one you mix. On the toolbar, tap the colour in hand again and choose another from the spectrum: that slot keeps it. Force-stop the app: the pen is as you left it. Does the S Pen feel right with pressure off?
