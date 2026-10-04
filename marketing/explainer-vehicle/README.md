# Vehicle landing-page explainer

The 46-second "The buyer skims a checklist" explainer embedded on `/vehicles`, built with
HyperFrames. It has the same structure, timing and music as `../explainer`. The two photos were
generated with `google/gemini-3-pro-image` via OpenRouter and show no make, badge or plate. No
third-party footage is used. Keep car brands out of this video: a generated car can't match a real
model.

```sh
npx hyperframes check
npx hyperframes render --quality high --output renders/explainer-vehicle.mp4
ffmpeg -i renders/explainer-vehicle.mp4 -c:v libx264 -preset slow -crf 25 -maxrate 3M -bufsize 6M \
  -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart ../../public/marketing/explainer-vehicle.mp4
```

`assets/audio/music.mp3` is the same untracked bed as `../explainer` (audio files are kept out of
git). Copy it over or regenerate it to re-render.
