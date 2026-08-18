# Strain

The app cannot currently distinguish "reached the target" from
"reached the target by straining." If it can't, every piece of
feedback reinforces whatever the user did to hit the number, including
tension that hurts them — invisibly, because the metrics all look like
success.

VoceVista solves this with an electroglottograph, a hardware sensor
that measures vocal fold contact directly ([VoceVista, "Electroglottograph
(EGG)"](https://www.vocevista.com/en/products/electroglottograph-egg/)).
We are attempting with a laptop microphone what the reference tool does
with instrumented hardware.

## Approaches

| Approach | Measures | Build cost | Reliability on consumer mics | Verdict |
|---|---|---|---|---|
| 1. Self-report (Borg CR10-style perceived phonatory effort) | Effort directly | Trivial | N/A — subjective, but not noisy in the acoustic sense; subject to recall bias, skipping, motivated under-reporting | SHIP FIRST — not a fallback, it's the label set everything else is validated against |
| 2. Range-relative geometry (F0 vs. calibrated comfortable ceiling, cumulative phonation time, within-session F0 drift) | Strain *risk*, not strain | Low | High — it's arithmetic, not spectra | SHIP SECOND — best value-to-effort ratio |
| 3. Glottal source measures (H1-H2, spectral tilt H1-A1/H1-A3) | Pressed vs. breathy phonation | High — needs formant correction to be valid | Medium-poor — confounded by mic response, vowel, F0, distance | STRETCH — the one worth attempting |
| 4. Perturbation + CPPS (jitter, shimmer, HNR, cepstral peak prominence) | Dysphonia / periodicity | Medium-high | Poor in connected speech on a laptop mic | MOSTLY A TRAP — see below |
| 5. n=1 learned classifier (logistic regression over 2 and 3, trained on 1's labels) | Strain, once labels exist | Low, once 1-3 exist | Depends on inputs | THE PAYOFF |

Approach 3's direction of effect — lower H1-H2 (spectral tilt) for
pressed/hyperfunctional phonation, higher H1-H2 for breathy phonation
— is confirmed by [voicescience.org, "Breathiness" (lexicon entry)](https://www.voicescience.org/lexicon/breathiness/),
a secondary source pointing to Hillenbrand, Cleveland & Erickson
(1994) for the breathy side; the primary framework is Hanson (1997),
*J. Acoust. Soc. Am.* 101(1):466–481, identified via search but not
independently opened and read, so not linked here.

CPPS is the best-validated acoustic measure of dysphonia
([Cortés Ponce et al. (2024), "Smoothed Cepstral Peak Prominence: A
Comparison Between Dysphonic and Non-dysphonic Mexican Adults Employing
the Praat Software," *Cureus* 16(10):e72292](https://pmc.ncbi.nlm.nih.gov/articles/PMC11585306/)),
which makes it the obvious reach, but it points the wrong way here:
high CPPS means strong periodic harmonic structure, and pressed
hyperfunctional phonation is highly periodic. Strain can raise CPPS.
Excellent breathiness detector, bad strain detector. [likely — a 2025
*Journal of Voice* paper (PubMed 40021420) reports pressed phonation
showing higher CPP and lower H1-H2 than typical phonation in connected
speech, matching this mechanism, but the paper itself was only found
via search, not opened and read, so it's not cited as a link here —
confident about the mechanism, less so about effect size] Jitter and
shimmer are validated on sustained vowels in sound-treated rooms; on a
laptop mic in connected speech they mostly measure the room. [likely —
consistent with Heman-Ackah et al. (2003) and Deliyski et al. (2005) on
environmental noise degrading perturbation measures, both identified
via search but not independently opened and read, so not linked here]
Compute and log them, but do not wire them to feedback until approach 5
shows they earned it.

## Interface

```typescript
interface StrainSignal {
  id: string;
  score: number;        // 0..1, higher = more strain
  confidence: number;   // 0..1 — how much this estimator trusts itself
  rationale: string;    // human-readable, for the session review
}

interface StrainEstimator {
  id: string;
  requires: FeatureKey[];
  estimate(window: FeatureFrame[]): StrainSignal | null;  // null =
                                                          // insufficient data
}
```

Estimators register in an array; a resolver takes the
confidence-weighted max. Self-report registers at confidence 1.0 and
dominates until something else earns higher confidence. The confidence
field is what buys flexibility: an unvalidated proxy ships at 0.2 and
can only nudge; one that correlates with the user's labels gets
promoted. No need to choose between "trust it" and "don't build it."

## On machine learning

An LLM is the wrong tool for strain classification and the right tool
for two other jobs. Strain detection from acoustic features is a small
tabular problem with roughly eight inputs — logistic regression beats
a small language model, runs in microseconds, needs no download, and
gives interpretable coefficients, which is exactly what's needed to
judge whether a proxy is real.

An optional on-device LLM (transformers.js or WebLLM over WebGPU,
lazy-loaded, strictly optional, on-device only) is a reasonable fit
for turning session numbers into prose and for parsing free-text
self-report ("felt tight in my throat by the end") into structured
fields. Expect a large first-run download and unreliable iOS Safari
WebGPU support.

For now, prefer dev-time analysis of exported session data over any
shipped runtime model.

## Exercise risk tiers

Gate by exercise, not globally.

| Tier | Risk | Examples | Coaching behavior |
|---|---|---|---|
| A | Low | SOVT, straw phonation, humming, glides in the middle of range | Full coaching, live cues allowed |
| B | Moderate | Resonance work, connected speech in target range | Coaching on, self-report mandatory at session end, soft time cap |
| C | High | Sustained work near the ceiling, loudness work, anything above the calibrated comfortable range | INSTRUMENT MODE ONLY — no targets, no cues, timer visible |

Tier C is the honest answer to "we can't tell strain from success." In
the regime where the app can't tell, it stops making claims. Users
keep full access; they just aren't told they're doing well when the
app doesn't know.
