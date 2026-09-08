# Making and changing maps

Every map is a plain list of places. A place has:

- an **id**, such as `brazil`
- a **name** and a short name, "Brazil" and "BRA"
- a **continent** it belongs to
- a **shape**: a list of corners, joined up
- a **borders** list: where you may attack from it

That is the whole of a map. The game never knows what a country is or
that the Earth exists. **The borders list is the truth and the shape is
only a picture**, so any map works: a fantasy island, a school
playground, anything you draw.

## The editor

Open `/editor.html` (locally, http://localhost:5180/editor.html).

It never starts from a blank page. Begin from the world, either Australia
map, or a file you saved before.

| To do this | Do that |
|---|---|
| Change a place | Press it. Its corners appear. |
| Move a corner | Drag it. Dropped near another corner, it snaps onto it exactly. |
| Add a corner | Press the small circle halfway along a side. |
| Remove a corner | Press the corner, then "Press a corner to remove it". |
| Move the army count | Drag the square handle. |
| Add a place | "Add a place". It appears in a corner, as a square. |
| **Split a place in two** | Choose it, press "Cut this place in two", press your way across it, press "Make the cut". |
| Fix who borders whom | "Add borders where places touch". |
| Undo | "Undo". |
| Try it | "Send to the game". |
| Keep it | "Save to a file". |

**Corners that snap are the important part.** Two places sharing a border
must share the exact same corners, or a sliver of no-man's land or of
overlap appears along it. Nobody can click the same point twice by hand,
so the editor does it for them. A cut does the same: both halves get the
identical points along the line.

**"What is wrong" is always on screen.** It lists every fault the game
would refuse, as you work, and says "Nothing. This map can be played."
when there are none.

## Where the world map came from

Its coasts are Nick's own drawing, `tools/data/nick-world-outline.svg`.
The program that turned that drawing into places is gone, and the map is
now a plain file that the editor changes. See spec S51.
