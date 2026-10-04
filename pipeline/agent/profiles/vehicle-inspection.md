# Profile: vehicle inspection

The footage is a specialist shop or mobile inspector going over one vehicle. `brief.inspection.type`
says which kind:
- **Pre-purchase** (the usual case): the buyer hired the inspector and often isn't there. They may be
  hundreds of miles away and about to spend serious money on a car they have never seen in person.
- **Pre-sale / Consignment**: the seller or consignor commissioned it to show prospective buyers
  the car's real condition.
- **Service**: the shop that looks after the car shows its owner what it found during a service
  visit or periodic inspection, what was done, and what is coming due.
- **Post-purchase baseline**: a new owner wants to know where the car stands and what to budget for.

`brief.audience` names the viewer. `brief.vehicle` holds year, make, model, trim, VIN and mileage
when the inspector entered them. The viewer wants to know: is this car what the listing says, what's
wrong with it, what will that cost, and is anything a deal-breaker.

## What the footage usually covers
- Exterior walkaround: panel gaps, paint, overspray, rust, curb rash, glass, lights.
- Paint-meter readings.
- Tires: tread, date codes, matching brands.
- Brakes.
- Interior and electronics.
- Engine bay: leaks, hoses, belts.
- Cold start and idle (listen to it).
- Scan-tool results: codes, readiness, misfire counters.
- Compression or leak-down tests, borescope.
- Underside on a lift: leaks, rust, accident repair, bushings, exhaust.
- Road test.
- Service records.

Supporting files are often the most precise evidence: scan reports, compression or leak-down
sheets, borescope stills, paint-meter photos, service records, history reports. Read numbers off
them exactly. A clear photo of a scan report or compression sheet makes a strong close-up.

## Findings
A finding is a condition the inspector called out (or that is unmistakable on camera) that the viewer
should act on, budget for, or ask the seller about. These are not findings:
- the inspector explaining how a test works;
- checks that came back fine. Those are **positives**.

Specialist inspections usually turn up many positives, and for a buyer they are big news:
- "paint reads factory on every panel"
- "no codes stored"
- "compression even across all six"
- "records back to new"

Record every one the inspector states. The montage of good news matters more here than in a home
inspection. On a service visit, work the footage shows being completed ("new front pads and rotors
fitted") is a positive too.

`area`: Exterior, Paint & body, Wheels & tires, Brakes, Interior, Electrical, Engine, Cooling,
Drivetrain, Suspension, Underside, Road test, Records. Merge tiny areas.

`priority`:
- `safety`: unsafe to drive, or likely to fail soon in a way that could hurt someone. Examples:
  failing brakes, structural rust or damage, fuel leaks, tires past their life, steering play.
  Use only when the inspector treats it that way.
- `repair`: should be fixed and will cost real money. Examples: active oil or coolant leaks, a worn
  clutch, failing components, fault codes, undisclosed accident repair.
- `minor`: small fixes and cosmetic items (stone chips, curb rash, worn trim, a bulb).
- `monitor`: fine today, worth watching. Examples: light seepage the inspector calls normal for the
  age, wear items with life left.

`who`:
- `seller`: items worth raising before the sale closes (fix it, disclose it, or price it in).
  This is the default for pre-purchase problems.
- `owner`: upkeep the owner should plan and budget for. This is the default for service visits
  and post-purchase baselines.
- `specialist`: the inspector recommends further diagnosis before the cost can be known (for
  example a transmission shop, or a body shop to assess repair quality).

Never use `builder` or `homeowner` for vehicles.

`estimate`: include only when the inspector states a cost, aloud, in the notes or in a supporting
file. Copy it as stated ("$1,800–2,400", "about $600"). Never invent or look up prices, labor hours
or part numbers. Most findings will have no estimate, and that's fine.

## Numbers and specifics
Car people trust numbers: mileage, fault codes (P0302), compression per cylinder, tread depth in
32nds, tire date codes, paint thickness. Put them in the report and on screen, exactly as the
inspector said them or as they are legible in the footage or files. Never guess or round a number.

Don't name a model-specific failure (a known bearing, bore or gearbox issue) unless the inspector
raised it. Don't name the cylinder, corner or side unless it was said or is plainly visible.

## Bottom line
The `overview` headline is the inspector's overall take, in one honest line. If the inspector gave a
verdict ("I'd buy it at the right price", "I'd walk away"), keep it in their words. If they didn't,
describe the condition and don't invent a verdict. Never tell the viewer to buy or not to buy on
your own.

## Tone
Straight, specific and calm: a trusted mechanic briefing a friend on the phone. Don't sell the car
and don't scare the buyer. The inspector's own temperature sets the tone. For pre-sale and
consignment reports the viewers are prospective buyers, so be transparent and don't spin defects.

The title is about the car and the viewer: "Your 911 Carrera S, inspected", "2011 911 Carrera S:
pre-purchase inspection". Use the brief's year, make and model; don't guess them from the footage.
Title the `punchlist` scene for this viewer: "Before you buy", "Raise with the seller", or "What
to budget for", not "Your punch list".

## Report limitations (for `findings.json → limitations`)
State plainly what this inspection can't establish:
- internal engine or transmission condition beyond the tests performed;
- intermittent faults that didn't show up;
- anything not shown;
- future reliability.

One to three short sentences, no legalese.
