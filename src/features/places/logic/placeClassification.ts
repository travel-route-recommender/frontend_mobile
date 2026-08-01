import type { Place, PlaceClassification } from "../../../domain";

export type PlaceClassificationTreeItem = {
  code: string;
  name: string;
  children: PlaceClassificationMiddleItem[];
};

export type PlaceClassificationMiddleItem = {
  code: string;
  name: string;
  children: PlaceClassificationLeafItem[];
};

export type PlaceClassificationLeafItem = {
  code: string;
  name: string;
};

export type PlaceClassificationSelection = {
  value: string;
  label: string;
  level: "large" | "middle" | "small";
  lclsSystm1: string;
  lclsSystm2?: string;
  lclsSystm3?: string;
};

export type PlaceClassificationLookup = Readonly<Record<string, string>>;

export const FESTIVAL_CLASSIFICATION_CODE = "EV";

const largeClassificationLabelByCode: Readonly<Record<string, string>> = {
  AC: "숙박",
  C01: "추천코스",
  [FESTIVAL_CLASSIFICATION_CODE]: "축제/공연/행사",
  EX: "체험관광",
  FD: "음식",
  HS: "역사관광",
  LS: "레저스포츠",
  NA: "자연관광",
  SH: "쇼핑",
  VE: "문화관광",
};

const largeClassificationOrder = ["NA", "HS", "VE", "EX", FESTIVAL_CLASSIFICATION_CODE, "FD", "LS", "AC", "SH", "C01"];

function cleanText(value?: string) {
  return (value ?? "").trim();
}

function compactLabels(values: readonly (string | undefined)[]) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const label = cleanText(value);
    if (!label || seen.has(label) || /^[A-Z0-9]+$/i.test(label)) return [];
    seen.add(label);
    return [label];
  });
}

export function getLargeClassificationLabel(code?: string) {
  if (!code) return "";
  return largeClassificationLabelByCode[code] ?? code;
}

export function sortClassificationTree(tree: readonly PlaceClassificationTreeItem[]) {
  return [...tree].sort((left, right) => {
    const leftOrder = largeClassificationOrder.indexOf(left.code);
    const rightOrder = largeClassificationOrder.indexOf(right.code);
    return (leftOrder === -1 ? 900 : leftOrder) - (rightOrder === -1 ? 900 : rightOrder)
      || left.name.localeCompare(right.name, "ko");
  });
}

export function buildClassificationLookup(tree: readonly PlaceClassificationTreeItem[]): PlaceClassificationLookup {
  const entries: [string, string][] = [];
  tree.forEach((large) => {
    entries.push([large.code, large.name]);
    large.children.forEach((middle) => {
      entries.push([middle.code, middle.name]);
      middle.children.forEach((small) => entries.push([small.code, small.name]));
    });
  });
  return Object.fromEntries(entries);
}

export function getClassificationSelectionValue(input: Pick<PlaceClassificationSelection, "lclsSystm1" | "lclsSystm2" | "lclsSystm3">) {
  return [input.lclsSystm1, input.lclsSystm2 ?? "", input.lclsSystm3 ?? ""].join("::");
}

export function classificationSelectionFromLarge(large: PlaceClassificationTreeItem): PlaceClassificationSelection {
  return {
    value: getClassificationSelectionValue({ lclsSystm1: large.code }),
    label: large.name,
    level: "large",
    lclsSystm1: large.code,
  };
}

export function classificationSelectionFromMiddle(large: PlaceClassificationTreeItem, middle: PlaceClassificationMiddleItem): PlaceClassificationSelection {
  return {
    value: getClassificationSelectionValue({ lclsSystm1: large.code, lclsSystm2: middle.code }),
    label: `${large.name} · ${middle.name}`,
    level: "middle",
    lclsSystm1: large.code,
    lclsSystm2: middle.code,
  };
}

export function classificationSelectionFromLeaf(large: PlaceClassificationTreeItem, middle: PlaceClassificationMiddleItem, leaf: PlaceClassificationLeafItem): PlaceClassificationSelection {
  return {
    value: getClassificationSelectionValue({ lclsSystm1: large.code, lclsSystm2: middle.code, lclsSystm3: leaf.code }),
    label: `${large.name} · ${middle.name} · ${leaf.name}`,
    level: "small",
    lclsSystm1: large.code,
    lclsSystm2: middle.code,
    lclsSystm3: leaf.code,
  };
}

export function resolvePlaceClassification(classification?: PlaceClassification, lookup: PlaceClassificationLookup = {}) {
  if (!classification) return undefined;
  const lclsSystm1 = cleanText(classification.lclsSystm1);
  const lclsSystm2 = cleanText(classification.lclsSystm2);
  const lclsSystm3 = cleanText(classification.lclsSystm3);
  if (!lclsSystm1 && !lclsSystm2 && !lclsSystm3) return undefined;
  return {
    ...(lclsSystm1 ? { lclsSystm1, lclsSystm1Name: cleanText(classification.lclsSystm1Name) || lookup[lclsSystm1] || getLargeClassificationLabel(lclsSystm1) } : {}),
    ...(lclsSystm2 ? { lclsSystm2, lclsSystm2Name: cleanText(classification.lclsSystm2Name) || lookup[lclsSystm2] } : {}),
    ...(lclsSystm3 ? { lclsSystm3, lclsSystm3Name: cleanText(classification.lclsSystm3Name) || lookup[lclsSystm3] } : {}),
  } satisfies PlaceClassification;
}

export function buildPlaceClassificationTags(place: Pick<Place, "classification">, lookup: PlaceClassificationLookup = {}) {
  const classification = resolvePlaceClassification(place.classification, lookup);
  if (!classification) return [];
  return compactLabels([
    classification.lclsSystm1Name,
    classification.lclsSystm2Name,
    classification.lclsSystm3Name,
  ]);
}

export function enrichPlaceClassificationTags(place: Place, lookup: PlaceClassificationLookup = {}): Place {
  const classification = resolvePlaceClassification(place.classification, lookup);
  if (!classification) return place;
  const tags = [...new Set([...buildPlaceClassificationTags({ classification }, lookup), ...place.tags])];
  return { ...place, classification, tags };
}

export function matchesPlaceClassification(place: Place, selection?: PlaceClassificationSelection) {
  if (!selection) return true;
  const classification = place.classification;
  if (!classification?.lclsSystm1) return false;
  if (classification.lclsSystm1 !== selection.lclsSystm1) return false;
  if (selection.lclsSystm2 && classification.lclsSystm2 !== selection.lclsSystm2) return false;
  if (selection.lclsSystm3 && classification.lclsSystm3 !== selection.lclsSystm3) return false;
  return true;
}

export function matchesPlaceClassifications(place: Place, selections?: readonly PlaceClassificationSelection[]) {
  if (!selections?.length) return true;
  return selections.some((selection) => matchesPlaceClassification(place, selection));
}

export function getPlaceClassificationSelectionValues(place: Pick<Place, "classification">) {
  const classification = place.classification;
  if (!classification?.lclsSystm1) return [];
  const values = [getClassificationSelectionValue({ lclsSystm1: classification.lclsSystm1 })];
  if (classification.lclsSystm2) values.push(getClassificationSelectionValue({ lclsSystm1: classification.lclsSystm1, lclsSystm2: classification.lclsSystm2 }));
  if (classification.lclsSystm2 && classification.lclsSystm3) values.push(getClassificationSelectionValue({ lclsSystm1: classification.lclsSystm1, lclsSystm2: classification.lclsSystm2, lclsSystm3: classification.lclsSystm3 }));
  return values;
}
