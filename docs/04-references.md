# References

Consolidated link list for everything cited across the project docs.

## The one essential paper

**Zhang, J., Zhang, K., Peng, R., & Yu, J. (2020).** Parametric Modeling and Generation of Mandala Thangka Patterns. *Journal of Computer Languages*, 58, 100968. https://doi.org/10.1016/j.cola.2020.100968

Primary PDF: http://www.cad.zju.edu.cn/home/jhyu/Papers/JoCompLang2020.pdf

This is the only paper that matters for the procedural-mandala side of this project. Read in full. The motif equations in `docs/01-architecture.md` come directly from sections 3-5.

## Existing tools and projects

### Procedural mandala generators

- **RandomMandala** (Anton Antonov, Python) — https://pypi.org/project/RandomMandala/
- **Mandala-Generation** (Priyanka, WGAN-div) — https://github.com/priyanka1706/Mandala-Generation
- **Mandala Generator** (RPH Studio, ProcJam 2019) — https://rphstudio.itch.io/mandala-generator
- **Mandala pattern generator** (Richard Carter, OpenProcessing) — https://openprocessing.org/sketch/151943/
- **Plantala** (Coding da Vinci hackathon) — uses digitized botanical elements — https://github.com/topics/mandala
- **Julala** (Coding da Vinci hackathon) — uses copperplate elements
- **rafket/mandala** (JS, C++) — https://github.com/rafket/mandala
- **Ajinkya296/Mandala** (Processing paint tool) — https://github.com/Ajinkya296/Mandala
- **GitHub topic page** (browse all) — https://github.com/topics/mandala-art

### Cymatic / Chladni simulators

- **schroffl/chladni-simulation** (WebGL) — https://github.com/schroffl/chladni-simulation
- **Cortexelus/4D-Chladni** (Max/MSP, 4D) — https://github.com/Cortexelus/4D-Chladni
- **PettaBoy/Cymatics-Simulator-Chladni** (web) — https://github.com/PettaBoy/Cymatics-Simulator-Chladni — live: https://pettaboy.github.io/cymaticssimulator_chladni
- **flutomax/ChladniPlate2** (native, waveform-driven) — https://github.com/flutomax/ChladniPlate2
- **Shadertoy: Chladni plate simulation** (GLSL) — https://www.shadertoy.com/view/3sjfzz
- **kai5z/Chladni-patterns** (Python, physical simulation) — https://github.com/kai5z/Chladni-patterns — blog: https://blog.kaistale.com/?p=1295
- **Mark Serena, Unreal Chladni material** — https://www.markserena.com/post/ue_chladni_material/
- **Houdini node documentation** — https://www.sidefx.com/docs/houdini/nodes/cop/chladni.html

### Morphogenesis and procedural-form resources

- **Jason Webb, morphogenesis-resources** (curated list) — https://github.com/jasonwebb/morphogenesis-resources

## Practical iconography references

- **Tibetan Buddhist Mandalas** (Carmen Mensink, thangka painter) — https://www.mandala-painting.com/painted-mandalas/

## Tools and libraries

- **regl** (functional WebGL) — https://github.com/regl-project/regl
- **twgl** (lightweight WebGL helpers) — https://github.com/greggman/twgl.js
- **Tone.js** (WebAudio framework) — https://tonejs.github.io/
- **Vite** (dev server + build) — https://vitejs.dev/

## Mathematical references

- **Chladni's original work**: Ernst Chladni, *Entdeckungen über die Theorie des Klanges* (1787). The patterns named after him date from this monograph.
- **Bessel function tables**: Abramowitz & Stegun, *Handbook of Mathematical Functions*, § 9.5 (zeros of Bessel functions). https://personal.math.ubc.ca/~cbm/aands/page_409.htm
- **Bessel function zeros via SciPy**: `scipy.special.jn_zeros(n, m)` — useful for computing the lookup table once.

## Tibetan iconographic and historical sources

These are good-to-have references for the symbolic depth of the project. Not required for the technical build.

- Beer, R. *The Encyclopedia of Tibetan Symbols and Motifs*. Shambhala, 1999.
- Brauen, M. *The Mandala: Sacred Circle in Tibetan Buddhism*. Shambhala, 1997.
- Lopez, D. *The Madman's Middle Way*. University of Chicago Press, 2006 (for the Nyingma school's specific iconographic conventions).
- Tucci, G. *The Theory and Practice of the Mandala*. Rider, 1961 (classic European-language overview).

For the proportional canon (the iconometric system the thigtse grid descends from):

- *Pratimālakṣaṇa* — Sanskrit treatise on image-making, c. 6th century CE
- *Citralakṣaṇa* — attributed to Nāgnajit, painting treatise
- *Dge-bshes-chos-grags Tshig-mdzod* — Tibetan dictionary entries on grid construction terms

## Audio sources for the cymatic phase

When testing audio coupling, these styles work well:

- **Gyuto and Gyume Tantric Choir** — Tibetan throat singing recordings. Rich harmonic stacks. Many recordings on Smithsonian Folkways and Nonesuch Records.
- **Singing bowl recordings** — pure tones, multi-harmonic. The Frosch and Gansser bowls are particularly clean.
- **Bell and gong recordings** — transient attack, slow decay. Useful for showing the full mandala → Chladni → reform cycle.

Public domain options on the Internet Archive for testing: https://archive.org/details/audio (search "tibetan bowl" or "throat singing").

## Citation format for project documentation

When citing within the project's own docs, use the short form:

- "Zhang et al. 2020 § 3.2" — paper section
- "prototype A:120-140" — prototype file with line range
- "see docs/02-cymatics.md § Audio coupling" — cross-reference

Avoid academic citation styles in code comments — they're overhead. Just the short form.
