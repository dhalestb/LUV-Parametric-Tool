export type ComparedForm = {
  formId: string;
  slotId: string;
  meshId: string;
  filename: string;
  geometryRevision: string;
  absoluteScore: number | null;
  /** Sequential: higher levels reached. Other descriptors leave this unset. */
  rankSecondary?: number | null;
  /** Circulation is a separate judgment. Null means this page did not evaluate it. */
  circulationFeasible: boolean | null;
  eligible: boolean;
  ineligibleReason?: string;
};

export type ExtremeSelection = {
  population: string;
  descriptorId: string;
  least: ComparedForm | null;
  most: ComparedForm | null;
  leastTies: ComparedForm[];
  mostTies: ComparedForm[];
  note: string;
};

const POPULATION = "Analyzed forms in the current Evaluations session. Sample slots and lattice alternatives are not mixed in.";

function finiteScore(form: ComparedForm) {
  return form.eligible && form.absoluteScore !== null && Number.isFinite(form.absoluteScore);
}

/**
 * Lowest and highest absolute descriptor scores.
 * Comparative rank is not reused: a tie-break rank must not pretend the scores differ.
 * Circulation feasibility is ignored so a monumental form can still fail circulation.
 */
export function selectDescriptorExtremes(descriptorId: string, forms: ComparedForm[]): ExtremeSelection {
  const eligible = forms.filter(finiteScore);
  const missing = forms.length - eligible.length;
  if (!eligible.length) {
    return {
      population: POPULATION,
      descriptorId,
      least: null,
      most: null,
      leastTies: [],
      mostTies: [],
      note: missing
        ? "No eligible score. Unevaluated, invalid, or missing results stay out of the comparison."
        : "No forms are available to compare.",
    };
  }
  const key = (form: ComparedForm): [number, number] => [
    form.absoluteScore as number,
    descriptorId === "sequential" ? (form.rankSecondary ?? 0) : 0,
  ];
  const compare = (left: ComparedForm, right: ComparedForm) => {
    const a = key(left);
    const b = key(right);
    if (a[0] !== b[0]) return a[0] - b[0];
    if (a[1] !== b[1]) return a[1] - b[1];
    return byId(left, right);
  };
  const sameKey = (left: ComparedForm, right: ComparedForm) => {
    const a = key(left);
    const b = key(right);
    return a[0] === b[0] && a[1] === b[1];
  };
  const sorted = [...eligible].sort(compare);
  const leastSeed = sorted[0];
  const mostSeed = sorted[sorted.length - 1];
  const leastTies = eligible.filter((form) => sameKey(form, leastSeed)).sort(byId);
  const mostTies = eligible.filter((form) => sameKey(form, mostSeed)).sort(byId);
  const same = leastTies.length === eligible.length;
  let note = `Compared ${eligible.length} eligible form${eligible.length === 1 ? "" : "s"}.`;
  if (missing) note += ` ${missing} form${missing === 1 ? " was" : "s were"} left out because a score was missing or the form was ineligible.`;
  if (eligible.length === 1) note += " Only one eligible form, so it is both the low and high result.";
  else if (same) note += descriptorId === "sequential"
    ? " Every eligible form has the same verified vertical gain and higher levels reached."
    : " Every eligible score is equal.";
  else if (leastTies.length > 1 || mostTies.length > 1) {
    note += descriptorId === "sequential"
      ? " Ties keep the same verified vertical gain and higher levels reached. The form with the lowest id is shown, and the other tied forms are listed."
      : " Ties keep the same score. The form with the lowest id is shown, and the other tied forms are listed.";
  }
  if (descriptorId === "sequential") note += " Ranked by verified vertical gain, then higher levels reached.";
  note += " Descriptor viability is not circulation feasibility.";
  return {
    population: POPULATION,
    descriptorId,
    least: leastTies[0] ?? null,
    most: mostTies[0] ?? null,
    leastTies,
    mostTies,
    note,
  };
}

function byId(left: ComparedForm, right: ComparedForm) {
  if (left.formId < right.formId) return -1;
  if (left.formId > right.formId) return 1;
  return left.meshId.localeCompare(right.meshId);
}

export type ViewMode = "section" | "model3d";

export type ComparisonControls = {
  descriptorId: string;
  mode: ViewMode;
  scaleMode: "physical" | "fit";
  showGold: boolean;
  showContext: boolean;
  sync: boolean;
};

export function initialComparisonControls(descriptorId: string): ComparisonControls {
  return {
    descriptorId,
    mode: "section",
    scaleMode: "physical",
    showGold: true,
    showContext: true,
    sync: true,
  };
}
