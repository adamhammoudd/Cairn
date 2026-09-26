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
  // The same advice attributed to a third party rather than to "I" - "this
  // assistant suggests you sell", "Cairn recommends you trim", "the model
  // advises you to rotate out". Displacing the speaker does not make it less
  // of a recommendation, and it is the shape a model reaches for when told not
  // to advise in the first person.
  //
  // Anchored on the reader as the object, so factual attribution is untouched:
  // "the data suggests volatility rose" and "the filing recommends a vote"
  // carry no "you" and never match.
  {
    pattern: /\b(?:suggests?|recommends?|advises?|would\s+(?:suggest|recommend|advise))\s+(?:that\s+)?you\b/i,
    reason: "attributed_advice",
  },
  // Evaluative-prescriptive: no modal, no pronoun, still a recommendation.
  {
    pattern: /\b(?:(?:it\s+)?(?:makes|(?:would|could|might)\s+make)\s+sense\s+to|it(?:'s|\s+is)\s+worth\b|worth\s+(?:considering|taking|trimming|adding|buying|selling|holding)|the\s+(?:smart|right|best|obvious|sensible)\s+(?:move|play|thing|call|approach)|the\s+(?:move|play)\s+(?:here|now)\s+is|no\s+reason\s+not\s+to|you\s+can't\s+go\s+wrong|there(?:'s|\s+is)\s+a\s+case\s+for)\b/i,
    reason: "prescriptive_evaluation",
  },
  // Timing prescriptions: "now is a good time to", "now would be the time to".
  {
    pattern: /\b(?:now\s+(?:is|would\s+be|'s)\s+(?:a\s+|the\s+)?(?:good|right|ideal|perfect|great|opportune)?\s*time\s+to|the\s+time\s+to\s+\w+\s+is\s+now|this\s+is\s+the\s+(?:moment|time)\s+to|before\s+it(?:'s|\s+is)\s+too\s+late)\b/i,
    reason: "timing_prescription",
  },
  // The same timing advice without "now" (feat/plain-summary): "a good time to
  // buy", "the right moment to sell", "not the time to sell". Only fires with a
  // trade action in the clause (see checkScopeGuard), so "a good time for the
  // company" and "in a short time" are untouched.
  {
    pattern: /\b(?:(?:a|the)\s+(?:good|great|right|ideal|perfect|opportune|smart|wise|bad|wrong|poor)\s+(?:time|moment|point|opportunity|entry(?:\s+point)?|window)\s+to|(?:is|'s)\s+not\s+the\s+(?:time|moment)\s+to)\b/i,
    reason: "timing_prescription",
  },
  // Prudence framing: "it could be wise to", "it would be prudent to".
  {
    pattern: /\b(?:(?:could|would|might|may)\s+be|it(?:'s|\s+is))\s+(?:wise|smart|prudent|sensible|sound|advisable|a\s+good\s+idea|a\s+smart\s+idea)\s+to\b/i,
    reason: "prescriptive_evaluation",
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
// Evaluative judgement about the reader's own position - "your account is
// overexposed", "your portfolio is too concentrated", "your holdings would
// benefit from...". This is not a neutral fact the way "your portfolio is up
// 1.24% today" is: it grades the personal position and implies a correction,
// which is the thing the product rule forbids even when no trade verb appears.
// Kept separate from ADVICE_FRAMES because those are reader-directed
// constructions in general; this is specifically position-quality language.
const POSSESSION_EVALUATION =
  /\b(?:over-?exposed|under-?exposed|over-?weight(?:ed)?|under-?weight(?:ed)?|over-?concentrated|under-?diversified|poorly\s+diversified|not\s+(?:well\s+)?diversified|over-?loaded|too\s+(?:concentrated|heavy|exposed|risky|large|small|much)|benefit\s+from|better\s+off|at\s+risk|vulnerable|overdue\s+for)\b/i;

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
// A REFUSAL is a clause that negates its own content: the assistant saying it
// will not or cannot answer, or that the record holds nothing. There is no
// directive left to extract, so these keep full immunity.
const REFUSAL = new RegExp(
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
    "\\b(?:does\\s+not|doesn't|never)\\s+(?:give|provide|offer|make)\\b",
  ].join("|"),
  "i",
);

// A DISCLAIMER is a label a clause wears, not something it negates. "You should
// sell NVDA now (not financial advice)" is still the assistant telling the
// reader to sell.
//
// These used to sit in the same list as the refusals above, under a single
// `continue` that skipped every check - so appending any one of these strings
// switched the guard off for that clause entirely. That is precisely what a
// model does when it half-complies with "do not give advice": it gives the
// advice and then labels it. Seven variants of that shape passed unflagged.
//
// They still suppress the personal-possession rule, which is what the carve-out
// was written for (see PERSONAL_POSSESSION below) - but never the imperative
// check and never the advice frames.
const DISCLAIMER = new RegExp(
  [
    // scope disclaimers - including this guard's own rewrite text
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
// Contrastives and consequentials both. A refusal is routinely used as a run-up
// to the directive rather than as cover behind it - "there is no stored
// analysis, so the smart move is to exit semiconductors" - and with `so` absent
// from this list that whole sentence was one clause, immunised by its own first
// half. `even so` stays ahead of bare `so` in the alternation so it still
// matches as a unit.
const CONTRASTIVE =
  /\s*(?:,\s*)?\b(?:but|however|although|though|that\s+said|still|nevertheless|nonetheless|even\s+so|on\s+the\s+other\s+hand|so\s+that|so|therefore|thus|which\s+means|in\s+which\s+case)\b\s*/i;

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
    // Semicolons and em-dashes terminate a clause as surely as a full stop.
    // Without them, everything after a `;` inherited the first half's
    // suppression and was never checked on its own terms.
    //
    // A dash only ends a clause when it is acting as one: spaced, or a real
    // en/em dash. A bare `-` in this class also split intra-word compounds, so
    // "Sell-side consensus moved higher" was cut down to the clause "Sell" and
    // flagged as an imperative. The `(?!-)` guard on IMPERATIVE_LEAD was
    // written for exactly that compound but never saw the hyphen, because the
    // split had already removed it.
    .split(/(?<=[.!?;])\s+|\s*;\s*|\s+[-–—]\s+|[–—]|\n+/)
    .flatMap((sentence) => sentence.split(CONTRASTIVE))
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

// A hedge in front of an imperative does not turn it into a description:
// "Perhaps lock in gains", "Maybe hold off buying" (feat/plain-summary).
const IMPERATIVE_HEDGE = /^(?:perhaps|maybe|possibly|probably|arguably|ideally|if\s+anything),?\s+/i;

function isImperativeDirective(clause: string): boolean {
  const stripped = clause.replace(/^[-*\d.)\s"']+/, "").replace(IMPERATIVE_HEDGE, "");
  if (!IMPERATIVE_LEAD.test(stripped)) return false;
  // "off" is in the jargon exclusions for descriptions like "sell off", but
  // "hold off buying" / "hold off on selling" is an instruction.
  if (/^hold\s+off\s+(?:on\s+)?\w+ing\b/i.test(stripped) && TRADE_ACTION.test(stripped.replace(/^hold\s+off\s+/i, ""))) return true;
  if (IMPERATIVE_EXCLUSIONS.test(stripped)) return false;
  if (LEADING_WORD_IS_SUBJECT.test(stripped)) return false;
  return TRADE_ACTION.test(stripped);
}

export function checkScopeGuard(text: string): ScopeGuardResult {
  for (const clause of splitClauses(text)) {
    // A refusal negates its own content - there is no directive left in it, so
    // it is skipped outright. A disclaimer does not: it is a label the clause
    // wears, and "you should sell NVDA (not financial advice)" is still the
    // assistant telling the reader to sell. Disclaimers therefore fall through
    // to the imperative and advice-frame checks below, and only suppress the
    // personal-possession rule at the end of the loop.
    if (REFUSAL.test(clause)) continue;
    const disclaimed = DISCLAIMER.test(clause);

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

    if (PERSONAL_POSSESSION.test(clause) && !disclaimed) {
      // This rule targets ADVICE about a personal position, not every mention
      // of one. A clause that names the reader's holdings but carries no trade
      // action and no advice frame is a neutral factual statement ("your
      // portfolio is up 1.24% today", "your position in AAPL is up 12%") - it
      // is not a directive, and the confabulation controls (the system-prompt
      // rules, checkNoFreelancedProbability, and the open question of whether
      // the assistant should ever hold real portfolio figures) are what govern
      // whether such a number is legitimate, not this guard. Evaluative
      // judgement about the position ("overexposed", "too concentrated") is a
      // different thing and still flags - see POSSESSION_EVALUATION.
      const hasAdviceFrame = ADVICE_FRAMES.some((f) => f.pattern.test(clause));
      if (!hasAction && !hasAdviceFrame && !POSSESSION_EVALUATION.test(clause)) continue;
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
  /**
   * True when factor readings and a factor-derived analog set were put in front
   * of the model. Then the reasoning must engage with that evidence at all -
   * an explanation that never mentions any of it has ignored the analogs the
   * range was computed from. Absent/false leaves every check exactly as before.
   */
  factor_evidence_required?: boolean;
}

// Words that show the prose engaged with the factor evidence. Deliberately
// broad: this asks "did it mention what the analogs were matched on", not
// "did it phrase it a particular way".
const FACTOR_EVIDENCE_TERMS =
  /\b(rsi|relative strength index|overbought|oversold|moving average|sma|trend|uptrend|downtrend|momentum|rate of change|volatil\w*|drawdown|draw-down|volume|z-score|standard deviation|mean|bollinger|relative strength|benchmark|factor|price history|own history|technical|signal)\b/i;

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
  if (a.factor_evidence_required && !FACTOR_EVIDENCE_TERMS.test(a.reasoning_text)) {
    return { passed: false, reason: "ignores_factor_evidence" };
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

/**
 * The same gate for a stored analysis's reasoning_text. The band is computed
 * in code, but the prose around it is the model's, and nothing stopped it
 * writing "roughly a 90% probability" next to a stored 21-64% range - which
 * then sat in ai_analyses as if the engine had said it. The only probability
 * figures the prose may state are the computed low/high and the observed base
 * rate (inside the Wilson interval by construction, allowed explicitly anyway).
 */
export function checkAnalysisProbabilityClaims(
  reasoningText: string,
  band: { low: number; high: number; pointEstimate: number | null },
): ScopeGuardResult {
  const allowed: ProbabilityRangeContext[] = [{ probability_low: band.low, probability_high: band.high }];
  if (band.pointEstimate !== null) {
    allowed.push({ probability_low: band.pointEstimate, probability_high: band.pointEstimate });
  }
  return checkNoFreelancedProbability(reasoningText, allowed);
}

// ---------------------------------------------------------------------------
// Chat-specific gate: portfolio figure drift.
//
// Only in play when ENABLE_PORTFOLIO_CONTEXT is on AND a PORTFOLIO_SUMMARY
// block was injected this turn (lib/ai/portfolio-summary.ts, and
// docs/decisions/2026-09-04-ai-portfolio-figures.md option (c) rule #4). The
// model is then handed real, code-computed portfolio figures and told to
// restate them verbatim. This fails the turn CLOSED if the model emits:
//   - any "$" dollar figure that is not one of those exact computed values, or
//   - a percentage inside a clause about the reader's own position/portfolio
//     that is not one of them.
// A flagged turn is rewritten to safe boilerplate like every other scope-guard
// failure - nothing drifted ever reaches the user. This does NOT touch the
// advice-language detection above: it changes only which *numbers* the model
// may state, not which conclusions it may draw.
//
// `allowedFigures` is portfolioSummaryFigures() - normalized (digits + ".")
// tokens. An empty list means no portfolio block this turn, and this check is
// a no-op, so behaviour with the flag off is identical to before the feature.
// ---------------------------------------------------------------------------

/** Reduce a figure to a comparable token: "-$1,290.40" and "1290.40" both -> "1290.40". */
export function normalizePortfolioFigure(token: string): string {
  return token.replace(/[^0-9.]/g, "");
}

const MONEY_FIGURE = /\$\s?\d[\d,]*(?:\.\d+)?/g;
const PERCENT_FIGURE = /\d[\d,]*(?:\.\d+)?(?=\s?%)/g;

// A clause is "about the reader's own position" when it puts "your" in front of
// a portfolio/return noun (up to three qualifier words between). Scoped this
// tightly on purpose: a percentage in "semiconductors fell 4.2%" is ordinary
// market description and must not be touched, only "your portfolio is up 3.1%".
const READER_POSITION_CLAUSE =
  /\byour\s+(?:[\w-]+\s+){0,3}(?:portfolio|position|positions|holding|holdings|stake|account|p&l|pnl|return|returns|gain|gains|loss|losses|cost\s+basis)\b/i;

export function checkPortfolioFigureDrift(text: string, allowedFigures: string[]): ScopeGuardResult {
  if (allowedFigures.length === 0) return { passed: true, reason: null };
  const allowed = new Set(allowedFigures);

  for (const match of text.matchAll(MONEY_FIGURE)) {
    if (!allowed.has(normalizePortfolioFigure(match[0]))) {
      return { passed: false, reason: "portfolio_figure_not_in_summary", evidence: match[0] };
    }
  }

  for (const clause of splitClauses(text)) {
    if (!READER_POSITION_CLAUSE.test(clause)) continue;
    for (const match of clause.matchAll(PERCENT_FIGURE)) {
      if (!allowed.has(normalizePortfolioFigure(match[0]))) {
        return { passed: false, reason: "portfolio_percent_not_in_summary", evidence: clause };
      }
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
  /**
   * The analysis's history line ("Higher 2 weeks later in 9 of 14 similar
   * moments."). When present it replaces the >=5% range in the rewrite: that
   * range is a Premium trader figure and never goes back to a chat reader.
   */
  history_line?: string;
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
        a.history_line
          ? `- ${a.scope_type} · ${a.scope_value}: ${a.reasoning_text} ${a.history_line} (${a.confidence_level} confidence)`
          : `- ${a.scope_type} · ${a.scope_value}: ${a.probability_low}-${a.probability_high}% (${a.confidence_level} confidence) - ${a.reasoning_text}`,
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
