I need you to fix the bugged exp and sylph granting system. Right now, studying for 5 seconds counts as 1 minute (granting 1 exp), and spamming play/pause creates a glitch giving 1 exp and sylph every time. Please fix this. Also, remove the unnecessary notifications when I get exp, sylph, or end a session to prevent flooding the panel. Only show important notifications like 'a friend messaged you', 'you leveled up', or 'you reached F rank'.

---

I need you to check if the leveling up and ranking system is fully established (e.g., what level is needed for the next rank). Please make a detailed implementation plan and establish the complete ranking system.

---

The top right bar shouldn't be visible on the focus page. Also, 'free flow' is repeated twice at the top, please fix that. Lastly, I'm not getting any sylph from my sessions (it's either not granting or not updating on the top right bar) — please fix this too.

---

I'm a bit torn on how rewards should work. Maybe granting rewards based on individual sessions is easier than cumulative time since it's less confusing. However, could we apply multipliers based on session length? For example, if a session passes 30 minutes, apply a certain multiplier to the exp and sylph, and a greater multiplier for 1 or 2 hours. Can you figure out and propose the best solution for this?

---

Can you perform some calculations to give me a general idea of progression? For example, tell me how much time it would take to reach F rank from E rank, or level 1 to level 10, and any other relevant milestones.

---

I think you should lower it to 200 instead of 300. 2.5 to 3 years is way too long and most people might quit. 200 should be the optimal choice. Please provide the calculations using 200 as well.

---

How much XP and sylph should I theoretically get for a 14-minute session? Also, I'm experiencing a major timer glitch: after a 14-minute session, it got stuck on the focus screen and wouldn't let me end the session. After reloading to end it, the time didn't add to my total time (stuck at 1:18). Whenever I start a session now, subject and total time stats are wrong, and I can't end sessions without reloading. Oddly, the time and sessions *do* get registered in the settings panel stats page. Please fix this.

---

How do I actually complete or start a quest? I tested a 5-minute quest, but after the timer finished, the quest was still pending. If there's no completion system yet, please design and implement one. Also, users shouldn't be able to just create their own quests or ask the system to do it endlessly—that would be an infinite reward glitch. Please figure out a solution to prevent this exploit.

---

I think there's a bug when I try to edit or delete quests and goals. Could you investigate and fix this? Please analyze the terminal for any errors as well.

---

Can you add a 'select' button that lets me select multiple chats and delete them simultaneously? Also, could you reorder the sidebar so that 'the system' is below the 'social' page?

---

For the goals page, I have a better idea. Can you collapse the whole 'Set new objective' block into a simple button on the side? When clicked, it should open a slightly redesigned panel (similar to the current one). This will make the main page look more spacious and only show the existing goals.

---

I think we should remove the top right sidebar from the quest, goals, system, social, and timer pages. It should only be visible on the home page and the inventory page. On the homepage, keeping both sylph and streak is fine, but for the inventory page, please remove the streak option so it only shows the sylph currency.

---

Can you elongate the right sidebar on the system page so it reaches the very top to look consistent? Keep the current design but fill it all the way up. Also, remove the horizontal line at the top and extend the vertical line upwards so there's no microscopic gap.

---

Can you implement the same selecting and deleting design feature for the goals and quests pages as well? I really like how that design looks.

---

The AI chats aren't actually being deleted. When I select 'delete all', they disappear, but if I switch to another page and come back, they reappear. Can you fix this?

---

Please add a 'clear all' or 'mark as read' button to the notification panel.

---

Move the 'open sidebar history' button to the top right beside the 'new chat' button. Also, expand the chat interface to fill the space between the sidebar and the chat border (leaving just a little bit of spacing). Lastly, can you make the exp bar on the homepage glow with a cool animation? Make sure its color matches the currently selected theme.

---

I need you to develop the Inventory system right now and make a detailed implementation plan based on these ideas:
Don't make the Inventory a shop; it should be the player's collection of everything unlocked through studying. It needs a Currency Section (current balance, total earned, total spent, etc.). 
Change the currency/reward logic: themes, backgrounds, avatars, and profile cosmetics should no longer be free. They should either be bought with Sylph or unlocked via level-ups, rank promotions, achievements, or quests.
Structure the Inventory like this:
- **Currency**
- **Items:** (xp boosts, elixirs, streak freezes, quest rerolls, nickname changes, calendar customizations)
- **Cosmetics:** Themes, Backgrounds (add animated ones later), Timer Effects (later), Sounds (later)
- **Profile:** Replace the avatars page with a broader 'Profile' page containing Avatars, Frames, Titles, and Name Colors.
- **Social (later):** Emotes, Stickers
- **Collection (later):** Study Cards, Event Items

---

The layout shouldn't look like this; make it consistent with the other settings panel pages. Also, the main inventory was messed up. Please rename the current main 'Inventory' to 'Shop'—this is where you only buy items, so remove the cosmetics and currency sections from there entirely. 
The actual 'Inventory' I originally meant should remain in the Settings panel. It should showcase what the user owns and has accomplished, split into Items, Cosmetics, and Currency/Exp. 
Cosmetics (themes and backgrounds) should stay within the Settings panel where they currently are, but add the feature to lock/unlock them via achievements, while retaining the same selection method.

---

Now for the Achievements page in the Settings panel. I want the top to display total completion stats (e.g., '74 / 210 | 35%'). 
Below that, divide achievements into categories like Study, Subjects, Streaks, Rank, Social, Quests, and Exploration. 
The achievements need appealing designs with progress bars (e.g., '72 / 100 ███████░░').
Every achievement should give rewards and belong to a rarity tier with specific colors: Common (green), Rare (blue), Epic (purple), Legendary (orange), and Mythic (gold).
Please make a detailed implementation plan ensuring frontend/backend consistency, and make sure rewards actually get added to the inventory, not just shown in a notification.

---

I want to redesign the existing Guide page into a rich, scalable Archive page. It should feel like an in-universe encyclopedia or codex (like in AAA games) rather than basic documentation, matching the app's existing design language, typography, and animations. 
Instead of a single hardcoded page, build it as a modular knowledge system with categories and entries (e.g., The System, Quests, Inventory, Economy, Achievements, Lore). It should prioritize UX, smooth navigation, searchable entries, and future-proof architecture (maybe even locked entries that unlock via progression).
If adding all the content is too much right now, task the content for later, but I need the UI built and structured perfectly.

---

I want to significantly redesign the Profile Customization page and rename it to 'Scholar Profile'. It shouldn't just feel like an inventory screen; it should be a premium identity page that showcases the player's progression (like Discord, Steam, or modern RPGs).
Redesign the hero profile card to be richer, displaying stats like current title, rank, level, XP progress, streak, joined date, etc., alongside a live preview that updates instantly when equipping cosmetics. 
Improve the Customization tabs (Avatars, Frames, Titles, Name Colors) to have better layouts, hover states, rarity indicators, and locked vs. unlocked presentations. Show progression beautifully without making it cluttered, and feel free to organize the layout and reuse existing components to make it feel highly polished and immersive.

---

I want to move the Calendar page from the Settings panel to the main left-side navigation bar, perhaps right below 'Quests'. Please preserve its current design and features (like quests and goals showing up), but tweak it as needed to fit the aesthetic of the main pages. 
Leave an empty Calendar page in the Settings panel for now, as I'll add calendar customization features there later.

---

Consistent with the app design, please create a large presentation slide deck using SVG format (not HTML) that I can easily export to Google Slides. Create a slide for every single feature I've mentioned. 
Don't use any of the images I sent; instead, use placeholders with brief descriptions of the images I should insert. Keep the text on each slide very short and easy for mentors/judges to read quickly—I will elaborate on the rest verbally. Please do your best to make this a great presentation.
