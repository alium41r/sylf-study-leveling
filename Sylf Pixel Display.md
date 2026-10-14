# **Sylf Pixel Display**

**Status:** Product vision / pre-implementation  
**Feature area:** Companion / Character Studio / Personalization  
**Implementation strategy:** Foundation-first, iterative  
**Working name:** Sylf Pixel Display

---

## **1\. Overview**

Sylf Pixel Display is a live, software-defined pixel matrix embedded into the Sylf interface.

Instead of the character card displaying a conventional image, SVG, video, GIF, or pre-rendered animation, the **entire character-card surface becomes a logical pixel display**.

Every pixel in this display is individually addressable and may independently:

* turn on or off;  
* change colour;  
* change opacity;  
* participate in an animation;  
* respond to application events;  
* be manipulated by the user;  
* form part of a character, object, environment, effect, or custom creation.

The display should behave conceptually like a small programmable LED/OLED matrix.

The Sylf companion is therefore not an image shown inside a card.

**The companion lives inside the display.**

The display itself is the persistent medium.

---

# **2\. Product Vision**

The long-term goal is to create a small programmable visual world inside Sylf that can host:

* the Sylf companion;  
* custom characters;  
* animations;  
* expressions;  
* accessories;  
* environments;  
* particles;  
* study-state reactions;  
* level-up sequences;  
* user drawings;  
* custom scenes;  
* ambient displays;  
* interactive pixel creations.

Eventually, users should be able to treat the display almost like a miniature digital screen that belongs to them.

The system may evolve from a character display into a broader creative platform.

Examples could eventually include:

* a custom Sylf character;  
* a pixel pet;  
* a plant;  
* an aquarium;  
* a tiny city;  
* a clock;  
* ambient stars;  
* a Pomodoro visualization;  
* a custom animated scene;  
* completely user-created pixel artwork.

However, these are **future capabilities rather than initial requirements**.

The first implementation should establish only the architectural foundation required to evolve safely toward this vision.

---

# **3\. Core Product Principle**

> **The display does not exist merely to show the character. The character is content rendered onto the display.**

This principle should influence the entire architecture.

The Pixel Display must therefore remain independent from any specific:

* character;  
* animation;  
* Sylf state;  
* asset format;  
* dashboard layout;  
* viewport size;  
* editor implementation.

Characters and effects are consumers of the display system.

They should not define the display system itself.

---

# **4\. Why This Feature Exists**

The current concept of character assets naturally leads toward static files:

* PNG;  
* SVG;  
* GIF;  
* sprite sheets;  
* pre-rendered animations.

Those formats are useful but restrict how dynamic the companion can become.

A live pixel display creates several advantages.

### **Dynamic behaviour**

Small parts of the character can change independently.

A blink may affect only a handful of pixels instead of replacing the entire character asset.

### **Unified animation space**

Characters, particles, environments and UI reactions all exist within the same coordinate system.

A level-up effect can therefore interact directly with the character instead of being an unrelated animation layered over it.

### **User creativity**

Users may eventually manipulate the same display directly.

They are not merely choosing from developer-created assets.

### **Consistent visual identity**

The constrained logical resolution naturally produces a recognizable pixel aesthetic throughout Sylf.

### **Small content representation**

Characters and animations can potentially be represented as structured pixel data rather than large raster assets.

### **Long-term extensibility**

The same rendering engine can eventually support content that has not yet been designed.

---

# **5\. User Experience**

## **5.1 Normal use**

During normal application use, the Pixel Display behaves like the visual home of the Sylf companion.

For example:

┌──────────────────────────────┐  
│                              │  
│       ·                ▪     │  
│                              │  
│            █████             │  
│          ██     ██           │  
│         ██  ■ ■  ██          │  
│          █████████           │  
│             ██               │  
│                              │  
│   ▪                     ·    │  
│                              │  
└──────────────────────────────┘

Although visually similar to pixel artwork, this is not an image.

Every visible square corresponds to an actual logical pixel controlled by the runtime.

---

## **5.2 App reactions**

The display may react to meaningful Sylf events.

Examples:

**Focus session begins**

The companion becomes focused and a subtle environmental effect appears.

**AI processing**

A small scanning or thinking animation runs.

**Task completed**

A short pixel celebration occurs.

**Level up**

The entire display may temporarily participate in the sequence.

**Idle**

The companion occasionally blinks or performs subtle idle movement.

**Resting**

The character may close its eyes and ambient activity decreases.

These behaviours should eventually be driven by application events rather than tightly coupled UI logic.

---

## **5.3 Direct user interaction**

The long-term product should allow users to manipulate the display.

Possible interactions include:

* drawing pixels;  
* erasing pixels;  
* changing colours;  
* placing predefined objects;  
* customizing characters;  
* creating animation frames;  
* editing backgrounds;  
* adding accessories;  
* selecting effects.

The initial foundation does not need to provide these capabilities beyond minimal development/testing controls.

---

# **6\. Logical Display Model**

The Pixel Display should use a **fixed logical resolution**.

For example:

48 × 48

or another deliberately selected resolution.

The exact value should be decided through visual prototyping.

The logical display resolution must remain independent from the physical size of the card.

For example:

Mobile card  
48 × 48 logical pixels

Desktop card  
48 × 48 logical pixels

Large preview  
48 × 48 logical pixels

Only the physical presentation size changes.

This ensures that pixel coordinates remain stable.

A character eye may therefore always occupy:

x \= 17–19  
y \= 20–22

regardless of screen size.

---

# **7\. Coordinate System**

All Pixel Display content should operate exclusively in **logical display coordinates**.

Content must not know about:

* CSS pixels;  
* viewport dimensions;  
* monitor resolution;  
* device pixel ratio;  
* dashboard card width.

For example:

setPixel(23, 16, color)

is valid.

Something conceptually equivalent to:

draw at 187 CSS pixels from the left

should never exist within character or animation logic.

The rendering layer alone translates logical pixels into their physical representation.

---

# **8\. Pixel State**

At the lowest level, the display is composed of individually addressable cells.

Each pixel minimally requires a colour state.

Conceptually:

Pixel  
 ├── red  
 ├── green  
 ├── blue  
 └── alpha

An "off" pixel may simply represent:

black / transparent / inactive

depending on the final visual design.

The internal implementation may use an efficient framebuffer such as an RGBA typed array rather than storing thousands of JavaScript objects.

Implementation details should remain hidden behind the display API.

---

# **9\. Framebuffer**

The Pixel Display should maintain an authoritative logical framebuffer.

Conceptually:

Display state  
      ↓  
Framebuffer  
      ↓  
Renderer  
      ↓  
Visible Canvas

The framebuffer represents the current state of every logical pixel.

The renderer should not itself own application state.

This separation allows the same framebuffer to eventually be:

* rendered into different UI sizes;  
* manipulated by animations;  
* edited by users;  
* tested without rendering;  
* serialized when appropriate;  
* generated procedurally.

---

# **10\. Rendering Architecture**

The initial browser renderer should use **Canvas** rather than one DOM element per logical pixel.

For example:

Pixel Runtime  
      ↓  
Framebuffer  
      ↓  
Canvas Renderer  
      ↓  
Character Card

A 48×48 display contains:

2,304 logical pixels

These should not become 2,304 React components.

Canvas provides a single rendering surface while preserving full control over each logical pixel.

The architecture should make it possible to replace or supplement the rendering backend later without rewriting content.

Potential future renderers could include:

* Canvas 2D;  
* OffscreenCanvas;  
* WebGL;  
* WebGPU.

The initial implementation should not use a more complex renderer unless proven necessary.

---

# **11\. Physical Pixel Appearance**

Logical pixels should remain clearly visible.

The display should intentionally preserve the impression of a physical digital matrix rather than attempting to hide its resolution.

Potential presentation characteristics include:

* subtle gaps between pixels;  
* faint visibility of inactive cells;  
* crisp square cells;  
* restrained glow for active pixels;  
* dark display background;  
* nearest-neighbour visual behaviour;  
* no smoothing between logical pixels.

The final visual treatment should fit Sylf's existing dark, minimal and premium interface.

The grid should feel deliberate rather than resembling a debugging overlay.

---

# **12\. Content Architecture**

The Pixel Display itself must not contain Sylf-specific rendering logic.

Content should exist separately.

Conceptually:

Pixel Engine  
│  
├── Display  
├── Framebuffer  
├── Renderer  
└── Runtime

Content  
│  
├── Characters  
├── Animations  
├── Effects  
└── Scenes

This boundary is important.

The engine answers:

> How are pixels displayed?

Content answers:

> What should those pixels currently show?

---

# **13\. Character Model**

Long term, characters should preferably be composable rather than represented as one large monolithic sprite.

A character could conceptually contain:

Character  
│  
├── Base/body  
├── Face  
│   └── Eyes  
├── Expression  
├── Accessory  
└── Effects

This would allow a shared base character to produce many visual states.

For example:

Base Sylf  
\+  
Focused eyes  
\+  
Idle body state  
\+  
Focus aura

or:

Base Sylf  
\+  
Closed eyes  
\+  
Resting pose

The first implementation does not need the complete character-component system.

It should simply avoid architectural decisions that require every character state to become a completely separate image.

---

# **14\. Scene Model**

Eventually, the entire Pixel Display should be treated as a **scene**.

A scene may contain multiple independently controlled layers.

Possible future model:

Scene  
│  
├── Background  
├── Environment  
├── Character  
├── Face  
├── Accessories  
├── Effects  
├── User content  
└── Temporary system effects

The exact layer model should not be finalized prematurely.

The first foundation only needs to ensure that future compositing is possible.

---

# **15\. Animation Model**

The long-term animation system should support two complementary forms of animation.

## **15.1 Authored frame animation**

Useful for intentionally designed character motion.

Example:

Open eyes  
   ↓  
Half closed  
   ↓  
Closed  
   ↓  
Half open  
   ↓  
Open

This model is appropriate for:

* expressions;  
* poses;  
* transformations;  
* handcrafted sequences.

---

## **15.2 Procedural animation**

Useful when movement can be calculated instead of manually authored frame-by-frame.

Examples:

* particles;  
* stars;  
* rain;  
* glow;  
* waves;  
* scanning effects;  
* floating pixels;  
* loading animations;  
* ambient movement.

Conceptually, procedural elements may have properties such as:

position  
velocity  
lifetime  
colour

The runtime calculates their next state over time.

The architecture should eventually allow both systems to operate within the same display.

---

# **16\. Runtime**

The runtime is responsible for progressing display behaviour over time.

It may eventually coordinate:

* animation playback;  
* scene state;  
* transitions;  
* procedural effects;  
* app events;  
* timing.

The runtime should not assume continuous 60 FPS rendering.

If nothing is changing, the display should be allowed to remain idle.

For example:

Static display  
→ no continuous work

Blink triggered  
→ runtime wakes  
→ animation plays  
→ runtime becomes idle again

Animations should run only as frequently as necessary.

---

# **17\. Application Event Integration**

Eventually, Sylf features should communicate with the display through a defined event boundary.

Examples may include:

focus.started  
focus.completed

task.completed

planner.generating

ai.thinking

streak.extended

level.up

user.idle

Pixel content can then react to meaningful application events.

The Planner, task system and other features should not directly manipulate framebuffer pixels.

Instead:

Application event  
       ↓  
Pixel behaviour  
       ↓  
Runtime  
       ↓  
Framebuffer

This protects application features from becoming coupled to animation implementation.

---

# **18\. Pixel Studio**

The long-term editing environment should be called **Pixel Studio** unless another product name is selected later.

Pixel Studio would allow users to create or customize content that runs on the same Pixel Display used throughout Sylf.

Potential capabilities:

* pencil;  
* eraser;  
* fill;  
* palette;  
* frame creation;  
* animation playback;  
* onion skinning;  
* layers;  
* mirroring;  
* selections;  
* accessories;  
* environment editing;  
* character customization.

The editor should remain approachable.

It should not become a full professional graphics application unless actual user needs justify that complexity.

---

# **19\. Creation Levels**

The eventual product may expose different levels of creative control.

### **Simple**

Designed for most Sylf users.

Possible controls:

* choose companion;  
* select eyes;  
* select palette;  
* select accessories;  
* choose background;  
* enable effects.

No pixel-art knowledge required.

### **Studio**

Designed for users who want direct creative control.

Possible features:

* draw pixels;  
* create frames;  
* edit layers;  
* design scenes;  
* animate content.

### **Advanced**

Potential future capability.

Users may define procedural behaviour using a constrained and secure system.

This should **not** mean executing arbitrary user JavaScript in the application.

Possible approaches include:

* restricted expression language;  
* visual behaviour editor;  
* sandboxed DSL;  
* predefined procedural building blocks.

This is explicitly outside the initial scope.

---

# **20\. Persistence**

The first prototype should require no permanent persistence.

When persistence is introduced, the system should distinguish between:

* immutable/default built-in content;  
* user customization;  
* user-created scenes;  
* runtime state.

Saved content should use an explicitly versioned format so future Pixel Display versions can migrate older creations safely.

For example:

PixelScene  
version: 1  
...

Avoid making the persistence model depend directly on internal rendering implementation.

---

# **21\. Security**

Future user-generated content must be treated as untrusted input.

The system should never require arbitrary code execution merely to support custom Pixel Display content.

Important eventual safeguards include:

* schema validation;  
* bounded dimensions;  
* bounded frame counts;  
* bounded animation complexity;  
* limited memory usage;  
* limited execution time;  
* restricted procedural APIs;  
* safe serialization;  
* no arbitrary DOM access;  
* no arbitrary browser API access.

These constraints should be considered before introducing advanced programmable content.

---

# **22\. Performance Requirements**

The Pixel Display should be lightweight enough to remain permanently present within the Sylf interface.

Principles:

* avoid thousands of DOM nodes;  
* update only when necessary;  
* minimize React involvement during frame-by-frame rendering;  
* keep logical resolution intentionally small;  
* avoid unnecessary allocations during animation;  
* pause or reduce work when the display is not visible;  
* stop unnecessary animation when the application is backgrounded;  
* measure rather than guess at performance limits.

No advanced optimization should be introduced before profiling demonstrates a need.

---

# **23\. Responsive Behaviour**

The logical display should remain identical across screen sizes.

Only presentation changes.

The renderer should preserve:

* aspect ratio;  
* logical pixel proportions;  
* crisp edges;  
* consistent coordinate mapping.

No animation or scene should require separate mobile coordinates.

Pixel content should therefore remain portable between:

* dashboard card;  
* mobile view;  
* Character Studio;  
* enlarged preview.

---

# **24\. Accessibility**

The Pixel Display should be visually expressive without making critical application information dependent on animation.

Requirements should eventually include:

* support for reduced-motion preferences;  
* no required interaction communicated only through colour;  
* pause or simplify intense animation when appropriate;  
* avoid flashing patterns that could create accessibility risks;  
* preserve normal keyboard/navigation behaviour around the display;  
* provide accessible labels when the display itself represents meaningful state.

Decorative companion behaviour should remain non-essential to completing core application tasks.

---

# **25\. Reduced Motion**

When the user's system or Sylf preferences request reduced motion:

* large particle sequences should be reduced or removed;  
* looping animation should become subtle or static;  
* essential state changes should remain understandable;  
* the companion may use static pose changes instead of animated transitions.

The display should remain useful even with animation completely disabled.

---

# **26\. Separation From Existing Companion System**

Initial development should not immediately replace the production companion implementation.

The Pixel Display should first exist as an isolated experimental subsystem.

For example:

/dev/pixel-display

or an equivalent development-only surface.

This allows experimentation with:

* logical resolution;  
* visual pixel size;  
* grid spacing;  
* character proportions;  
* animation timing;  
* rendering performance.

Only once the engine has proven suitable should integration with production companion surfaces begin.

---

# **27\. Foundation Requirements**

The first real foundation should be intentionally small.

It should contain only the concepts that are highly likely to survive future iterations.

Minimum architectural concepts:

PixelDisplay  
Framebuffer  
Renderer  
Logical coordinates  
Basic runtime  
Content definition

The foundation should demonstrate:

1. a fixed logical pixel matrix;  
2. individually addressable pixels;  
3. crisp responsive rendering;  
4. a character created from pixel information;  
5. simple runtime animation;  
6. direct modification of individual cells.

Nothing more is required to prove the concept.

---

# **28\. Phase 0 — Product Experiment**

Before building the production architecture, create a disposable or semi-disposable visual prototype.

Suggested experiment:

48 × 48 logical display  
\+  
simple character  
\+  
blink animation  
\+  
click pixels to toggle  
\+  
responsive Canvas

The purpose is not to establish production architecture.

The purpose is to answer questions such as:

* Does 48×48 look right?  
* Are the pixels too large?  
* Are they too small?  
* Should inactive pixels remain faintly visible?  
* How large should the gaps be?  
* Does the display feel premium?  
* How much of the grid should the character occupy?  
* Does motion look good at this resolution?

The experiment should be easy to discard.

---

# **29\. Phase 1 — Core Display Foundation**

Once the concept has been visually validated, establish the production-quality engine foundation.

Likely scope:

* logical display abstraction;  
* framebuffer;  
* Canvas renderer;  
* resizing/presentation layer;  
* deterministic coordinate system;  
* basic update/runtime mechanism;  
* basic content interface;  
* tests for coordinate and framebuffer behaviour.

No editor.

No database.

No full animation authoring system.

No marketplace.

No user scripting.

---

# **30\. Phase 2 — Sylf Character**

Move the companion into the Pixel Display architecture.

Potential scope:

* base Sylf pixel character;  
* expressions;  
* eye states;  
* simple idle behaviour;  
* focused state;  
* sleeping state;  
* basic transitions.

This phase establishes the Pixel Display as the actual home of the companion.

---

# **31\. Phase 3 — Animation & Effects**

Introduce reusable display behaviour.

Potential features:

* animation clips;  
* timing system;  
* transitions;  
* particles;  
* basic procedural effects;  
* task-completion reaction;  
* streak reaction;  
* level-up reaction;  
* AI-thinking behaviour.

The exact animation architecture should be designed based on lessons from the earlier phases.

---

# **32\. Phase 4 — Pixel Studio**

Allow users to directly manipulate the display.

Potential first capabilities:

* draw;  
* erase;  
* palette;  
* preview;  
* simple frames;  
* save creation.

Start small.

Do not reproduce the complexity of professional pixel-art software unnecessarily.

---

# **33\. Phase 5 — Expanded Creativity**

Only after real usage validates the system should Sylf consider features such as:

* advanced layers;  
* reusable assets;  
* custom characters;  
* custom scenes;  
* sharing;  
* community content;  
* procedural systems;  
* programmable behaviour.

These are product opportunities rather than committed requirements.

---

# **34\. Explicit Non-Goals for the Foundation**

The first implementation should **not** attempt to provide:

* a complete Character Studio;  
* a full pixel-art editor;  
* Photoshop-style tooling;  
* arbitrary JavaScript scripting;  
* marketplace/community features;  
* cloud sharing;  
* complex scene graphs;  
* WebGL/WebGPU rendering without evidence it is necessary;  
* advanced physics;  
* multiplayer collaboration;  
* AI-generated pixel content;  
* extensive database schemas;  
* compatibility with hypothetical future formats.

Building these prematurely would make the foundation harder to understand and change.

---

# **35\. Engineering Principles**

### **Start with the smallest correct abstraction**

Build only what is required by current behaviour while keeping obvious future boundaries clean.

### **Separate engine from content**

The renderer should not know what Sylf is.

Sylf should not know how Canvas works.

### **Separate logical space from presentation**

Everything inside the display uses logical coordinates.

Only the renderer understands physical dimensions.

### **Prefer data over duplicated assets**

Where practical, character variation should eventually come from reusable structured content rather than entire duplicated images.

### **Keep rendering imperative where appropriate**

Do not force high-frequency pixel rendering through React state.

React may own the containing interface while the renderer manages the pixel surface.

### **Measure performance**

Do not prematurely introduce complex GPU or worker architecture.

### **Design persistence deliberately**

Do not serialize arbitrary internal objects merely because they currently exist.

### **Version public formats**

Anything persisted as user content should eventually use explicit schema versions.

### **Treat user-created content as untrusted**

Bound and validate anything capable of affecting runtime behaviour.

### **Preserve replaceability**

Renderer, content definitions and editor tooling should communicate through clear boundaries.

---

# **36\. Testing Strategy**

The engine should eventually support testing without requiring visual browser inspection for every behaviour.

Useful test categories:

### **Unit tests**

* coordinate bounds;  
* framebuffer writes;  
* clearing;  
* pixel colour conversion;  
* scene composition;  
* deterministic animation state.

### **Rendering tests**

Verify known framebuffer states produce expected visual output.

### **Resize tests**

Ensure display scaling does not alter logical coordinates.

### **Performance tests**

Measure expensive scenes under realistic hardware constraints.

### **Interaction tests**

Verify drawing and editing behaviour once Pixel Studio exists.

Visual testing remains valuable but should complement deterministic tests rather than replace them.

---

# **37\. Success Criteria for the Foundation**

The first production foundation is successful when:

* the card operates as a real logical pixel matrix;  
* every logical pixel can be addressed independently;  
* pixel content is not dependent on physical UI dimensions;  
* the display scales cleanly between supported sizes;  
* one simple character can be rendered entirely through the pixel engine;  
* the character can perform at least one runtime animation;  
* individual pixels can be modified without replacing the entire display;  
* engine code contains no dependency on the specific Sylf character;  
* the implementation remains small enough to understand and change easily.

At this stage the feature does **not** need to look complete.

It needs to prove that the architecture points in the correct direction.

---

# **38\. Product Success Criteria**

Long term, the Pixel Display succeeds if users perceive it as something more than a character animation.

The intended feeling is:

> "This is my little live display inside Sylf."

Rather than:

> "This is an animated mascot."

Users should eventually feel that the display is:

* alive;  
* customizable;  
* expressive;  
* personal;  
* reactive;  
* creative;  
* unmistakably part of Sylf.

---

# **39\. Key Architectural Boundary**

The target relationship should remain:

Sylf Application  
       │  
       │ events  
       ▼  
Pixel Runtime  
       │  
       ▼  
Scene / Content  
       │  
       ▼  
Framebuffer  
       │  
       ▼  
Renderer  
       │  
       ▼  
Pixel Display

And Pixel Studio should sit beside the application runtime:

             Pixel Studio  
                   │  
                   │ edits content  
                   ▼

Application → Pixel Runtime → Scene → Framebuffer → Renderer

The editor does not become the renderer.

The character does not become the engine.

The application does not manipulate pixels directly.

---

# **40\. Final Product Thesis**

Sylf Pixel Display transforms the companion card from a container for visual assets into a small software-defined display platform.

Its foundation is deliberately simple:

> **a fixed logical grid of individually controllable pixels.**

From that foundation, Sylf can gradually evolve toward characters, expressions, animation, environments, interaction and eventually user-created digital worlds without needing to redesign the underlying concept each time.

The immediate objective is therefore **not to build everything described in this document**.

The objective is to build the smallest technically sound foundation that preserves this direction and then evolve the system based on real visual experimentation and product needs.

