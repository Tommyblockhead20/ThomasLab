# Say it. — Soundboard v2

Standalone page at `/Soundboard/`. There is no homepage button or other homepage change for this page. Commit and push this folder, including `audio/`, to publish it through the existing Pages workflow. No build is needed for this page.

## Voice

The 51 included MP3s were generated with Microsoft's `en-US-AriaNeural` voice using [edge-tts](https://github.com/rany2/edge-tts). Visitors play the saved files directly: no speech-synthesis browser voice, runtime service, API key, external font, or new website dependency is used. `clips.json` records each spoken text and its generation settings. IDK says “I don't know,” and OK says “Okay.” Alexis spelling was confirmed by the user.

Thomas and Zion each have a normal voice and a louder calling variant. The latter use a brighter pitch, faster delivery, and increased generated volume; they are labeled “Louder call,” not represented as an acted shouting performance. The clips use a stock synthetic voice.

Version 2 adds 22 buttons: Bye, Welcome home, Kitchen, Bedroom, Office, Bathroom, Living room, Hug, Cuddle, Kiss, Fast, Slow, Now, Watch, Clean, Wahoo!, Yay!, Up, Down, Left, Right, and Behind. Now and Watch are separate buttons, as confirmed by the user. The original 29 buttons and their audio remain intact.

Groups are attention/names, quick answers, greetings and cheers, directions, rooms, affection, needs, pace and timing, miscellaneous words, and numbers. Playback controls stay accessible while scrolling.

## Downloads

- `/downloads/soundboard-v1.zip`: the original 29-button version, saved before editing.
- `/downloads/soundboard-v2.zip`: this expanded 51-button version.

Each ZIP includes its own `Soundboard` folder with HTML, styling, player code, manifest, and all voice clips. Extract the entire ZIP, then open `Soundboard/index.html`. No installation is needed. Archives are self-contained and do not reference each other.

## Interaction

- Each new tap replaces the current sound, including repeated taps of the same button.
- Stop and Escape halt playback. Keyboard Enter/Space work on the phrase buttons.
- Volume is saved only when browser storage is available; unavailable storage does not prevent playback. Device volume and mute settings still apply.
- Short button feedback and playback indicators respect reduced-motion preferences.
- A playback/download error is shown in the status bar and can be retried by tapping again.

## Verification

All 51 files loaded and decoded successfully in the browser; each contains a non-silent signal. The louder Thomas/Zion variants had higher measured RMS and peak levels than their normal counterparts. Checked normal playback, rapid replacement, Stop, Escape, keyboard activation, volume-display feedback, and desktop/390 px layouts. All phrase buttons met 44 × 44 px in the v2 phone check, with no horizontal page overflow. The temporary audio-check page was removed.

Physical phone playback has not been checked on a real device. No existing homepage, project, or publishing configuration was changed for this addition.
