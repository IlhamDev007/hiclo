# Hiclo visual identity

The cloud silhouette shelters a lowercase **h**, with a smiling inner curve and a warm sun accent. The new interface uses this playful mark with restrained typography, clean surfaces, and consistent component cards.

## Palette

- Primary indigo: `#6654E8`
- Soft coral: `#EE7B68`
- Warm gold: `#FFCA62`
- Light background: `#F6F7FD`
- Light text: `#25253F`
- Dark background: `#151624`
- Dark accent: `#B0A0FF`
- Dark text: `#F0EFFB`

Theme tokens are defined once in `popup.css` and shared with the Joy interface. Semantic success/warning/error colors are separate from the primary brand palette. User-selected rope colors and uploaded artwork retain their own colors.

## Assets

- `hiclo-mark-source.png`: transparent source artwork from the built-in imagegen tool.
- `hiclo-mark.png`: optimized 256 px popup mark.
- `../../icons/16.png`, `32.png`, `48.png`, `128.png`: browser extension icons, resampled with alpha preserved.

The original cloud/h identity was created in the earlier Hiclo branding task. Its source generation is preserved in the generated-image library. This update recolors that design for the indigo/gold interface; it does not change any feature's storage namespace or behavior.

## Final image-edit prompt

“Recolor this exact Hiclo brand emblem for its refreshed browser extension identity. Preserve precisely the cloud silhouette, the negative-space lowercase h, the smiling inner curve, and the golden sun position and proportions. Replace every teal/green area with vibrant indigo #6654E8. Keep the sun warm gold #FFCA62. Flat crisp uniform fills, genuinely transparent background, no shadows, no gradient, no texture, no new shapes, no added text. One large centered icon only, same square composition. This is a palette-only logo update, not a redesign.”

The built-in imagegen tool was used; no API/CLI fallback or runtime image-generation dependency is included. Production PNGs are bitmap assets. The name and visual concept have not undergone trademark clearance.
