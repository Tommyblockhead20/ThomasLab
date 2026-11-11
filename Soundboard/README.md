# Say it. — Soundboard

Standalone page at `/Soundboard/`. There is no homepage button or other homepage change for this page. Commit and push this folder, including `audio/`, to publish it through the existing Pages workflow. No build is needed for this page.

## Voice

The 29 included MP3s were generated with Microsoft's `en-US-AriaNeural` voice using [edge-tts](https://github.com/rany2/edge-tts). Visitors play the saved files directly: no speech-synthesis browser voice, runtime service, API key, external font, or new website dependency is used. `clips.json` records each spoken text and its generation settings. IDK says “I don't know,” and OK says “Okay.” Alexis spelling was confirmed by the user.

Thomas and Zion each have a normal voice and a louder calling variant. The latter use a brighter pitch, faster delivery, and increased generated volume; they are labeled “Louder call,” not represented as an acted shouting performance. The clips use a stock synthetic voice.

All requested phrases are included: Thomas, Thomas!, Zion, Zion!, Alexis, Yes, No, Maybe, IDK, Good, OK, Bad, Wait, 1–9, Thirsty, Hungry, Love you, You are a cutie, Poop, On, and Bed.

## Interaction

- Each new tap replaces the current sound, including repeated taps of the same button.
- Stop and Escape halt playback. Keyboard Enter/Space work on the phrase buttons.
- Volume is saved only when browser storage is available; unavailable storage does not prevent playback. Device volume and mute settings still apply.
- Short button feedback and playback indicators respect reduced-motion preferences.
- A playback/download error is shown in the status bar and can be retried by tapping again.

## Verification

All 29 files loaded and decoded successfully in the browser; each contains a non-silent signal. The louder Thomas/Zion variants had higher measured RMS and peak levels than their normal counterparts. Checked normal playback, rapid replacement, Stop, Escape, keyboard activation, volume-display feedback, and desktop/390 px layouts. All phrase buttons exceeded 40 × 44 px in the phone check, with no horizontal page overflow. The temporary audio-check page was removed.

Physical phone playback has not been checked on a real device. No existing homepage, project, or publishing configuration was changed for this addition.
