<!-- EXPERIENCE.md · v0 · 2026-08-10 · LIVING DOC -->
<!-- Owner: Will Genske. Author: assistant. The build EXPERIENCE — the product's "make it the best build ever" layer. -->

# The Build Experience — the layer that makes it win (v0, LIVING)

**Status: LIVING, opened 2026-08-10 at Will's direction.** The engine (`cleanSpec` → `planSpec`
→ `applyPlan`) is *what* the builder does. This doc is *how it feels* — and that is a first-class
product surface, not polish. This is a commercial product (Mageco); it has to be designed to win.

**The thesis:** a non-technical owner should feel **led, safe, and delighted** while an app builds
itself in front of them. Fun, easy, previews everywhere, proactive suggestions, and the quiet
confidence that *nothing they do can break it*.

---

## 1. The one insight that makes all of this cheap

Every delight moment maps to a piece of the safety spine we already built. The experience is not a
second engine — it **rides on** the first:

| Experience promise | Powered by (built) |
|---|---|
| Show a preview of any change before committing | `planDiff` / `previewDiff` — compute before/after **without applying** |
| The app speaks itself back in plain English | `summarizeSpec()` |
| Always offer a smart next move | the `catalog` (the structured menu of everything possible) |
| "The AI can't break or uglify your app" | `cleanSpec` gate (bounded fields, unknown-refused, **contrast floor**) |
| Never a dead end | `runIntake` returns the **honest boundary**, never a fake |
| Rewind anything, fearlessly | `config/appSpec/history` (every diff versioned) |

So each feature below names the mechanism it stands on. If a feature has no mechanism, it's not ready.

## 1b. Two form factors, one product (ruled 2026-08-10, Will)

The **builder** and the **built app** are different surfaces with opposite device needs — do not
conflate them:

- **The built app is mobile-first.** Owners' members open it on a phone/iPad (the Dojo is the
  proof). The preview frame we render is therefore a **phone frame** — correct and deliberate.
- **The builder itself is desktop-first, iPad minimum.** Authoring an app on a phone would be
  miserable enough to make someone quit before they start. So:
  - **Desktop** = the real workspace: a wide canvas — chat/interview on one side, the live phone
    preview beside it, room for the time machine and suggestion cards.
  - **iPad (landscape)** = supported minimum.
  - **Phone** = a friendly **gate**, not the app: "The builder needs a bigger screen — open this on
    your computer or iPad to build. (Your finished app works great on phones — that's what your
    members will use.)" Plus a one-tap "email me the link." Never a broken half-experience.

**Does this change the build? No — and it clarifies it.** The engine (`cleanSpec`, `planSpec`,
`buildPreview`, `previewDiff`) is pure and device-agnostic; nothing there moves. The distinction
lives entirely in the *builder chrome*: a desktop/iPad layout wrapping a phone-frame preview, plus
the small-screen gate. If anything it's a gift — "desktop workspace, phone preview" is the layout
every good app builder converges on.

## 2. Design principles

1. **The app leads.** The owner is never staring at a blank prompt. Every turn ends with 2–3
   tappable, *previewed* directions + a free-text option. The easiest path is the only path.
2. **Preview before commit, always.** No change is a surprise. Hover/tap a suggestion → see a ghost
   of it. Confirm → it lands with a visible animation.
3. **Fearless by construction.** Everything is undoable (time machine) and nothing proposed can be
   unsafe (the gate). Confidence is the feature.
4. **Domain language only.** The owner speaks their world ("a course platform where people earn
   levels"); the AI does every mapping to modules/fields. No jargon crosses the table.
5. **Honest about limits.** A gap becomes a one-tap feature request, framed as a roadmap — never a
   hallucinated capability.
6. **Living, never "done."** The app is an object you keep talking to. Building and running are the
   same conversation.

## 3. The feature list (the creative core — keep adding)

Tagged **[v1]** (first release), **[next]**, **[later]**. Mechanism in *italics*.

### The build is a live show
- **[v1] Ghost preview frame.** A phone/app frame beside the chat that reflects the current Spec.
  *buildPreview(spec) → a render-agnostic preview model → HTML frame.*
- **[v1] Animated diffs.** A change doesn't just appear — the new page slides in, the recolored
  button cross-fades, the level ladder grows. The owner *sees it land*. *previewDiff(before, after)
  → typed change events that drive the animation.*
- **[next] Hover-to-preview.** Every suggestion shows a ghost of itself before "yes." *planDiff on a
  candidate diff, rendered but not applied.*
- **[v1] "Two roads" cards.** Each step offers a few illustrated, previewed directions + free text.
  *catalog + starter Specs.*

### Fearlessness = confidence
- **[next] Time machine.** A scrubber to drag the whole app backward through its own history and
  watch it rewind. *config/appSpec/history + buildPreview per version.*
- **[v1] "Safe by construction" badge.** Surface the guarantee in the UI ("I can't make your app
  unreadable"). *cleanSpec + contrast floor — it's literally true.*

### The AI as a co-builder
- **[v1] Warm narrator.** Says what it will do *and why*, celebrates milestones. *summarizeSpec +
  the plain-English proposal preview (describeProposal).*
- **[next] Proactive next-best-move.** "Most course apps add a certificate when members finish —
  want one?" *catalog + pattern library of common Spec shapes.*
- **[later] Explain-anything.** Tap any element in the preview → "what is this / change it." *the
  Design-Inspector idea at app scope.*
- **[v1] Plain-English checkpoints.** Every few diffs: "Here's your whole app in a paragraph — still
  right?" *summarizeSpec.*

### Vibe → design
- **[next] Palette-from-a-feeling.** "Calm and premium" → three live palette thumbnails, *all
  guaranteed readable*, pick one. *cleanTheme + checkContrast on each proposal.*

### Fastest path to wow
- **[next] Clone-a-vibe gallery.** Start from a working demo app you can walk before customizing.
  *a set of ready Specs (course / community / booking).*
- **[v1] Conversational forever.** Building and editing are one ongoing chat. *runIntake loop.*

## 4. Differentiators (the positioning)

- **Safe by construction** — no competitor can honestly say "the AI cannot break your app." We can.
- **You own it** — clone-first, BYO key: your data, your key, your app. No lock-in.
- **A living app** — never "done"; you keep talking to it.

## 5. Build order (experience track)

1. **[done 2026-08-10] The preview harness** — `buildPreview` + `previewDiff` + a self-contained
   HTML renderer, so the ghost-preview and animated-diff features have something real to stand on.
2. **[done 2026-08-10] Wired into `reviewProposal`** — every proposal now returns `preview` (the
   resulting app frame) + `previewChanges` (typed animated-diff events) alongside the plan, both
   derived from the cleaned/gated specs. The intake can *show* every proposal, not just describe it.
3. The narrator copy layer (describeProposal → warm voice) + checkpoints.
4. The starter-Spec gallery + "two roads" cards.
5. Time machine (once history is live on real infra).

## 6. Open questions

1. Preview fidelity: a *symbolic* frame (nav + feature cards + real theme) for v1, or a
   closer-to-real render? (Leaning: symbolic but themed — fast, honest, enough to feel the app.)
2. Do animated diffs live in the same renderer, or a diff-overlay on top of two static frames?
3. How much does the narrator "sell" vs stay neutral? (Leaning: warm + confident, never hypey —
   matches Will's own voice guidance.)
