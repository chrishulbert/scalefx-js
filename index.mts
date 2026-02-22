import * as ScaleFX from './scalefx.mts';

const LOGO = `
\x1b[31m  ██████ \x1b[33m ▄████▄  \x1b[32m ▄▄▄      \x1b[36m ██▓    \x1b[34m▓█████ \x1b[35m  █████▒\x1b[31m▒██   ██▒
\x1b[31m▒██    ▒ \x1b[33m▒██▀ ▀█  \x1b[32m▒████▄    \x1b[36m▓██▒    \x1b[34m▓█   ▀ \x1b[35m▓██   ▒ \x1b[31m▒▒ █ █ ▒░
\x1b[31m░ ▓██▄   \x1b[33m▒▓█    ▄ \x1b[32m▒██  ▀█▄  \x1b[36m▒██░    \x1b[34m▒███   \x1b[35m▒████ ░ \x1b[31m░░  █   ░
\x1b[31m  ▒   ██▒\x1b[33m▒▓▓▄ ▄██▒\x1b[32m░██▄▄▄▄██ \x1b[36m▒██░    \x1b[34m▒▓█  ▄ \x1b[35m░▓█▒  ░ \x1b[31m ░ █ █ ▒ 
\x1b[31m▒██████▒▒\x1b[33m▒ ▓███▀ ░\x1b[32m ▓█   ▓██▒\x1b[36m░██████▒\x1b[34m░▒████▒\x1b[35m░▒█░    \x1b[31m▒██▒ ▒██▒
\x1b[31m▒ ▒▓▒ ▒ ░\x1b[33m░ ░▒ ▒  ░\x1b[32m ▒▒   ▓▒█░\x1b[36m░ ▒░▓  ░\x1b[34m░░ ▒░ ░\x1b[35m ▒ ░    \x1b[31m▒▒ ░ ░▓ ░
\x1b[31m░ ░▒  ░ ░\x1b[33m  ░  ▒   \x1b[32m  ▒   ▒▒ ░\x1b[36m░ ░ ▒  ░\x1b[34m ░ ░  ░\x1b[35m ░      \x1b[31m░░   ░▒ ░
\x1b[31m░  ░  ░  \x1b[33m░        \x1b[32m  ░   ▒   \x1b[36m  ░ ░   \x1b[34m   ░   \x1b[35m ░ ░    \x1b[31m ░    ░  
\x1b[31m      ░  \x1b[33m░ ░      \x1b[32m      ░  ░\x1b[36m    ░  ░\x1b[34m   ░  ░\x1b[35m        \x1b[31m ░    ░  
\x1b[31m         \x1b[33m░\x1b[0m
`;

function main() {
    console.log(LOGO.trim());

    // Make a sample image:
    const W = 0xffefe4ff; // White-ish.
    const R = 0xfb0351ff; // Red.
    const B = 0x000000ff; // Black.
    const L = 0x14dd59ff; // Light green.
    const G = 0x008641ff; // Dark green.
    const C = 0x00000000; // Clear.
    const watermelon: ScaleFX.Image = {
        width: 8,
        height: 6,
        pixels: new Uint32Array([
            W,R,B,R,R,R,R,W,
            W,R,R,R,R,B,R,W,
            W,R,R,B,R,R,R,W,
            L,W,R,R,R,R,W,L,
            G,L,W,W,W,W,L,G,
            C,G,L,L,L,L,G,C,
        ]),
    };

    console.log("-=[ Original ]=-");
    draw(watermelon);

    console.log("-=[ ScaleFX upscale 3x ]=-");
    const big = ScaleFX.scale3x(watermelon);
    draw(big);

    console.log("-=[ ScaleFX upscale 9x ]=-");
    const bigger = ScaleFX.scale3x(big);
    draw(bigger);
}

// Draw the image as ANSI art.
function draw(image: ScaleFX.Image) {
    for (let y=0; y<image.height; y++) {
        let line = '';
        for (let x=0; x<image.width; x++) {
            let i = y * image.width + x;
            let p = image.pixels[i];
            let r = p >>> 24; // >>> is an unsigned shift, necessary for the highest bits.
            let g = (p >> 16) & 0xff;
            let b = (p >> 8) & 0xff;
            let a = p & 0xff;
            let is_clear = a < 0x80;
            if (is_clear) {
                line += '\x1b[30m··';
            } else {
                line += `\x1b[38;2;${r};${g};${b}m██`;
            }
        }
        line += `\x1b[0m`;
        console.log(line);
    }
}

main();
