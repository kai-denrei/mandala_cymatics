# Architecture — procedural mandala system

## System overview

Five independent layers, composed top-down:

```
┌─────────────────────────────────────────┐
│  Grid layer                             │  thigtse 24-unit grid
│  w = W/24, brahma lines, diagonals      │
├─────────────────────────────────────────┤
│  Ring stack                             │  ordered list of typed rings
│  outside-in: fire, vajra, lotus, ...    │
├─────────────────────────────────────────┤
│  Motif library                          │  parametric drawing functions
│  star, crescent, lotus, vajra, ...      │
├─────────────────────────────────────────┤
│  Symmetry engine                        │  Cₙ rotation, optional Dₙ mirror
│  cardinal axes + diagonals              │
├─────────────────────────────────────────┤
│  Colour system                          │  Five Buddhas anchored to directions
│  east/south/west/north/centre           │
└─────────────────────────────────────────┘
```

Each layer is a pure module. The grid layer defines coordinates. The ring stack is data (a list of records). The motif library is functions on coordinates. The symmetry engine applies rotation/reflection. The colour system assigns hue per element.

## Grid layer

The traditional Tibetan thigtse grid is a 24×24 cell square. The canvas side `W` is divided into 24 equal units: `w = W/24`. All motifs are sized in multiples of `w`. The grid construction itself follows snapped chalk-string lines:

1. Find centre.
2. Snap vertical and horizontal lines through centre (the **brahma lines**).
3. Snap two diagonals.
4. Subdivide each quadrant into a 12×12 sub-grid.

In code:

```typescript
export interface Grid {
  W: number;          // canvas side in pixels
  w: number;          // unit cell = W/24
  cx: number;         // centre x
  cy: number;         // centre y
  brahma: { v: Line; h: Line };
  diagonals: { a: Line; b: Line };
}

export function makeGrid(W: number): Grid {
  const w = W / 24;
  const cx = W / 2;
  const cy = W / 2;
  return {
    W, w, cx, cy,
    brahma: {
      v: { x1: cx, y1: 0, x2: cx, y2: W },
      h: { x1: 0,  y1: cy, x2: W,  y2: cy },
    },
    diagonals: {
      a: { x1: 0, y1: 0, x2: W, y2: W },
      b: { x1: W, y1: 0, x2: 0, y2: W },
    },
  };
}
```

## Ring stack

A mandala is built outside-in. The canonical ordering, with default radii in units of `w`:

| # | Type            | Outer | Inner | Notes                                          |
|---|-----------------|-------|-------|------------------------------------------------|
| 1 | Ring of fire    | 12.2  | 11.0  | flame tongues, 5-colour alternation            |
| 2 | Vajra ring      | 11.0  | 9.5   | diamond / chevron pattern                      |
| 3 | Charnel grounds | 9.5   | 8.5   | optional, 8 ground scenes (v2)                 |
| 4 | Lotus ring      | 9.4   | 7.3   | 8 / 16 / 32 petals                             |
| 5 | Palace walls    | 7.0   | 6.5   | with 4 T-shaped gates at cardinals             |
| 6 | Courtyards      | 6.3   | 4.5   | nested square frames inside the palace         |
| 7 | Inner lotus     | 4.5   | 1.8   | smaller petal ring                             |
| 8 | Bindu (centre)  | 1.5   | 0     | central seed: deity, syllable, or symbol       |

The stack is just data:

```typescript
export type RingType =
  | 'fire' | 'vajra' | 'charnel'
  | 'lotus' | 'palace' | 'courtyards'
  | 'innerLotus' | 'bindu';

export interface Ring {
  type: RingType;
  rOuter: number;       // in units of w
  rInner: number;
  n?: number;           // rotational order (for symmetric motifs)
  paletteRole: 'fiveBuddhas' | 'walls' | 'centre' | 'accent';
}

export const DEFAULT_STACK: Ring[] = [
  { type: 'fire',        rOuter: 12.2, rInner: 11.0, n: 48, paletteRole: 'fiveBuddhas' },
  { type: 'vajra',       rOuter: 11.0, rInner:  9.5, n: 64, paletteRole: 'accent' },
  { type: 'lotus',       rOuter:  9.4, rInner:  7.3, n: 16, paletteRole: 'fiveBuddhas' },
  { type: 'palace',      rOuter:  7.0, rInner:  6.5,        paletteRole: 'walls' },
  { type: 'courtyards',  rOuter:  6.3, rInner:  4.5,        paletteRole: 'accent' },
  { type: 'innerLotus',  rOuter:  4.5, rInner:  1.8, n:  8, paletteRole: 'fiveBuddhas' },
  { type: 'bindu',       rOuter:  1.5, rInner:  0,          paletteRole: 'centre' },
];
```

## Motif math — from Zhang et al 2020

The Zhang paper gives closed-form parametric equations for the three central motifs used in Nyingma-school interior mandalas. These are the canonical reference.

### Star motif

`ns` isosceles triangles inscribed in a circle of radius `Rs`, connected by circular arcs of radius `r` between adjacent triangle bases.

Triangle vertex `Vᵢ`:
```
Vᵢ_x = Rs · cos((i − 1) · 2π/ns)
Vᵢ_y = Rs · sin((i − 1) · 2π/ns)
```

Connecting arc centre `Q`, at distance `d = |OQ|` from origin:
```
Q_x = d · cos(π/ns)
Q_y = d · sin(π/ns)
```

Arc geometry — given chord length `m = |AB|`:
```
α = arcsin(m / 2r)        // deviation angle
AB_x(θ) = Q_x + r · cos(θ + π/ns)
AB_y(θ) = Q_y + r · sin(θ + π/ns)
where θ ∈ [α, 2π − α]
```

Rotate `AB` around `O` by `2π/ns` to produce `ns − 1` additional arcs. Tunable parameters: `Rs, ns, d, r, m`.

### Crescent motif

Used in dakini mandalas. Large arc of radius `Rc` plus inverted T-shape below it. Seven key points `C₁..C₇`:

```
β = arccos(h₁ / Rc)       // deviation angle

C₁C₂(θ) = (Rc · sin(θ), −Rc · cos(θ)),   θ ∈ [β, π]
C₃ = (w₁,        −Rc · cos(β))
C₄ = (w₁,        −Rc · cos(β) − h₂)
C₅ = (w₁ + w₂,   −Rc · cos(β) − h₂)
C₆ = (w₁ + w₂,   −Rc)
C₇ = (0,         −Rc)
```

Connect `C₁C₂, C₃, C₄, C₅, C₆, C₇` to form the right half. Flip horizontally for the left. Tunable: `Rc, h₁, h₂, w₁, w₂`.

### Lotus flower motif

`np` petals, each restricted to a `1/np` slice of a unit circle. The lotus is modelled in two levels: a **skeletal** motif defining structure (outer and inner contour B-splines), and **decorative shapes** filling the petal.

The right half of a petal is defined by 9 control points in polar coordinates `(rᵢ, θᵢ)`, with relative angles `Δᵢ = |θ_ref − θᵢ|` (the 9th point is the reference). The B-spline through these 9 points traces the petal contour.

For `np > 4` petals, modify relative angles:
```
Δᵢ' = Δᵢ · 4 / np
```

The new control points `(rᵢ, θ_ref − Δᵢ')` define a narrower petal. Decorative shapes use a separate set of 31 control points spread over 4 sub-segments per half-petal, each interpolated with B-splines.

After modelling one petal, rotate around centre by `2π/np` for the remaining `np − 1` petals.

Tunable: `Rf` (circumscribed radius), `np` (petal count: typically 4, 8, 10, 16), control-point arrays (a separate concern — can be stored as canonical or per-style data).

### Other motifs (not from Zhang)

The square palace, vajra ring, fire ring, and gate (torana) are not directly parameterized in Zhang's paper but can be constructed from straightforward geometry. The prototypes in `prototypes/` include working implementations of each. Specifically:

- **Fire ring** — 40-48 flame tongues placed around the perimeter; each tongue is a cubic Bezier from base-left to apex to base-right, with the apex pulled slightly outward. Five-colour alternation following the Five Buddhas palette.
- **Vajra ring** — alternating triangles pointing outward / inward, packed densely (~60 per turn). Two-colour alternation.
- **Palace** — square with four T-shaped protrusions at cardinals (top/right/bottom/left). The T has a vertical stem (the gate proper) and a horizontal cap (the torana roof).
- **Bindu** — concentric circles at the centre with the innermost deity-colour disc.

## Parameter space (the sliders)

Top-level parameters that drive the entire render:

```typescript
export interface MandalaParams {
  W: number;                                          // canvas side
  symmetryOrder: 4 | 8 | 16 | 32;                     // primary rotational order
  ringStack: Ring[];                                  // which rings, in what order
  palette: PaletteName;                               // five Buddhas / earth / mono / etc
  hueRotation: number;                                // 0-360, applied to palette
  complexity: 1 | 2 | 3 | 4 | 5;                      // sub-motif detail per ring
  authenticity: number;                               // 0-1, blend factor
                                                      // 0 = strict Zhang proportions
                                                      // 1 = free perturbation
  seed: number;                                       // for perturbation randomness
  showGrid: boolean;                                  // overlay the thigtse construction lines
  bgColor: string;
}
```

Per-ring overrides:

```typescript
export interface RingOverrides {
  petals?: number;
  colors?: string[];                                  // override default palette assignment
  customRadii?: { rOuter: number; rInner: number };
}
```

## Symmetry engine

Most rings use the same rotational order `n`. The symmetry engine applies `Cₙ` rotation to a base motif:

```typescript
export function applyCyclicSymmetry(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  n: number,
  drawBase: (i: number) => void,
): void {
  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i / n) * Math.PI * 2);
    drawBase(i);
    ctx.restore();
  }
}
```

For dihedral `Dₙ` (with mirror reflections), wrap each `drawBase` call with a mirrored second pass.

## Colour system

The Five Buddhas palette is anchored to the four cardinal directions plus centre:

| Direction | Buddha           | Colour              | Hex       |
|-----------|------------------|---------------------|-----------|
| East      | Vairocana        | White / off-white   | `#F2EBD8` |
| South     | Ratnasambhava    | Yellow              | `#E8B83D` |
| West      | Amitabha         | Red                 | `#C73A2A` |
| North     | Amoghasiddhi     | Green               | `#2E7D5C` |
| Centre    | Akshobhya        | Blue                | `#2D4A8C` |

Other palettes are rotations or substitutions:

```typescript
export const PALETTES = {
  fiveBuddhas: ['#F2EBD8', '#E8B83D', '#C73A2A', '#2E7D5C', '#2D4A8C'],
  earth:       ['#E8D5B7', '#C19A6B', '#8B4513', '#556B2F', '#2F4F4F'],
  indigoGold:  ['#F5E6A0', '#E0A95C', '#B8860B', '#4B0082', '#191970'],
  mono:        ['#E8E4D8', '#B8B0A0', '#888070', '#585040', '#28200F'],
} as const;
```

Hue rotation is implemented in HSL space:

```typescript
export function shiftHue(hex: string, deg: number): string;
```

## File layout (proposed)

See `CLAUDE.md` for the canonical file layout. Summary:

```
src/
├── grid.ts                            
├── motifs/{star,crescent,lotus,vajra,flame,gate}.ts
├── rings.ts                           
├── palette.ts                         
├── renderer/{canvas2d,svg,webgl}.ts   
├── cymatics/...                       
├── ui/...                             
├── types.ts                           
└── main.ts                            
```

## Open questions

1. **Should the motif library include reference variants** (e.g. `lotus.style.nyingma` vs `lotus.style.gelug` vs `lotus.style.free`)? Adds complexity but supports more accurate iconography.
2. **B-spline control point storage** — hand-curated JSON files per style, or parametric generation from a smaller set of shape parameters?
3. **Symbol slot at bindu** — should this accept SVG paste-in, or have a curated set of deity glyphs / seed syllables?

These can be deferred past v1.
