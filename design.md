# applecry Personal Homepage Design System

## 1. Why this file exists

This file is the persistent design context for the applecry personal homepage. Any AI agent or developer changing the site must read it before editing UI code.

The purpose is not to freeze the website. It is to keep new pages and features recognizably part of the same product, instead of falling back to generic AI-generated layouts.

Reference workflow: translate visual references into explicit rules, tokens, components, states, and validation criteria. A screenshot can inspire a direction; this file defines the reusable system.

## 2. Product identity

The site is a public workbench, not a resume, marketing landing page, or generic AI blog.

It should feel like:

- A quiet editorial field notebook.
- A working desk that is still in use.
- Warm paper in daylight and a focused studio at night.
- Rational, restrained, personal, and slightly nocturnal.
- Content-first, with evidence of ongoing work.

Primary audience:

- People interested in AI practice, product experiments, personal automation, writing, and music.
- Visitors who want to understand what applecry is building and thinking about now.

Design keywords:

`editorial` `workbench` `field notes` `paper grid` `night studio` `precise` `alive`

Avoid:

`AI SaaS template` `marketing hero` `glassmorphism` `purple gradient` `floating orb` `card wall` `fake metrics` `decorative noise`

## 3. Core principles

### 3.1 Brand before decoration

The first viewport must clearly say `applecry` and communicate the public-workbench idea. Photography, copy, and hierarchy should carry the identity. Do not add abstract decoration when real content can do the job.

### 3.2 Evidence over claims

Every section should point to something real: an article, project state, source, date, track, or next action. Never invent statistics, testimonials, project completion, news summaries, or experience to make the page look full.

### 3.3 Editorial hierarchy, not equal cards

Important content should be larger and quieter content should recede. Do not give every item the same rectangular card treatment. Use typography, rules, whitespace, and full-width bands before adding containers.

### 3.4 Restrained variety

The site should not be dominated by one hue. Green is the primary accent, supported by amber, blue, and rose. Accent colors communicate category or mood; they are not ambient decoration.

### 3.5 Motion explains state

Animation is for hover feedback, panel transitions, audio state, and voice state. It must not compete with reading.

### 3.6 Mobile is a real composition

Mobile is not a compressed desktop. Navigation, hero typography, news cards, music controls, and PageAgent input must remain readable and independently usable.

## 4. Design tokens

The CSS custom properties in `styles.css` are the source of truth. Reuse them before adding new values.

### 4.1 Light theme

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#efebe2` | Page canvas, warm paper base |
| `--paper` | `#fbf7ee` | Section and card surface |
| `--paper-strong` | `#ffffff` | Highest-emphasis surface |
| `--ink` | `#171b18` | Primary text and controls |
| `--muted` | `#626962` | Secondary text and metadata |
| `--line` | `rgba(23, 27, 24, 0.14)` | Default dividers |
| `--line-strong` | `rgba(23, 27, 24, 0.28)` | Emphasized dividers |
| `--green` | `#4e765f` | Primary accent and active state |
| `--green-soft` | `#dbe7dc` | Selected and featured surface |
| `--amber` | `#bd7a36` | Warm secondary accent |
| `--amber-soft` | `#eed0a8` | Warm highlight and focus aid |
| `--blue` | `#426d86` | Technical and informational accent |
| `--blue-soft` | `#d9e6ec` | Informational surface |
| `--rose` | `#9b4d58` | Human or experimental accent |

### 4.2 Dark theme

| Token | Value |
| --- | --- |
| `--bg` | `#121511` |
| `--paper` | `#1d211c` |
| `--paper-strong` | `#262b25` |
| `--ink` | `#f7f1e7` |
| `--muted` | `#b8b3a9` |
| `--green` | `#9fc6aa` |
| `--amber` | `#e2af69` |
| `--blue` | `#94b6c9` |
| `--rose` | `#d78b95` |

Dark mode must remain warm and readable. Do not turn it into a blue-black developer dashboard.

### 4.3 Geometry and elevation

- Content maximum width: `1120px`.
- Background grid: `64px`.
- Standard corner radius: `8px` maximum.
- Circular controls are allowed for theme, audio, and Agent actions.
- Pills are reserved for tags, segmented controls, status labels, and compact actions.
- Standard shadow: `0 24px 70px rgba(29, 28, 23, 0.14)` in light mode.
- Use borders and spacing before shadows. A page section must not look like a floating card.

## 5. Typography

Font stack:

```css
Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif
```

Rules:

- Chinese is the primary reading language.
- English is used for compact editorial labels such as `FIELD LOG`, `NOW PLAYING`, and statuses.
- Letter spacing is `0` for normal text. Small uppercase labels may use at most `0.08em`.
- Use weight and size to create hierarchy; do not rely on color alone.
- Hero text is bold and compact, but must never split individual Chinese words awkwardly or overflow the viewport.
- Use explicit breakpoint sizes for display text. Avoid uncontrolled viewport-width scaling.
- Body text line height: approximately `1.65`.
- Long-form article measure: `680px` to `700px`.
- Paragraphs should remain left-aligned. Do not center long copy.

Suggested hierarchy:

| Role | Desktop | Mobile | Weight |
| --- | --- | --- | --- |
| Hero title | `88px` to `98px` | `38px` to `48px` | `900+` |
| Section title | `40px` to `56px` | `30px` to `38px` | `850+` |
| Card title | `18px` to `22px` | `18px` to `20px` | `780+` |
| Body | `16px` to `18px` | `16px` | `400` to `600` |
| Metadata | `12px` to `14px` | `12px` to `14px` | `700+` |

## 6. Layout system

### 6.1 Page rhythm

- Use full-width bands with a constrained inner width.
- Standard desktop section spacing: `96px` to `112px` above major sections.
- Standard mobile section spacing: `72px` to `80px`.
- Use thin rules to separate editorial content.
- Maintain visible contrast between dense operational sections and quiet reading sections.

### 6.2 Hero

- Full-bleed real workspace image with readable dark overlay.
- Brand, category line, title, supporting copy, and two clear actions.
- Title must use intentional line breaks. Never allow browser wrapping to create a fourth accidental line.
- Keep a hint of the next section visible on common desktop and mobile viewports.
- The latest dispatch may sit beside the main copy on wide screens and move below it on smaller screens.
- Do not put the hero copy inside a card.

### 6.3 Grids

- Desktop repeated-content grids: up to 3 columns.
- Focus modules may use 4 columns only when each item remains readable.
- Tablet: 2 columns where useful.
- Mobile: 1 column.
- Stable tracks and minimum dimensions must prevent content from resizing the layout unexpectedly.

### 6.4 Sticky editorial layouts

Notes and reading sections may use a sticky heading beside a scrolling list on desktop. Disable sticky behavior below `900px`.

## 7. Component rules

### 7.1 Header

- Fixed, transparent over the hero, paper-backed after scrolling.
- Structure: brand, centered navigation, theme control.
- Navigation may scroll horizontally on smaller screens.
- Active state uses `--green-soft`; no heavy underline or large filled tab.

### 7.2 Buttons and links

- Primary command: high-contrast filled button.
- Secondary command: outlined or translucent button.
- Minimum target height: `44px`.
- Icon-only controls need accessible labels and tooltips when meaning is unfamiliar.
- Inline editorial links use text plus a restrained arrow.

### 7.3 Cards

Cards are allowed only for repeated items, a genuinely framed tool, or a modal.

- Radius no larger than `8px`.
- No cards inside cards.
- Prefer `1px` borders and subtle hover lift up to `3px`.
- Do not use different shadows on every item.

### 7.4 News signals

- Topic selector is a segmented control: `AI / 美股 / A股`.
- Each item must show date, title, meaningful Chinese summary, source, and tags.
- Summary must be derived from the actual source. Duplicate or fabricated fallback summaries are prohibited.
- If a reliable summary is unavailable, omit the item or state that no summary is available.
- News is a signal, not investment advice; avoid visual language that implies recommendations to buy or sell.

### 7.5 Music desk

- The player is a framed tool, so a strong dark surface is appropriate.
- Album/mood area and track list should remain visually connected.
- Play, pause, progress, time, and active-track state must be functional.
- Never autoplay audio.
- Track mood copy may be personal; lyrics must not be reproduced.

### 7.6 Projects

- Every project displays an honest status: `PLANNING`, `RESEARCHING`, or `LIVE`.
- Include current state, core question, and next step.
- Avoid launch-style claims when a project is experimental.

### 7.7 Long-form notes

- Reading width around `690px`.
- Large title, compact metadata, strong section hierarchy.
- Callouts use a left accent rule, not a nested card.
- Code or structured process blocks use the dark workbench surface.

### 7.8 PageAgent

- Floating wake control stays in the lower-right corner without covering primary content.
- Voice transcript appears above the editable input.
- Recording state must expose live transcript, timer, waveform, stop, and send controls.
- Stopping must actually terminate speech recognition.
- Keyboard input remains available when voice permission or recognition fails.
- Agent actions must be visible, understandable, and reversible where possible.

## 8. Imagery

- Use real or generated bitmap imagery with a clear purpose.
- Primary imagery must show the actual workspace, project, interface, or subject.
- Avoid generic stock images, blurred mood photos, decorative bokeh, abstract gradient orbs, and model-authored SVG illustrations.
- Image overlays exist for text contrast, not as the main visual idea.
- Project images should be screenshots of real states when available.
- Social preview imagery must reuse the site's actual palette, typography, and workbench motif.

## 9. Motion and interaction

- Standard transition duration: `160ms` to `200ms`.
- Hover lift: no more than `3px`.
- Header background transition may use subtle blur.
- Music and voice animations communicate active state.
- Avoid continuous decorative motion.
- Respect `prefers-reduced-motion` and reduce transitions to near-zero.
- No interaction may shift surrounding layout unexpectedly.

## 10. Responsive rules

Existing breakpoints:

- `1050px`: reduce wide grids and protect hero side content.
- `900px`: switch major split layouts to one column; disable sticky headings.
- `560px`: simplify header, buttons, rows, and footer.
- `480px`: compact PageAgent voice controls.

Required checks:

- No text or control overlap at any supported viewport.
- Hero title keeps its intended line breaks.
- Navigation remains reachable without covering the brand.
- News summaries fit without clipping.
- Music controls wrap deliberately.
- PageAgent never blocks the main input or important page actions.
- The longest Chinese word or English label fits inside its container.

## 11. Accessibility

- Semantic headings follow one logical hierarchy.
- All controls have visible focus states.
- Icon-only buttons have `aria-label` text.
- Theme colors maintain readable contrast in both modes.
- Do not encode meaning using color alone.
- Interactive targets are at least `44px` where practical.
- Images have useful alt text when informative and empty alt text when decorative.
- Dynamic news and Agent status use appropriate live regions without excessive announcements.

## 12. Content voice

The copy should sound direct, thoughtful, and specific.

Use:

- Short Chinese sentences.
- Concrete verbs: build, test, write, connect, revise.
- Honest uncertainty and visible project status.
- Personal taste where it adds identity.

Avoid:

- `颠覆` `革命性` `下一代` and other inflated claims.
- Generic AI praise.
- Placeholder contact details or fake social proof.
- Repeated category templates presented as summaries.
- Explaining obvious UI behavior inside the page.

## 13. Agent workflow for future changes

Before editing:

1. Read this file and inspect the existing component being changed.
2. Identify which existing token, layout pattern, or component can be reused.
3. State the real content and interaction states required.
4. Add a new abstraction only when it removes meaningful duplication.

While editing:

1. Preserve the editorial hierarchy.
2. Keep content honest and source-backed.
3. Implement desktop and mobile behavior together.
4. Use existing assets and controls before adding dependencies.

Before finishing:

1. Check desktop and mobile layouts.
2. Verify light and dark themes.
3. Test keyboard focus and reduced motion.
4. Confirm all links, music controls, news states, and Agent states still work.
5. Scan for overflow, clipping, accidental wrapping, nested cards, fake content, and unused placeholders.
6. If a durable design decision changed, update this file in the same change.

## 14. Definition of done

A design change is complete only when:

- It looks and behaves like part of the applecry public workbench.
- It uses the established tokens or deliberately updates them.
- Its content is real and links to a real destination.
- Desktop and mobile are both coherent.
- Light and dark themes are readable.
- Interactive, loading, empty, error, and permission states are considered where relevant.
- No text overlaps, clips, or creates accidental line breaks.
- The result has been visually checked, not only compiled.

