// Hard technical gate, not a prompt instruction: every generated analysis and
// every chat turn passes through here before it is written or shown. Three
// layers:
//
// 1. Structural: the generator's input/output types never carry a user_id,
//    holding_id, or any portfolio reference (see ai/generate.ts) - a
//    personalized recommendation is architecturally impossible to *request*,
//    not just filtered after the fact.
// 2. Compositional: the deterministic check below.
// 3. Semantic: an optional model-based second pass (scope-classifier.ts) that
//    judges intent rather than surface form.
//
// --------------------------------------------------------------------------
// Why layer 2 is not a list of phrases
// --------------------------------------------------------------------------
// The previous implementation matched four fixed patterns keyed on specific
// modal verbs ("you should|could|might want to") and specific possession nouns
// (position|portfolio|holding|shares|stake|account|investment). A verification
// pass ran 25 natural paraphrases of "sell NVDA" through it. It caught 5.
// The misses needed no evasion effort at all - "you'd be better off selling
// NVDA" has no listed modal, "I'd suggest you exit semiconductors" is a
// contraction the first-person rule didn't list, and "trim your exposure" uses
// the one possession noun nobody thought to add.
//
// Enumerating phrases loses that game by construction: the space of ways to
// say "sell this" is open, and each added phrase covers exactly one of them.
// So this decomposes the utterance instead. A personal directive in this
// domain is almost always the same three things at once:
//
//     an ADVICE FRAME  x  a TRADE ACTION  x  asserted (not refused or quoted)
//
// Both lexicons are small and closed-ish, and their *product* is what gets
// covered: ~50 frames x ~60 actions is a few thousand phrasings, from two
// lists a person can actually read and maintain. "You'd be better off selling"
// and "I'd suggest you exit" and "the smart move is to rotate out" are then
// all the same shape rather than three separate patches.
//
// --------------------------------------------------------------------------
// Why the third factor matters as much as the first two
// --------------------------------------------------------------------------
// The same verification pass found the old guard wrong in the *other*
// direction too: of 41 real production flags, most were the model correctly
// refusing, caught on incidental wording -
//
//   "...there is no specific analysis that addresses whether you should sell
//    your investments when they are down 10%..."
//
// That is a good refusal. Flagging it and replacing it with boilerplate makes
// the assistant worse, and teaches nobody anything. So detection runs per
// clause, and a clause carrying a refusal or attribution marker ("I don't
// have", "there is no", "whether", "you asked") is not a directive no matter
// which frames and actions appear inside it. Splitting on contrastive
// conjunctions keeps that from becoming an evasion: "I can't advise, but you
// should sell NVDA" is two clauses, and the second one still flags.
//
// This remains a linguistic filter, not a proof. Layer 3 exists because it
// always will be.

export interface ScopeGuardResult {
  passed: boolean;
  reason: string | null;
  /** The clause that tripped the rule - for the audit log, never shown to a user. */
  evidence?: string;
}

// --------------------------------------------------------------------------
// Lexicon 1: trade actions. Anything denoting a change to (or deliberate
// maintenance of) a position. Base forms and inflections both appear because
// directives use both ("sell NVDA", "I'd be selling NVDA").
// --------------------------------------------------------------------------
const TRADE_ACTION_SOURCE = [
  // outright direction
  "buy(?:ing|s)?", "sell(?:ing|s)?", "purchas(?:e|ing|es)", "acquir(?:e|ing|es)",
  "short(?:ing|s)?", "hold(?:ing|s)?", "own(?:ing|s)?",
  // sizing up
  "add(?:ing|s)?(?:\\s+to)?", "accumulat(?:e|ing|es)", "load(?:ing)?\\s+up",
  "scal(?:e|ing)\\s+in", "average\\s+(?:down|up)", "double\\s+down", "back\\s+up\\s+the\\s+truck",
  "increas(?:e|ing|es)\\s+(?:exposure|position|weight(?:ing)?|allocation)",
  // sizing down
  "trim(?:ming|s)?", "reduc(?:e|ing|es)", "lighten(?:ing)?(?:\\s+up)?", "cut(?:ting|s)?",
  "pare(?:\\s+back)?", "scal(?:e|ing)\\s+out", "de-?risk(?:ing)?", "sell(?:ing)?\\s+down",
  // exiting
  "exit(?:ing|s)?", "dump(?:ing|s)?", "offload(?:ing|s)?", "liquidat(?:e|ing|es)",
  "clos(?:e|ing)\\s+(?:out|the\\s+position)?", "get(?:ting)?\\s+out", "step(?:ping)?\\s+aside",
  "walk(?:ing)?\\s+away", "cash(?:ing)?\\s+out",
  // profit/loss taking
  "tak(?:e|ing)\\s+(?:profits?|gains?|money\\s+off)", "book(?:ing)?\\s+(?:profits?|gains?)",
  "lock(?:ing)?\\s+in\\s+(?:profits?|gains?)", "ring(?:ing)?\\s+the\\s+register",
  "cut(?:ting)?\\s+(?:your\\s+)?loss(?:es)?",
  // rotation / allocation
  "rotat(?:e|ing|es)", "rebalanc(?:e|ing|es)", "reallocat(?:e|ing|es)", "switch(?:ing|es)?",
  "mov(?:e|ing)\\s+(?:to|into)\\s+cash", "rais(?:e|ing)\\s+cash", "go(?:ing)?\\s+(?:long|short)",
  "stay(?:ing)?\\s+(?:long|short|in|out)", "sit(?:ting)?\\s+tight", "rid(?:e|ing)\\s+it\\s+out",
  // avoidance
  "avoid(?:ing|s)?", "steer(?:ing)?\\s+clear", "stay(?:ing)?\\s+away",
  // hedging
  "hedg(?:e|ing|es)",
  // the dip/rip idioms
  "buy\\s+the\\s+dip", "sell\\s+the\\s+rip",
].join("|");

const TRADE_ACTION = new RegExp(`\\b(?:${TRADE_ACTION_SOURCE})\\b`, "i");

// --------------------------------------------------------------------------
// Lexicon 2: advice frames. Constructions that turn a description into a
// recommendation aimed at the reader.
// --------------------------------------------------------------------------
const ADVICE_FRAMES: { pattern: RegExp; reason: string }[] = [
  // Second-person modal, contractions included. The old rule listed six exact
  // modals; this covers the auxiliary + any of them, plus "you'd".
  {
    pattern: /\byou(?:'d|\s+would|\s+should|\s+shall|\s+ought\s+to|\s+could|\s+can|\s+might|\s+may|\s+need\s+to|\s+have\s+to|\s+must|\s+want\s+to|\s+will|'ll|\s+are\s+better\s+off|\s+would\s+be\s+better\s+off|'d\s+be\s+better\s+off)\b/i,
    reason: "second_person_directive",
  },
  // Advice delivered as a hypothetical swap of places.
  {
    pattern: /\b(?:if\s+i\s+(?:were|was)\s+you|in\s+your\s+(?:shoes|position|situation|place)|were\s+i\s+in\s+your|a\s+person\s+in\s+your\s+(?:situation|position|shoes)|someone\s+in\s+your\s+(?:situation|position|shoes)|if\s+it\s+were\s+(?:me|my\s+money)|for\s+your\s+money)\b/i,
    reason: "roleplay_personalization",
  },
  // Conditional on the reader's holdings: "if you own NVDA, now is the time".
  {
    pattern: /\bif\s+you(?:'re|\s+are)?\s+(?:own|hold|have|holding|owning|long|short|in|sitting\s+on)\b/i,
    reason: "conditional_on_reader_position",
  },
  // First-person advice, including the contraction and the noun form that the
  // old /i (recommend|suggest|advise)/ rule missed entirely.
  {
    pattern: /\b(?:i\s+(?:recommend|suggest|advise|would\s+recommend|would\s+suggest|would\s+advise)|i'd\s+(?:recommend|suggest|advise)?|i\s+would\b|my\s+(?:advice|recommendation|suggestion|take|call)\b|personally,?\s+i)\b/i,
    reason: "first_person_advice",
  },
  // Evaluative-prescriptive: no modal, no pronoun, still a recommendation.
  {
    pattern: /\b(?:it\s+(?:makes|would\s+make)\s+sense\s+to|makes\s+sense\s+to|it(?:'s|\s+is)\s+worth\b|worth\s+(?:considering|taking|trimming|adding|buying|selling|holding)|the\s+(?:smart|right|best|obvious|sensible)\s+(?:move|play|thing|call|approach)|the\s+(?:move|play)\s+(?:here|now)\s+is|no\s+reason\s+not\s+to|you\s+can't\s+go\s+wrong|there(?:'s|\s+is)\s+a\s+case\s+for)\b/i,
    reason: "prescriptive_evaluation",
  },
  // Timing prescriptions: "now is a good time to", "now would be the time to".
  {
    pattern: /\b(?:now\s+(?:is|would\s+be|'s)\s+(?:a\s+|the\s+)?(?:good|right|ideal|perfect|great|opportune)?\s*time\s+to|the\s+time\s+to\s+\w+\s+is\s+now|this\s+is\s+the\s+(?:moment|time)\s+to|before\s+it(?:'s|\s+is)\s+too\s+late)\b/i,
    reason: "timing_prescription",
  },
  // Softened imperative: "consider trimming", "you might consider".
  {
    pattern: /\bconsider(?:ing)?\s+(?:\w+ing\b|to\s+\w+)/i,
    reason: "softened_directive",
  },
  // Advice as a question: "why not sell?", "have you thought about selling?"
  {
    pattern: /\b(?:why\s+not\s+\w+|have\s+you\s+(?:considered|thought\s+about)|what(?:'s|\s+is)\s+stopping\s+you)\b/i,
    reason: "question_form_advice",
  },
];

// --------------------------------------------------------------------------
// Possession reference. Kept as its own signal because "we never analyse your
// personal position" is a product rule in its own right, not only an
// anti-advice rule - but it is now scoped by the refusal check below, which is
// what stops it firing on "I don't have analyses related to your holdings".
// "exposure" and "book" are here because they were the words the old list
// missed and are the most natural in this domain.
// --------------------------------------------------------------------------
// The noun may be qualified before it arrives - "your NVDA position", "your
// semiconductor exposure", "your current tech holdings". Requiring "your" to
// sit directly against the noun missed all of those, so
// "It would be sensible to reduce your semiconductor position here." passed
// the guard outright. Up to two intervening qualifier words are allowed; more
// than that starts matching unrelated spans.
const PERSONAL_POSSESSION =
  /\byour\s+(?:[\w-]+\s+){0,2}(?:position|positions|portfolio|holding|holdings|shares|stake|account|investment|investments|exposure|allocation|book|basket|money|capital|savings|nest\s+egg)\b/i;

// Clauses that mention the reader's holdings without saying anything about
// what to DO with them: acknowledgements, statements of what the data does not
// cover, and referrals to Cairn's own Research page. Replaying the 42 real
// production flags in ai_scope_guard_log through this guard showed these are
// the residual over-fire class - the assistant was being caught for correctly
// refusing, and in five cases for recommending its own analysis feature.
//
// This suppresses ONLY the last-resort PERSONAL_POSSESSION rule below. The
// imperative and advice-frame checks run first and are untouched, and the
// suppression additionally requires that the clause carry no trade action at
// all, so "This will help you decide whether to sell NVDA" is still caught.
const POSSESSION_BENIGN = new RegExp(
  [
    // referral to the product's own analysis surface - not a trade action
    "\\b(?:request(?:ing)?|run(?:ning)?|generat(?:e|ing))\\s+(?:a\\s+)?(?:fresh|new)\\s+analysis\\b",
    "\\bon\\s+the\\s+research\\s+page\\b",
    "\\bstored\\s+analyses\\b",
    // acknowledgement of the reader, carrying no recommendation
    "\\bi\\s+understand\\s+your\\s+concern\\b",
    "\\bif\\s+you\\s+(?:could|can)\\s+provide\\b",
    // statements about what information would do, not what the reader should do
    "\\bthis\\s+(?:will|would)\\s+(?:help|ensure|give|provide)\\b",
    "\\b(?:don't|do\\s+not|doesn't|does\\s+not)\\s+provide\\b",
    // "...covers mortgage rates and market trends, but not your holdings" -
    // a statement of what the retrieved data does NOT cover.
    "\\bnot\\s+your\\b",
  ].join("|"),
  "i",
);

// --------------------------------------------------------------------------
// Bare imperative aimed at the reader: "Buy the dip.", "Take profits now."
// The exclusion list is the financial-jargon compounds that are ordinary
// description rather than instruction.
// --------------------------------------------------------------------------
// Only *base* forms can head an imperative ("Trim exposure", never "Trimming
// exposure"), so this lists base forms alone - which is also what keeps
// "Selling accelerated into the close" and "Buying pressure increased" from
// reading as commands. Kept deliberately in sync with TRADE_ACTION_SOURCE
// above: a verb added there and forgotten here is exactly how "Move to cash"
// and "Double down on NVDA" slipped through a first pass of this rewrite.
const IMPERATIVE_BASE_VERBS = [
  "buy", "sell", "hold", "short", "own", "purchase", "acquire",
  "add", "accumulate", "load", "scale", "average", "double", "increase", "back",
  "trim", "reduce", "lighten", "cut", "pare", "de-?risk",
  "exit", "dump", "offload", "liquidate", "close", "get", "step", "walk", "cash",
  "take", "book", "lock", "ring",
  "rotate", "rebalance", "reallocate", "switch", "move", "raise", "go", "stay", "sit", "ride",
  "avoid", "steer", "hedge",
].join("|");

const IMPERATIVE_LEAD = new RegExp(`^(?:${IMPERATIVE_BASE_VERBS})\\b(?!-)`, "i");

// Financial-jargon compounds that begin with the same verbs but describe
// rather than instruct.
const IMPERATIVE_EXCLUSIONS = new RegExp(
  `^(?:${IMPERATIVE_BASE_VERBS})\\s+(?:rates?|steady|off|out\\s+of\\s+favou?r|back|firm|flat|its|their|the\\s+line|pressure|signals?|volumes?|orders?|ratings?|calls?|recommendations?|side|interest|value|estimates?|targets?|forecasts?|guidance|times?|periods?)\\b`,
  "i",
);

// A finite verb shortly after the leading word means that word was a subject,
// not a command: "Hold times increased", "Selling accelerated into the close".
const LEADING_WORD_IS_SUBJECT =
  /^\w[\w-]*\s+(?:\w+\s+)?(?:is|was|were|are|has|have|had|rose|fell|increased|decreased|declined|accelerated|slowed|widened|narrowed|remains?|remained|stayed|continued|extended|moved)\b/i;

// --------------------------------------------------------------------------
// Non-assertion markers. A clause carrying one of these is refusing,
// disclaiming, quoting the question back, or describing what someone else did
// - none of which is the assistant telling the reader what to do.
// --------------------------------------------------------------------------
const NON_ASSERTION =
  new RegExp(
    [
      // explicit refusal / inability
      "\\b(?:i\\s+(?:don't|do\\s+not|cannot|can't|won't|will\\s+not|am\\s+not\\s+able|couldn't))\\b",
      "\\bi'm\\s+(?:not\\s+able|unable)\\b",
      "\\b(?:cannot|can't)\\s+(?:advise|recommend|tell\\s+you|provide|give)\\b",
      // absence of data
      "\\bthere(?:'s|\\s+is|\\s+are)\\s+no\\b",
      "\\bno\\s+(?:specific|stored|relevant|matching)\\b",
      "\\b(?:don't|do\\s+not|doesn't|does\\s+not)\\s+have\\b",
      "\\bnothing\\s+(?:in|on)\\s+(?:the\\s+)?(?:record|context)\\b",
      // scope disclaimers - including this guard's own rewrite text
      "\\b(?:does\\s+not|doesn't|never)\\s+(?:give|provide|offer|make)\\b",
      "\\bnot\\s+(?:investment|financial|personal)\\s+advice\\b",
      "\\bthis\\s+assistant\\b",
      "\\binformational\\s+only\\b",
      "\\b(?:general|market|sector|ticker)[- ]level\\s+only\\b",
      // attribution / quotation of the question
      "\\bwhether\\b",
      "\\byou\\s+asked\\b",
      "\\byour\\s+question\\b",
      "\\bthe\\s+question\\s+of\\b",
      "\\basked\\s+(?:about|if|whether)\\b",
    ].join("|"),
    "i",
  );

// --------------------------------------------------------------------------
// Clause splitting. Sentence terminators first, then contrastive conjunctions,
// so a refusal cannot be used as cover for a directive appended after "but".
// --------------------------------------------------------------------------
const CONTRASTIVE = /\s*(?:,\s*)?\b(?:but|however|although|though|that\s+said|still|nevertheless|nonetheless|even\s+so|on\s+the\s+other\s+hand)\b\s*/i;

// Models routinely emit typographic apostrophes (U+2019), while every pattern
// in this file is written with an ASCII one. That mismatch silently defeated
// the whole NON_ASSERTION carve-out: "I don't have data on that" was read as a
// non-refusal and flagged, which is a real share of the over-firing found in
// the production guard log. Normalise once, at the only entry point.
function normalizeQuotes(text: string): string {
  return text.replace(/[‘’ʼ′]/g, "'").replace(/[“”]/g, '"');
}

export function splitClauses(text: string): string[] {
  return normalizeQuotes(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .flatMap((sentence) => sentence.split(CONTRASTIVE))
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

function isImperativeDirective(clause: string): boolean {
  const stripped = clause.replace(/^[-*\d.)\s"']+/, "");
  if (!IMPERATIVE_LEAD.test(stripped)) return false;
  if (IMPERATIVE_EXCLUSIONS.test(stripped)) return false;
  if (LEADING_WORD_IS_SUBJECT.test(stripped)) return false;
  return TRADE_ACTION.test(stripped);
}

export function checkScopeGuard(text: string): ScopeGuardResult {
  for (const clause of splitClauses(text)) {
    // A refusal, disclaimer, or quoted question is not a directive.
    if (NON_ASSERTION.test(clause)) continue;

    const hasAction = TRADE_ACTION.test(clause);

    if (isImperativeDirective(clause)) {
      return { passed: false, reason: "imperative_sentence", evidence: clause };
    }

    if (hasAction) {
      for (const frame of ADVICE_FRAMES) {
        if (frame.pattern.test(clause)) {
          return { passed: false, reason: frame.reason, evidence: clause };
        }
      }
    }

    if (PERSONAL_POSSESSION.test(clause)) {
      // Benign only when the clause also proposes no trade action whatsoever.
      if (POSSESSION_BENIGN.test(clause) && !hasAction) continue;
      return { passed: false, reason: "personal_possession_reference", evidence: clause };
    }
  }

  return { passed: true, reason: null };
}
// Completeness gate - separate from the personal-directive check above.
// "Never a bare number" (Phase 4 spec): an analysis with no sources, no
// historical analogs, or no plain-language reasoning is rejected outright,
// independent of whether its text happens to pass the directive check.
export interface AnalysisCompleteness {
  reasoning_text: string;
  source_count: number;
  historical_analog_count: number;
  sample_size: number;
}

export function checkCompleteness(a: AnalysisCompleteness): ScopeGuardResult {
  if (!a.reasoning_text || a.reasoning_text.trim().length < 20) {
    return { passed: false, reason: "missing_or_too_short_reasoning" };
  }
  if (a.source_count < 1) {
    return { passed: false, reason: "no_sources_cited" };
  }
  if (a.historical_analog_count < 1) {
    return { passed: false, reason: "no_historical_analogs" };
  }
  if (a.sample_size < 1) {
    return { passed: false, reason: "zero_sample_size" };
  }
  return { passed: true, reason: null };
}

// ---------------------------------------------------------------------------
// Chat-specific gate: unlike generate.ts, chat produces free text rather than
// a structured probability field, so "does not freelance new probability
// claims outside the validated pipeline" (Phase 5 spec) needs its own check.
// Deliberately narrow to probability-flavored language ("62% chance/
// likelihood/odds") rather than any bare "%" so it doesn't flag routine
// factual restatements of news ("shares fell 4% today") as a violation.
// ---------------------------------------------------------------------------

export interface ProbabilityRangeContext {
  probability_low: number;
  probability_high: number;
}

const PROBABILITY_CLAIM =
  /(\d{1,3}(?:\.\d+)?)\s*%\s*(?:chance|likelihood|probability|likely|odds)\b|\b(?:chance|likelihood|probability|odds)(?:\s+\S+){0,4}?\s+(\d{1,3}(?:\.\d+)?)\s*%/gi;

// Small tolerance for the model restating a stored range's midpoint or
// rounding slightly, without opening the door to an unrelated invented figure.
const RANGE_TOLERANCE = 1;

export function checkNoFreelancedProbability(
  text: string,
  contextAnalyses: ProbabilityRangeContext[],
): ScopeGuardResult {
  for (const match of text.matchAll(PROBABILITY_CLAIM)) {
    const raw = match[1] ?? match[2];
    if (!raw) continue;
    const value = Number(raw);
    const grounded = contextAnalyses.some(
      (a) => value >= a.probability_low - RANGE_TOLERANCE && value <= a.probability_high + RANGE_TOLERANCE,
    );
    if (!grounded) {
      return { passed: false, reason: "freelanced_probability_claim" };
    }
  }
  return { passed: true, reason: null };
}

// ---------------------------------------------------------------------------
// Deterministic rewrite for a flagged chat response. Never a second model
// call - built only from already-validated ai_analyses fields (which passed
// this same guard at generation time in generate.ts) plus fixed boilerplate,
// so it cannot itself contain a fresh, unvalidated claim. The boilerplate is
// hand-checked against every rule above, and re-verified at runtime as a
// defense-in-depth measure - this function must never return text that would
// itself fail checkScopeGuard.
// ---------------------------------------------------------------------------

export interface AnalysisForRewrite {
  scope_type: string;
  scope_value: string;
  probability_low: number;
  probability_high: number;
  confidence_level: string;
  reasoning_text: string;
}

const REWRITE_INTRO =
  "This assistant describes markets, sectors, and tickers at a general level only - it does not give personal buy, sell, or hold guidance for an individual reader.";
const REWRITE_FALLBACK_NO_CONTEXT =
  `${REWRITE_INTRO} There's no stored analysis on record yet for what was asked - a fresh one can be requested from the Research page.`;
const REWRITE_ULTRA_SAFE_FALLBACK =
  "This assistant only describes markets, sectors, and tickers in general terms and cannot respond to that request. Please rephrase, or visit the Research page for stored analyses.";

export function rewriteForScopeGuard(contextAnalyses: AnalysisForRewrite[]): string {
  let text: string;
  if (contextAnalyses.length === 0) {
    text = REWRITE_FALLBACK_NO_CONTEXT;
  } else {
    const lines = contextAnalyses.map(
      (a) =>
        `- ${a.scope_type} · ${a.scope_value}: ${a.probability_low}-${a.probability_high}% (${a.confidence_level} confidence) - ${a.reasoning_text}`,
    );
    text = `${REWRITE_INTRO} Here's what's already on record at the market/sector/ticker level:\n\n${lines.join("\n")}`;
  }

  // Defense in depth: the rewrite itself must pass the same gate it exists to
  // enforce. If it somehow doesn't (e.g. a future edit to REWRITE_INTRO
  // reintroduces a flagged phrase), fall back to a string with zero
  // interpolated content instead of ever risking output that failed its own
  // check.
  const selfCheck = checkScopeGuard(text);
  if (!selfCheck.passed || checkNoFreelancedProbability(text, contextAnalyses).reason) {
    return REWRITE_ULTRA_SAFE_FALLBACK;
  }
  return text;
}
