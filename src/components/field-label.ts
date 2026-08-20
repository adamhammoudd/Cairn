// One field-label treatment for the whole app.
//
// There were three: mono-uppercase in the auth fields (and in 41 files' worth
// of eyebrows and column headers), sentence-case 12px in the alert form, and
// sentence-case 12.5px in the Add Holding modal - which is why the modal
// "looks like a different app" from the screen that opened it. The two
// sentence-case variants did not even agree with each other on size or margin.
//
// Mono-uppercase wins on weight of usage: 74 occurrences across 41 files
// against 5.
export const FIELD_LABEL = "mb-1.75 block font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase";
