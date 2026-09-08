# Drawing a whole map yourself

You draw the coasts **and** the borders. A tool reads the drawing and
turns it into a map. Nothing about the real world comes into it.

## What a map is

A place has an id, a name, a short name, a continent, a shape, and a
list of who it borders. That is all. The game never knows what a country
is or that the Earth exists.

## The drawing

Use **Inkscape**, free from https://inkscape.org.

Open `tools/data/nick-world-outline.svg`, or start a new drawing.

**Two layers.** In Inkscape: Layer > Add Layer.

1. The coasts, as they are now.
2. A layer named **borders**. Draw a line wherever you want a border.

Anything on a layer whose name contains "borders" is a border line.
Anything drawn in **red** counts too, whatever layer it is on, so either
way of working is read.

### The one rule about a border line

**A line only cuts if it goes right across, from sea to sea.** Overshoot
into the sea at both ends. A line that stops halfway leaves the land in
one piece, because you can still walk around the end of it.

A line may bend as much as you like. Several lines may meet.

To cut a place off a coast, one line from the sea, across the land, back
to the sea is enough.

## Reading it in

In a terminal in the Conquest folder:

```bash
node tools/read-map-drawing.mjs tools/data/nick-world-outline.svg World
```

It prints what it found:

```
180 coast shapes, 31 border lines, 886 by 587
42 pieces of land
42 places, 42 of them named from the map they replace
```

**If a line did not cut, it says so, by name:**

```
2 pieces are still joined that used to be apart. Draw a line right
across each of these, sea to sea:
  Western Australia + Eastern Australia
  Indonesia + New Guinea
```

Draw those lines, save, run it again.

Then look at http://localhost:5180/map.html.

## Names

Each piece is named after whichever place of the **old** map sits inside
it, so redrawing keeps every name, continent and bonus. Pieces with
nobody inside come out as "Place 1", "Place 2" and so on. Rename those in
the editor at http://localhost:5180/editor.html.

## Afterwards

The map is a plain file, `src/maps/world.ts`. From then on the editor
changes it: drag corners, cut a place in two, rename, save. You never
have to redraw the whole thing to change one border.
