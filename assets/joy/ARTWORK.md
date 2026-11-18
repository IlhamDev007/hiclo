# Joy artwork credits and production notes

## Spider-Man

- Source and credit: PNGimg.com, https://pngimg.com/image/28890 . The source does not identify an individual artist.
- Original file: https://pngimg.com/uploads/spider_man/spider_man_PNG8.png
- Source-listed license: Creative Commons Attribution–NonCommercial 4.0 International, https://creativecommons.org/licenses/by-nc/4.0/
- Local asset: `spider-man.png`. Natural upside-down hanging pose, resampled to a maximum dimension of 512 pixels; transparency retained. It replaces the previous reaching-pose cutout from https://pngimg.com/image/28976 .
- The asset is subject to the source's noncommercial restriction. The source license statement does not establish ownership of underlying Marvel character rights. Replace it with appropriately cleared artwork before commercial distribution.

## Generated artwork

Created with the built-in imagegen tool and resampled to a maximum dimension of 512 pixels with alpha preserved. Original generations remain in the generated-image directory. Current project assets: `hammer.png` and `princess.png`. Emerald Princess artwork has been removed from this project and is not packaged.

The tool rejected the initial Spider-Man generation attempts and the later hanging-pose edit. No CLI/API fallback was used; that fallback requires an explicitly configured OpenAI API key. The current hanging-pose Spider-Man instead uses the attributed source above.

The v1.4 attempted edit prompt was: “Edit this Spider-Man artwork into a complete natural hanging pose for a browser charm. Preserve the recognizable classic red-and-blue webbed suit, mask, and realistic material detail. Full body visible, hanging upright by both hands held together directly above the head at the top center, knees softly bent and feet relaxed beneath him, gravity-consistent silhouette. Both hands touch at the exact top center attachment point. Front view. Entire character isolated on genuine transparent background, no rope, no text, no ground, no extra characters. Premium detailed 3D collectible finish. Minimal transparent margins; keep the entire body and hands uncropped.” No generated output from this rejected request is included.

### Final prompts

**Hammer:** Use case: product-mockup. Asset: a single browser hanging charm cutout. Subject: Thor's Hammer Mjolnir, realistic miniature collectible forged silver metal hammer with broad rectangular engraved head, brown leather wrapped handle pointing upward so it hangs from the handle, dark beveled corners, full object. Realistic premium 3D product rendering, soft studio lighting, convincing physical materials, straight-on camera, centered isolated object fully visible, narrow vertical composition with only small transparent margins around object. Genuinely transparent background, no environment, no text, no watermark, no rope or chain, no ground shadow. The top attachment point should be centered. One object only.

**Moonlight Princess:** Use case: product-mockup. Asset: a single browser hanging charm cutout. Subject: An original fairytale princess collectible charm, full body, elegant lavender and pale rose ball gown, gold tiara, long chestnut hair, warm expressive face, detailed sculpted fabric and metallic accents, no likeness to a real person. Realistic premium 3D product rendering, soft studio lighting, convincing physical materials, straight-on camera, centered isolated object fully visible, narrow vertical composition with only small transparent margins around object. Genuinely transparent background, no environment, no text, no watermark, no rope or chain, no ground shadow. The top attachment point should be centered. One object only.

Hooks, rope materials, body choreography, lightning, web shimmer, and stardust are rendered by project code in `joy-art.js`; they are not baked into the PNGs. They run only for the three built-in presets. Uploads preserve their own artwork and have ordinary rope motion only.

## Inspiration

Hangly: https://www.sharancreatedthis.in/products/hangly . No Hangly code or artwork is included. Joy is an independent browser-page implementation, not affiliated with Hangly or character rights holders.
