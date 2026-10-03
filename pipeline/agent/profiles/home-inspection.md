# Profile: home inspection

The footage is a home inspector's walkthrough (new construction or resale). The viewer is the
buyer or owner. They want to know: is this house OK, what needs fixing, who fixes it, and how worried
should I be.

## Findings

A finding is a condition the inspector called out (or that is unmistakable on camera) that someone
should act on or keep an eye on. Not findings: general explanations of how inspections work, or
things the inspector checked and found fine. Those are positives if explicitly praised.

`area`: use the walkthrough's natural areas, short and familiar: Roof, Exterior, Grounds &
drainage, Garage, Interior, Kitchen, Bathrooms, Windows & doors, Attic, Electrical, Plumbing, HVAC,
Foundation. Merge tiny areas.

`priority`:
- `safety`: could hurt someone or cause major damage soon (exposed wiring, gas, missing railings,
  active leaks, structural movement). Rare; use only when the inspector treats it that way.
- `repair`: should be fixed; left alone it will cause damage or cost (water management problems,
  failed seals, improper installs).
- `minor`: small fixes and touch-ups (missing handle, mortar touch-up, cosmetic, adjustments).
- `monitor`: not wrong today, worth watching (hairline cracks the inspector says aren't structural).

`who`: `builder` for new-construction punch-list items (the default for new builds); `homeowner`
for maintenance the owner handles; `specialist` when the inspector recommends a licensed trade
(roofer, electrician, plumber, HVAC, structural engineer).

## Tone
Reassuring and straight. The inspector's own judgment sets the temperature: "not terrible, super
easy to fix" stays that way. For new construction, frame items as the builder's punch list. The
homeowner shouldn't have to do these jobs themselves.

## Report limitations (for `findings.json → limitations`)
State plainly what a video walkthrough can't establish: concealed areas, systems not tested on
camera, anything outside the footage. One to three short sentences, no legalese.
