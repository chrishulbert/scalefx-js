// Typescript port of my Rust port of the ScaleFX shader.
// Variable names have been shortened as an optimisation, perhaps it'll help.
// For more descriptive names, see the Rust version: https://github.com/chrishulbert/scalefx-rs
// Also see the original shader: https://github.com/libretro/slang-shaders/tree/master/edge-smoothing/scalefx/shaders
// Variables are often named in this file as per this grid:
// A B C (Pixels above the current pixel)
// D E F (E is the current pixel)
// G H I (pixels below)
export function scale3x(image) {
    const intermediate = add_transparent_border(image);
    calculate_distances(intermediate);
    calculate_corner_strengths(intermediate);
    resolve_corner_configurations(intermediate);
    determine_edge_levels(intermediate);
    const scaled = scale_subpixels(intermediate);
    const sans_border = remove_transparent_border(scaled);
    return sans_border;
}
const THRESHOLD = 0.5; // Min 0.01; max: 1; step: 0.01
const IS_FILTER_AA_ENABLED = true;
const FILTER_CORNERS = true; // SFX_SCN in the shader.
// Make an intermediate pixel from an rgba value.
function p(p) {
    const EMPTY_V4 = { x: 0, y: 0, z: 0, w: 0 };
    const EMPTY_VB4 = { x: false, y: false, z: false, w: false };
    return {
        p,
        dx: 0,
        dy: 0,
        dz: 0,
        dw: 0,
        sx: 0,
        sy: 0,
        sz: 0,
        sw: 0,
        r: EMPTY_VB4,
        h: EMPTY_VB4,
        v: EMPTY_VB4,
        o: EMPTY_VB4,
        c: EMPTY_V4,
        m: EMPTY_V4,
    };
}
const EMPTY_PIXEL = p(0);
// Adds a border to make ScaleFX work better for images with some transparency.
function add_transparent_border(image) {
    const new_width = image.width + 2;
    const new_height = image.height + 2;
    const out = [];
    for (let x = 0; x < new_width; x++) {
        out.push(p(0));
    } // Top row.
    for (let y = 0; y < image.height; y++) { // Loop the original rows.
        out.push(p(0));
        const index = y * image.width;
        const row = image.pixels.slice(index, index + image.width);
        const pixels = Array.from(row).map(p);
        out.push(...pixels);
        out.push(p(0));
    }
    for (let x = 0; x < new_width; x++) {
        out.push(p(0));
    } // Bottom row.
    return {
        w: new_width,
        h: new_height,
        p: out,
    };
}
function remove_transparent_border(image) {
    const new_width = image.width - 6;
    const new_height = image.height - 6;
    const out = new Uint32Array(new_width * new_height);
    for (let y = 0; y < new_height; y++) {
        const index = (y + 3) * image.width + 3;
        const mid = image.pixels.slice(index, index + new_width);
        out.set(mid, y * new_width);
    }
    return {
        width: new_width,
        height: new_height,
        pixels: out,
    };
}
function calculate_distances(m) {
    // Determine the human-perceived difference between two colours.
    // For humanity's sake, r and g and b are weighted differently.
    // https://www.compuphase.com/cmetric.htm
    // Returns 0 for same colours; 1 for white-black/transparent.
    function d(x, y) {
        const xr = x >>> 24; // >>> is an unsigned shift, necessary for the highest bits.
        const xg = (x >> 16) & 0xff;
        const xb = (x >> 8) & 0xff;
        const xa = x & 0xff;
        const yr = y >>> 24;
        const yg = (y >> 16) & 0xff;
        const yb = (y >> 8) & 0xff;
        const ya = y & 0xff;
        if (xa < 0x80 && ya < 0x80) {
            return 0.;
        } // Transparent vs transparent counts as the same.
        if (xa < 0x80 || ya < 0x80) {
            return 1.;
        } // Colour -> transparent counts as different.
        const rm = (xr + yr) / 2; // Red mean.
        const r = Math.abs(xr - yr);
        const g = Math.abs(xg - yg);
        const b = Math.abs(xb - yb);
        if (r == 0 && g == 0 && b == 0) {
            return 0.;
        } // Shortcut when all same.
        return Math.sqrt(((((512 + rm) * r * r) >> 8) + 4 * g * g + (((767 - rm) * b * b) >> 8))) / 765.;
    }
    for (let y = 0; y < m.h; y++) {
        for (let x = 0; x < m.w; x++) {
            const n = y * m.w + x; // iNdex.
            const a = (y == 0 || x == 0) ? 0 : m.p[n - m.w - 1].p;
            const b = y == 0 ? 0 : m.p[n - m.w].p;
            const c = (y == 0 || x == m.w - 1) ? 0 : m.p[n - m.w + 1].p;
            const e = m.p[n];
            const f = x >= m.w - 1 ? 0 : m.p[n + 1].p;
            e.dx = d(e.p, a);
            e.dy = d(e.p, b);
            e.dz = d(e.p, c);
            e.dw = d(e.p, f);
        }
    }
    return m;
}
function calculate_corner_strengths(m) {
    function s(d, ax, ay, bx, by) {
        let f = ax - ay; // Diff.
        let w1 = Math.max(THRESHOLD - d, 0) / THRESHOLD; // Weight 1.
        let g = Math.min(ax, bx) + ax > Math.min(ay, by) + ay; // Greater?
        let gf = g ? f : -f;
        let wt = (1. - d) + gf; // Weight 2 temp.
        let w2 = Math.max(Math.min(wt, 1), 0); // Weight 2.
        return (IS_FILTER_AA_ENABLED || 2. * d < ax + ay) ? w1 * w2 * ax * ay : 0;
    }
    let t = EMPTY_PIXEL;
    for (let y = 0; y < m.h; y++) {
        for (let x = 0; x < m.w; x++) {
            const n = y * m.w + x; // iNdex.
            const a = (y == 0 || x == 0) ? t : m.p[n - m.w - 1];
            const b = y == 0 ? t : m.p[n - m.w];
            const d = x == 0 ? t : m.p[n - 1];
            const e = m.p[n];
            const f = x == m.w - 1 ? t : m.p[n + 1];
            const g = (x == 0 || y == m.h - 1) ? t : m.p[n + m.w - 1];
            const h = y == m.h - 1 ? t : m.p[n + m.w];
            const i = (x == m.w - 1 || y == m.h - 1) ? t : m.p[n + m.w + 1];
            e.sx = s(d.dz, d.dw, e.dy, a.dw, d.dy);
            e.sy = s(f.dx, e.dw, e.dy, b.dw, f.dy);
            e.sz = s(h.dz, e.dw, h.dy, h.dw, i.dy);
            e.sw = s(h.dx, d.dw, h.dy, g.dw, g.dy);
        }
    }
    return m;
}
function resolve_corner_configurations(m) {
    // Corner dominance at junction:
    function cd(x, y, z, w) {
        return v4s(v4m(v4(x.y, y.y, z.y, w.y), 2), v4a(v4(x.x, y.x, z.x, w.x), v4(x.z, y.z, z.z, w.z)));
    }
    // Necessary but not sufficient junction condition for orthogonal edges. Named 'clear' in the shader.
    function cl(c, a, b) {
        return (c.x >= Math.max(Math.min(a.x, a.y), Math.min(b.x, b.y)) && c.y >= Math.max(Math.min(a.x, b.y), Math.min(b.x, a.y))) ? 1 : 0;
    }
    let t = EMPTY_PIXEL;
    for (let y = 0; y < m.h; y++) {
        for (let x = 0; x < m.w; x++) {
            const n = y * m.w + x; // iNdex.
            // Get the neighbouring pixels, returning transparent if they're out of bounds.
            const it = y == 0; // Is top?
            const il = x == 0; // Left.
            const ib = y >= m.h - 1; // Bottom.
            const ir = x >= m.w - 1; // Right.
            const a = (it || il) ? t : m.p[n - m.w - 1];
            const b = it ? t : m.p[n - m.w];
            const c = (it || ir) ? t : m.p[n - m.w + 1];
            const d = il ? t : m.p[n - 1];
            const e = m.p[n];
            const f = ir ? t : m.p[n + 1];
            const g = (ib || il) ? t : m.p[n + m.w - 1];
            const h = ib ? t : m.p[n + m.w];
            const i = (ib || ir) ? t : m.p[n + m.w + 1];
            // Strength junctions:
            const jsx = v4(a.sz, b.sw, e.sx, d.sy);
            const jsy = v4(b.sz, c.sw, f.sx, e.sy);
            const jsz = v4(e.sz, f.sw, i.sx, h.sy);
            const jsw = v4(d.sz, e.sw, h.sx, g.sy);
            // Dominance junctions:
            const jdx = cd(v3(a.sy, a.sz, a.sw), v3(b.sz, b.sw, b.sx), v3(e.sw, e.sx, e.sy), v3(d.sx, d.sy, d.sz));
            const jdy = cd(v3(b.sy, b.sz, b.sw), v3(c.sz, c.sw, c.sx), v3(f.sw, f.sx, f.sy), v3(e.sx, e.sy, e.sz));
            const jdz = cd(v3(e.sy, e.sz, e.sw), v3(f.sz, f.sw, f.sx), v3(i.sw, i.sx, i.sy), v3(h.sx, h.sy, h.sz));
            const jdw = cd(v3(d.sy, d.sz, d.sw), v3(e.sz, e.sw, e.sx), v3(h.sw, h.sx, h.sy), v3(g.sx, g.sy, g.sz));
            // Majority vote for ambiguous dominance junctions:
            const z = v4(0, 0, 0, 0);
            const jx = v4m1(v4mv(v4ge(jdx, z), v4a(v4mv(v4leq(yzwx(jdx), z), v4leq(wxyz(jdx), z)), v4ge(v4a(jdx, zwxy(jdx)), v4a(yzwx(jdx), wxyz(jdx))))));
            const jy = v4m1(v4mv(v4ge(jdy, z), v4a(v4mv(v4leq(yzwx(jdy), z), v4leq(wxyz(jdy), z)), v4ge(v4a(jdy, zwxy(jdy)), v4a(yzwx(jdy), wxyz(jdy))))));
            const jz = v4m1(v4mv(v4ge(jdz, z), v4a(v4mv(v4leq(yzwx(jdz), z), v4leq(wxyz(jdz), z)), v4ge(v4a(jdz, zwxy(jdz)), v4a(yzwx(jdz), wxyz(jdz))))));
            const jw = v4m1(v4mv(v4ge(jdw, z), v4a(v4mv(v4leq(yzwx(jdw), z), v4leq(wxyz(jdw), z)), v4ge(v4a(jdw, zwxy(jdw)), v4a(yzwx(jdw), wxyz(jdw))))));
            // Inject strength without creating new contradictions:
            const rx = Math.min(jx.z + (1 - jx.y) * (1 - jx.w) * nge(jsx.z, 0) * (jx.x + nge(jsx.x + jsx.z, jsx.y + jsx.w)), 1);
            const ry = Math.min(jy.w + (1 - jy.z) * (1 - jy.x) * nge(jsy.w, 0) * (jy.y + nge(jsy.y + jsy.w, jsy.x + jsy.z)), 1);
            const rz = Math.min(jz.x + (1 - jz.w) * (1 - jz.y) * nge(jsz.x, 0) * (jz.z + nge(jsz.x + jsz.z, jsz.y + jsz.w)), 1);
            const rw = Math.min(jw.y + (1 - jw.x) * (1 - jw.z) * nge(jsw.y, 0) * (jw.w + nge(jsw.y + jsw.w, jsw.x + jsw.z)), 1);
            const rt = v4(rx, ry, rz, rw); // Res temp value.
            // Single pixel & end of line detection:
            const res = v4m1(v4mv(rt, v4a(v4(jx.z, jy.w, jz.x, jw.y), v4n(v4mv(wxyz(rt), yzwx(rt))))));
            // Output:
            const cx = cl(v2(d.dz, e.dx), v2(d.dw, e.dy), v2(a.dw, d.dy));
            const cy = cl(v2(f.dx, e.dz), v2(e.dw, e.dy), v2(b.dw, f.dy));
            const cz = cl(v2(h.dz, i.dx), v2(e.dw, h.dy), v2(h.dw, i.dy));
            const cw = cl(v2(h.dx, g.dz), v2(d.dw, h.dy), v2(g.dw, g.dy));
            const co = v4(cx, cy, cz, cw);
            const ho = v4(Math.min(d.dw, a.dw), Math.min(e.dw, b.dw), Math.min(e.dw, h.dw), Math.min(d.dw, g.dw));
            const v = v4(Math.min(e.dy, d.dy), Math.min(e.dy, f.dy), Math.min(h.dy, i.dy), Math.min(h.dy, g.dy));
            e.r = vb4v(res);
            e.h = vb4v(v4mv(v4le(ho, v), co));
            e.v = vb4v(v4mv(v4ge(ho, v), co));
            e.o = vb4v(v4ge(v4a(ho, v4(d.dw, e.dw, e.dw, d.dw)), v4a(v, v4(e.dy, e.dy, h.dy, h.dy))));
        }
    }
    return m;
}
// Determines which edge level is present and prepares tags for subpixel output in the final pass.
function determine_edge_levels(m) {
    let t = EMPTY_PIXEL;
    for (let y = 0; y < m.h; y++) {
        for (let x = 0; x < m.w; x++) {
            // Get neighbours:
            const n = y * m.w + x; // iNdex.
            const b1 = y <= 2 ? t : m.p[n - m.w * 3]; // 2 extra pixels out.
            const b0 = y <= 1 ? t : m.p[n - m.w * 2]; // Extra pixel out.
            const b = y <= 0 ? t : m.p[n - m.w];
            const d = x <= 0 ? t : m.p[n - 1];
            const d0 = x <= 1 ? t : m.p[n - 2];
            const d1 = x <= 2 ? t : m.p[n - 3];
            const e = m.p[n];
            const f = x + 1 >= m.w ? t : m.p[n + 1];
            const f0 = x + 2 >= m.w ? t : m.p[n + 2];
            const f1 = x + 3 >= m.w ? t : m.p[n + 3];
            const h = y + 1 >= m.h ? t : m.p[n + m.w];
            const h0 = y + 2 >= m.h ? t : m.p[n + m.w * 2];
            const h1 = y + 3 >= m.h ? t : m.p[n + m.w * 3];
            // Extract data:            
            const ec = e.r;
            const eh = e.h;
            const ev = e.v;
            const eo = e.o;
            const dc = d.r;
            const dh = d.h;
            const dr = d.o;
            const d0c = d0.r;
            const d0h = d0.h;
            const d1h = d1.h;
            const fc = f.r;
            const fh = f.h;
            const fo = f.o;
            const f0c = f0.r;
            const f0h = f0.h;
            const f1h = f1.h;
            const bc = b.r;
            const bv = b.v;
            const bo = b.o;
            const b0c = b0.r;
            const b0v = b0.v;
            const b1v = b1.v;
            const hc = h.r;
            const hv = h.v;
            const ho = h.o;
            const h0c = h0.r;
            const h0v = h0.v;
            const h1v = h1.v;
            // Level 1 corners (horizontal, vertical):
            const lvl1x = ec.x && (dc.z || bc.z || FILTER_CORNERS);
            const lvl1y = ec.y && (fc.w || bc.w || FILTER_CORNERS);
            const lvl1z = ec.z && (fc.x || hc.x || FILTER_CORNERS);
            const lvl1w = ec.w && (dc.y || hc.y || FILTER_CORNERS);
            // Level 2 mid (left, right / up, down):
            const lvl2x = vb2((ec.x && eh.y) && dc.z, (ec.y && eh.x) && fc.w);
            const lvl2y = vb2((ec.y && ev.z) && bc.w, (ec.z && ev.y) && hc.x);
            const lvl2z = vb2((ec.w && eh.z) && dc.y, (ec.z && eh.w) && fc.x);
            const lvl2w = vb2((ec.x && ev.w) && bc.z, (ec.w && ev.x) && hc.y);
            // Level 3 corners (horizontal, vertical):
            const lvl3x = vb2(lvl2x.y && (dh.y && dh.x) && fh.z, lvl2w.y && (bv.w && bv.x) && hv.z);
            const lvl3y = vb2(lvl2x.x && (fh.x && fh.y) && dh.w, lvl2y.y && (bv.z && bv.y) && hv.w);
            const lvl3z = vb2(lvl2z.x && (fh.w && fh.z) && dh.x, lvl2y.x && (hv.y && hv.z) && bv.x);
            const lvl3w = vb2(lvl2z.y && (dh.z && dh.w) && fh.y, lvl2w.x && (hv.x && hv.w) && bv.y);
            // Level 4 corners (horizontal, vertical):
            const lvl4x = vb2((dc.x && dh.y && eh.x && eh.y && fh.x && fh.y) && (d0c.z && d0h.w), (bc.x && bv.w && ev.x && ev.w && hv.x && hv.w) && (b0c.z && b0v.y));
            const lvl4y = vb2((fc.y && fh.x && eh.y && eh.x && dh.y && dh.x) && (f0c.w && f0h.z), (bc.y && bv.z && ev.y && ev.z && hv.y && hv.z) && (b0c.w && b0v.x));
            const lvl4z = vb2((fc.z && fh.w && eh.z && eh.w && dh.z && dh.w) && (f0c.x && f0h.y), (hc.z && hv.y && ev.z && ev.y && bv.z && bv.y) && (h0c.x && h0v.w));
            const lvl4w = vb2((dc.w && dh.z && eh.w && eh.z && fh.w && fh.z) && (d0c.y && d0h.x), (hc.w && hv.x && ev.w && ev.x && bv.w && bv.x) && (h0c.y && h0v.z));
            // Level 5 mid (left, right / up, down):
            const lvl5x = vb2(lvl4x.x && (f0h.x && f0h.y) && (d1h.z && d1h.w), lvl4y.x && (d0h.y && d0h.x) && (f1h.w && f1h.z));
            const lvl5y = vb2(lvl4y.y && (h0v.y && h0v.z) && (b1v.w && b1v.x), lvl4z.y && (b0v.z && b0v.y) && (h1v.x && h1v.w));
            const lvl5z = vb2(lvl4w.x && (f0h.w && f0h.z) && (d1h.y && d1h.x), lvl4z.x && (d0h.z && d0h.w) && (f1h.x && f1h.y));
            const lvl5w = vb2(lvl4x.y && (h0v.x && h0v.w) && (b1v.z && b1v.y), lvl4w.y && (b0v.w && b0v.x) && (h1v.y && h1v.z));
            // Level 6 corners (horizontal, vertical):
            const lvl6x = vb2(lvl5x.y && (d1h.y && d1h.x), lvl5w.y && (b1v.w && b1v.x));
            const lvl6y = vb2(lvl5x.x && (f1h.x && f1h.y), lvl5y.y && (b1v.z && b1v.y));
            const lvl6z = vb2(lvl5z.x && (f1h.w && f1h.z), lvl5y.x && (h1v.y && h1v.z));
            const lvl6w = vb2(lvl5z.y && (d1h.z && d1h.w), lvl5w.x && (h1v.x && h1v.w));
            // Subpixels - 0 = E, 1 = D, 2 = D0, 3 = F, 4 = F0, 5 = B, 6 = B0, 7 = H, 8 = H0
            const crn_x = (lvl1x && eo.x || lvl3x.x && eo.y || lvl4x.x && dr.x || lvl6x.x && fo.y) ? 5 : ((lvl1x || lvl3x.y && !eo.w || lvl4x.y && !bo.x || lvl6x.y && !ho.w) ? 1 : (lvl3x.x ? 3 : (lvl3x.y ? 7 : (lvl4x.x ? 2 : (lvl4x.y ? 6 : (lvl6x.x ? 4 : (lvl6x.y ? 8 : 0)))))));
            const crn_y = (lvl1y && eo.y || lvl3y.x && eo.x || lvl4y.x && fo.y || lvl6y.x && dr.x) ? 5 : ((lvl1y || lvl3y.y && !eo.z || lvl4y.y && !bo.y || lvl6y.y && !ho.z) ? 3 : (lvl3y.x ? 1 : (lvl3y.y ? 7 : (lvl4y.x ? 4 : (lvl4y.y ? 6 : (lvl6y.x ? 2 : (lvl6y.y ? 8 : 0)))))));
            const crn_z = (lvl1z && eo.z || lvl3z.x && eo.w || lvl4z.x && fo.z || lvl6z.x && dr.w) ? 7 : ((lvl1z || lvl3z.y && !eo.y || lvl4z.y && !ho.z || lvl6z.y && !bo.y) ? 3 : (lvl3z.x ? 1 : (lvl3z.y ? 5 : (lvl4z.x ? 4 : (lvl4z.y ? 8 : (lvl6z.x ? 2 : (lvl6z.y ? 6 : 0)))))));
            const crn_w = (lvl1w && eo.w || lvl3w.x && eo.z || lvl4w.x && dr.w || lvl6w.x && fo.z) ? 7 : ((lvl1w || lvl3w.y && !eo.x || lvl4w.y && !ho.w || lvl6w.y && !bo.x) ? 1 : (lvl3w.x ? 3 : (lvl3w.y ? 5 : (lvl4w.x ? 2 : (lvl4w.y ? 8 : (lvl6w.x ? 4 : (lvl6w.y ? 6 : 0)))))));
            const mid_x = (lvl2x.x && eo.x || lvl2x.y && eo.y || lvl5x.x && dr.x || lvl5x.y && fo.y) ? 5 : (lvl2x.x ? 1 : (lvl2x.y ? 3 : (lvl5x.x ? 2 : (lvl5x.y ? 4 : ((ec.x && dc.z && ec.y && fc.w) ? (eo.x ? (eo.y ? 5 : 3) : 1) : 0)))));
            const mid_y = (lvl2y.x && !eo.y || lvl2y.y && !eo.z || lvl5y.x && !bo.y || lvl5y.y && !ho.z) ? 3 : (lvl2y.x ? 5 : (lvl2y.y ? 7 : (lvl5y.x ? 6 : (lvl5y.y ? 8 : ((ec.y && bc.w && ec.z && hc.x) ? (!eo.y ? (!eo.z ? 3 : 7) : 5) : 0)))));
            const mid_z = (lvl2z.x && eo.w || lvl2z.y && eo.z || lvl5z.x && dr.w || lvl5z.y && fo.z) ? 7 : (lvl2z.x ? 1 : (lvl2z.y ? 3 : (lvl5z.x ? 2 : (lvl5z.y ? 4 : ((ec.z && fc.x && ec.w && dc.y) ? (eo.z ? (eo.w ? 7 : 1) : 3) : 0)))));
            const mid_w = (lvl2w.x && !eo.x || lvl2w.y && !eo.w || lvl5w.x && !bo.x || lvl5w.y && !ho.w) ? 1 : (lvl2w.x ? 5 : (lvl2w.y ? 7 : (lvl5w.x ? 6 : (lvl5w.y ? 8 : ((ec.w && hc.y && ec.x && bc.z) ? (!eo.w ? (!eo.x ? 1 : 5) : 7) : 0)))));
            e.c = v4(crn_x, crn_y, crn_z, crn_w);
            e.m = v4(mid_x, mid_y, mid_z, mid_w);
        }
    }
    return m;
}
// Outputs subpixels based on previously calculated tags.
// This implements pass 4 from here:
// https://github.com/libretro/slang-shaders/blob/master/edge-smoothing/scalefx/shaders/scalefx-pass4.slang
function scale_subpixels(m) {
    const pixels = [];
    const row0 = [];
    const row1 = [];
    const row2 = [];
    for (let y = 0; y < m.h; y++) {
        row0.length = 0;
        row1.length = 0;
        row2.length = 0;
        for (let x = 0; x < m.w; x++) {
            let source = m.p[y * m.w + x];
            let mid = source.m;
            let crn = source.c;
            for (let spy = 0; spy < 3; spy++) { // Loop the subpixels.
                for (let spx = 0; spx < 3; spx++) {
                    // Figure out which tag to use for each subpixel:
                    let sp = 0;
                    if (spx === 0 && spy === 0) {
                        sp = crn.x;
                    }
                    else if (spx === 1 && spy === 0) {
                        sp = mid.x;
                    }
                    else if (spx === 2 && spy === 0) {
                        sp = crn.y;
                    }
                    else if (spx === 0 && spy === 1) {
                        sp = mid.w;
                    }
                    else if (spx === 1 && spy === 1) {
                        sp = 0;
                    }
                    else if (spx === 2 && spy === 1) {
                        sp = mid.y;
                    }
                    else if (spx === 0 && spy === 2) {
                        sp = crn.w;
                    }
                    else if (spx === 1 && spy === 2) {
                        sp = mid.z;
                    }
                    else if (spx === 2 && spy === 2) {
                        sp = crn.z;
                    }
                    // Convert from a tag to an output coordinate:
                    // Tag 0 = coordinate E, 1 = D, 2 = D0, 3 = F, 4 = F0, 5 = B, 6 = B0, 7 = H, 8 = H0.
                    // Grid:
                    //      B0
                    //      B
                    // D0 D E F F0
                    //      H
                    //      H0
                    let ox = 0;
                    let oy = 0;
                    if (sp == 0) {
                        ox = 0;
                        oy = 0;
                    }
                    else if (sp == 1) {
                        ox = -1;
                        oy = 0;
                    }
                    else if (sp == 2) {
                        ox = -2;
                        oy = 0;
                    }
                    else if (sp == 3) {
                        ox = 1;
                        oy = 0;
                    }
                    else if (sp == 4) {
                        ox = 2;
                        oy = 0;
                    }
                    else if (sp == 5) {
                        ox = 0;
                        oy = -1;
                    }
                    else if (sp == 6) {
                        ox = 0;
                        oy = -2;
                    }
                    else if (sp == 7) {
                        ox = 0;
                        oy = 1;
                    }
                    else if (sp == 8) {
                        ox = 0;
                        oy = 2;
                    }
                    // Get the colour from that coordinate.
                    const ax = x + ox;
                    const ay = y + oy;
                    const in_bounds = 0 <= x && x < m.w && 0 <= y && y < m.h;
                    const colour = in_bounds ? m.p[ay * m.w + ax].p : 0;
                    // Push it to the correct row.
                    if (spy == 0) {
                        row0.push(colour);
                    }
                    else if (spy == 1) {
                        row1.push(colour);
                    }
                    else {
                        row2.push(colour);
                    }
                }
            }
        }
        pixels.push(...row0);
        pixels.push(...row1);
        pixels.push(...row2);
    }
    return {
        width: m.w * 3,
        height: m.h * 3,
        pixels: new Uint32Array(pixels),
    };
}
function v2(x, y) {
    return { x, y };
}
;
function v3(x, y, z) {
    return { x, y, z };
}
;
function v4(x, y, z, w) {
    return { x, y, z, w };
}
;
function vb2(x, y) {
    return { x, y };
}
;
function vb4(x, y, z, w) {
    return { x, y, z, w };
}
;
function vb4v(v) {
    return { x: v.x > 0.5, y: v.y > 0.5, z: v.z > 0.5, w: v.w > 0.5 };
}
// Multiply by a number.
function v4m(v, a) {
    return { x: v.x * a, y: v.y * a, z: v.z * a, w: v.w * a };
}
// Multiply by another vec.
function v4mv(a, b) {
    return { x: a.x * b.x, y: a.y * b.y, z: a.z * b.z, w: a.w * b.w };
}
function v4a(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z, w: a.w + b.w };
}
function v4s(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z, w: a.w - b.w };
}
function wxyz(v) {
    return v4(v.w, v.x, v.y, v.z);
}
function yzwx(v) {
    return v4(v.y, v.z, v.w, v.x);
}
function zwxy(v) {
    return v4(v.z, v.w, v.x, v.y);
}
function v4ge(a, b) {
    return v4s(v4(1, 1, 1, 1), v4step(a, b));
}
function v4le(a, b) {
    return v4s(v4(1, 1, 1, 1), v4step(b, a));
}
function v4leq(a, b) {
    return v4step(a, b);
}
function v4step(e, x) {
    return {
        x: x.x < e.x ? 0 : 1,
        y: x.y < e.y ? 0 : 1,
        z: x.z < e.z ? 0 : 1,
        w: x.w < e.w ? 0 : 1,
    };
}
// Min vs 1.
function v4m1(v) {
    return {
        x: Math.min(v.x, 1),
        y: Math.min(v.y, 1),
        z: Math.min(v.z, 1),
        w: Math.min(v.w, 1),
    };
}
function nstep(e, x) {
    return x < e ? 0 : 1;
}
function nge(x, y) {
    return 1 - nstep(x, y);
}
function v4n(v) {
    return { x: 1 - v.x, y: 1 - v.y, z: 1 - v.z, w: 1 - v.w };
}
