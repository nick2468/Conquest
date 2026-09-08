# Editing the world map yourself

The coasts of the world map are one file: `tools/data/nick-world-outline.svg`.
Every closed shape in it is land. Change the file, run one command, and
the map follows.

## The tool

Use **Inkscape**. It is free, open source, and made for this kind of file.
Get it from https://inkscape.org (Windows installer, no account needed).

## The steps

1. In Inkscape, open `C:\Users\nick2\code\Conquest\tools\data\nick-world-outline.svg`.
2. Press **N** for the Node tool. Click a coast to see its nodes.
   - Drag a node to move the coast.
   - Double-click a coast to add a node.
   - Click a node and press **Delete** to remove it.
3. To add an island, press **B** for the Pen tool, click around the island,
   and click the first point again to close it. Any closed shape is land,
   filled or not.
4. To remove an island, press **S**, click it, and press **Delete**.
5. **File > Save As**, choose **Plain SVG**, and keep the same file name.
6. In a terminal in the Conquest folder, run:

```bash
node tools/make-world-map.mjs
```

7. Open http://localhost:5180/map.html and reload. The game picks it up too.

## What decides where a border goes

The borders inside the continents are not in your file. They come from
Natural Earth, laid over your drawing with pins in `tools/world-groups.json`.
A pin is `[longitude, latitude, x, y]`: a point on the earth, and where
it sits in your drawing. If a border lands in the wrong spot after you move
a coast a long way, move the nearest pin the same way.

If a place ends up with no land at all, the command stops and names it.
Move the pin nearest that place and run it again.
