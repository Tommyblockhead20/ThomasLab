# Fishing Audio Asset Library — v11

This patch bakes the selected recorded instrument notes into the project at:

`public/audio/fishing/instruments/`

## Current library
- 19 curated Philharmonia melodic instruments
- 10 newly curated/downloaded instruments
- 3 optional percussion accents
- Total melodic families: 29

Every melodic family has eight playable scale degrees.

Arrow mapping:
- Left = degrees 1 / 2
- Up = degrees 3 / 4
- Down = degrees 5 / 6
- Right = degrees 7 / 8

The manifest is `public/audio/fishing/instruments/manifest.json`.

## Important
Some uploaded sample packs contained every desired scale note; those are copied from real separate recordings (notably upright bass pizzicato and kalimba). Sparse packs were turned into complete eight-note scales by high-quality offline pitch shifting from a clean source note. This is already baked into the MP3 assets; the game will not need to synthesize those missing pitches at runtime.

Ocarina and handpan source metadata did not provide a reliable full absolute scale, so their files are labeled by degree rather than making up octave labels. Musically they still form an 8-note diatonic scale.

## Remaining planned instruments
Only two items from the immediate target list were not uploaded:
- vibraphone
- steel pan

Those can be added later without changing this asset layout.
