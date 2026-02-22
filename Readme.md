# ScaleFX-js

ScaleFX pixel art upcaler, on the CPU (not a shader!), in Javascript / Typescript.

![Blooguard](https://github.com/chrishulbert/cpu-scalefx-rs/raw/main/readme/Blooguard.png)

![Blooguard](https://github.com/chrishulbert/cpu-scalefx-rs/raw/main/readme/Blooguard.big.png)

This is a Typescript port of my Rust port of the original shader, thanks to Sp00kyFox, 2016. There's also a Javascript port here too, it's ports all the way down!

Please check out the Rust version here: [github.com/chrishulbert/scalefx-rs](https://github.com/chrishulbert/scalefx-rs).

## How to give it a try

Prerequisite: Have `pnpm` installed. It's a more secure version of `npm`.

Simply run `make run`. It'll run `index.mts` which will upscale an image and render it to the terminal using ANSI colour codes.

## How to use this in your code

Simply copy `scalefx.mts` (or if you can't use Typescript, use `scalefx.mjs`) into your project, and call `ScaleFX.scale3x(sfxImage)`, where sfxImage has width, height, and pixels being a Uint32Array of 0xRRGGBBAA pixels. See `docs/index.html` folder for an example!

## References

* https://docs.libretro.com/development/shader/slang-shaders/#pragma-parameter
