# Contour map of anywhere

Search any place and see it as a topographic map, drawn live from real elevation data. Point at the map and the contour at that height lights up in the accent, so you can follow it around a mountain. Turn the sun to read the shape of the land, or warm it to golden hour.

It builds on the Contours study in [Shaders for interfaces](../interface-shaders), but here the land is real.

## How it works

- **Elevation** comes from [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen, on AWS Open Data), in the Terrarium format: each PNG pixel encodes a height, `R × 256 + G + B / 256 − 32768` metres. Tiles are decoded to metres in the browser and packed into one float texture.
- **One WebGL2 fragment shader** draws everything. For each pixel it samples the height, draws a line where the height crosses a multiple of the interval (every fifth line thicker), shades the slopes by a sun at 35 degrees, and lights the line at the height under your pointer.
- **The interval follows what's in view.** It picks a round number (1, 2, 5, 10, 20, 25, 50, 100 m and up) so there are always a readable number of lines.
- **Search** uses [Nominatim](https://nominatim.org) (OpenStreetMap). It sends one request per search, with no typing-ahead, as Nominatim's usage policy asks.
- Drag, scroll, pinch, the arrow keys or plus and minus move the map.

There are no libraries, no build step and no keys.

## Run it

Serve the folder with any static server and open `index.html`. It needs a browser with WebGL2.

## Data and credits

- Search: Nominatim, © OpenStreetMap contributors, under the [ODbL](https://www.openstreetmap.org/copyright).
- Elevation: Terrain Tiles by Mapzen. Its sources, as required by their licences:
  - ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and funded under National Science Foundation awards 1043681, 1559691, and 1542736
  - Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017
  - Austria terrain data © offene Daten Österreichs, Digitales Geländemodell (DGM) Österreich
  - Canada terrain data contains information licensed under the Open Government Licence, Canada
  - Europe terrain data produced using Copernicus data and information funded by the European Union, EU-DEM layers
  - Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration
  - Mexico terrain data source: INEGI, Continental relief, 2016
  - New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved)
  - Norway terrain data © Kartverket
  - United Kingdom terrain data © Environment Agency copyright and/or database right 2015. All rights reserved
  - United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey

Where sources meet, some areas show faint seams in the data, for example near Kebnekaise.

Made with Claude Code.
