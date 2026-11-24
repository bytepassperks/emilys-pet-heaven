# Width 280 (smallest phone) - v2

Image: extra/width-280.png (all images loaded; hero CTAs clear the strip)
Role: original

Verdict: The layout survives 280px without clipping or horizontal collapse, but it degrades into a very long stack of near-identical full-width blocks, and the floating contact buttons sit on top of content near the bottom.

## Strengths:
- Color: the warm maroon, cream and gold palette is committed and specific to a pet-care business.
- Buttons span the column with a small consistent gutter at 280, so every tap target is wide and unambiguous.
- Price cards stack one per row with illustration, price and action grouped, so each offer stays readable without horizontal scrolling.
- Real photography is present rather than grey frames.
- Nothing is cut off at the right edge; no visible horizontal overflow or clipped card edges.

## Blocking:
- [Accessibility / Composition] The floating contact buttons (dark call and green WhatsApp) overlap the section beneath them near the bottom. At 280 two 48px circles plus a gap take roughly a third of the viewport width, covering content and part of the action they support. At 360px and below, collapse them into one full-width sticky bar with two labelled halves, and add bottom padding equal to the bar height plus 16px.

## Important:
- [Typography] At this reduction glyphs are too small to verify line-level wrapping; check a 1:1 crop at 280.
- [Composition] Every section after the hero is a full-width block of similar height on a similar ground. Make pricing a compact single-column list with the price on the same line as the plan name, and collapse footer groups into accordions.
- [Hierarchy] A gold filled button appears in nearly every section at the same size. Allow one gold button per viewport and demote later calls to text links.
- [Color] A violet panel mid-page plus a green pill plus gold actions gives three accent systems. Recolour the violet into the maroon and cream family; reserve green for WhatsApp.
- [Responsiveness] Card padding appears unchanged from wider breakpoints, leaving a text column narrower than the card. Reduce card padding to 16px at 360px and below.

## Polish:
- Vary the ground tone between adjacent sections so the long stack has visible seams.
- Tighten the gap between the hero strip and the first content section.
- Give footer headings a letterspaced treatment so columns scan faster.

## Single highest-leverage change:
Replace the two floating circles with one sticky two-part call and WhatsApp bar at 360px and below, and pad the page bottom to match it.
