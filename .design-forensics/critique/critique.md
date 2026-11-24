# Visual critique: Emily's Pet Heaven live

## Mandatory subagent pass

Do not review the images yourself first. Fire one `visual-critic` subagent per entry in `critique.json` `subagentTasks`, in parallel. One image per subagent. Write each returned report to its `report` path. Then run `critique_check.mjs`; the gate fails if any report is missing. Only after that may you synthesise.

| Image | View | Role | Report |
| --- | --- | --- | --- |
| `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\desktop.png` | desktop | original | `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\reports\desktop-original.md` |
| `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\squint-desktop.png` | desktop | squint | `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\reports\desktop-squint.md` |
| `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\silhouette-desktop.png` | desktop | silhouette | `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\reports\desktop-silhouette.md` |
| `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\mobile.png` | mobile | original | `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\reports\mobile-original.md` |
| `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\squint-mobile.png` | mobile | squint | `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\reports\mobile-squint.md` |
| `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\silhouette-mobile.png` | mobile | silhouette | `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\reports\mobile-silhouette.md` |
| `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\dark.png` | dark | original | `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\reports\dark-original.md` |
| `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\squint-dark.png` | dark | squint | `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\reports\dark-squint.md` |
| `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\silhouette-dark.png` | dark | silhouette | `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\reports\dark-silhouette.md` |

## How to review

1. Look at the original desktop screenshot first.
2. Look at `squint-desktop.png`. Name the first three things you see. If they are not the intended hierarchy, say so.
3. Look at `silhouette-desktop.png`. Could this block structure belong to any product in the category? If yes, the composition has not been decided.
4. Review the ten dimensions below. Use blocking, important and polish.
5. Name the single highest-leverage change. One change, not a list.
6. Use the `visual-critic` subagents. If only one model is available, say so; the gate still requires one report per image.

## The ten dimensions

- **Hierarchy**: Does one thing lead? Squint: if everything has the same weight, it has failed.
- **Typography**: Is there a display face with character and a restrained text face? Is the scale decisive?
- **Composition**: Is the section sequence the default hero, three cards, pricing? What is structurally different here?
- **Color**: Is there one committed palette with roles, or a rainbow of accents? Does the ground have a point of view?
- **Imagery**: Are there real product visuals, or grey placeholders and stock? Does every frame wrap a real screen?
- **Motion**: Are two or three moments tuned, or is the same fade-up on everything?
- **States**: Do hover, focus and active communicate something? Is reduced motion handled?
- **Responsiveness**: Does the phone layout have its own composition, or is it the desktop squeezed?
- **Accessibility**: Contrast, labels, focus, target size, headings. The audit covers the measurable part.
- **Brand consistency**: If this is page two, does it belong to page one? Same tokens, same voice, same footer logic.

## Output format

```
Strengths:
- ...

Blocking:
- [dimension] finding. Why it matters. The fix.

Important:
- ...

Polish:
- ...

Single highest-leverage change:
- ...
```

## Images

- desktop: `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\desktop.png`, squint `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\squint-desktop.png`, silhouette `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\silhouette-desktop.png`
- mobile: `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\mobile.png`, squint `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\squint-mobile.png`, silhouette `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\silhouette-mobile.png`
- dark: `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\dark.png`, squint `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\squint-dark.png`, silhouette `C:\Users\joxor\emilys-pet-heaven\.design-forensics\critique\silhouette-dark.png`

A passing audit is not a passing critique. The critique can fail a page that scores 100.
