# Landing-page explainer

The 46-second "Nobody reads the report" explainer embedded on the landing page, built with
HyperFrames. Images were generated with `google/gemini-3-pro-image` and the music bed with
`google/lyria-3-pro-preview` (both via OpenRouter); no third-party footage.

```sh
npx hyperframes check
npx hyperframes render --quality high --output renders/explainer.mp4
ffmpeg -i renders/explainer.mp4 -c:v libx264 -preset slow -crf 25 -maxrate 3M -bufsize 6M \
  -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart ../../public/marketing/explainer.mp4
```

`assets/audio/music.mp3` is not tracked (audio files are kept out of git); regenerate it or keep
a local copy to re-render.
