import type {
  ChallengeStyleQuestionId,
  ItineraryMessageQuestionId,
  PreferenceStepId,
} from "../types";

export type PreferenceCharacterPlacement = "left" | "right" | "together";

export type PreferenceCharacterPresentation = {
  id: "dusun" | "excited-dusun" | "shy-dusun" | "duri" | "together";
  name: "두순" | "두리" | "두리와 두순";
  accessibilityLabel: string;
  image: number;
  placement: PreferenceCharacterPlacement;
};

const characters = {
  dusun: {
    id: "dusun",
    name: "두순",
    accessibilityLabel: "여행 메이트 두순",
    image: require("../../../../assets/images/characters/dusun_image.webp"),
    placement: "left",
  },
  excitedDusun: {
    id: "excited-dusun",
    name: "두순",
    accessibilityLabel: "신이 난 여행 메이트 두순",
    image: require("../../../../assets/images/characters/excited_dusun_image.webp"),
    placement: "left",
  },
  shyDusun: {
    id: "shy-dusun",
    name: "두순",
    accessibilityLabel: "수줍게 웃는 여행 메이트 두순",
    image: require("../../../../assets/images/characters/shy_dusun_image.webp"),
    placement: "left",
  },
  duri: {
    id: "duri",
    name: "두리",
    accessibilityLabel: "여행 메이트 두리",
    image: require("../../../../assets/images/characters/duri_image.webp"),
    placement: "right",
  },
  together: {
    id: "together",
    name: "두리와 두순",
    accessibilityLabel: "함께 있는 여행 메이트 두리와 두순",
    image: require("../../../../assets/images/characters/duri_and_dusun_image.webp"),
    placement: "together",
  },
} as const satisfies Record<string, PreferenceCharacterPresentation>;

type StoryQuestionId = ChallengeStyleQuestionId | ItineraryMessageQuestionId;

const storyCharacterByQuestionId: Record<StoryQuestionId, PreferenceCharacterPresentation> = {
  i18: characters.together,
  i48: characters.shyDusun,
  i22: characters.excitedDusun,
  i52: characters.excitedDusun,
  i90: characters.duri,
  i120: characters.together,
  restaurant: characters.together,
  cafe: characters.shyDusun,
  shopping: characters.dusun,
  attraction: characters.duri,
  local: characters.dusun,
  experience: characters.excitedDusun,
  nature: characters.shyDusun,
  rest: characters.duri,
  density: characters.together,
};

const stepCharacterById: Record<PreferenceStepId, PreferenceCharacterPresentation> = {
  challengeStyle: characters.together,
  itinerary: characters.together,
  mobility: characters.duri,
  accommodation: characters.shyDusun,
  adventure: characters.excitedDusun,
  stamina: characters.duri,
  budget: characters.dusun,
  discovery: characters.excitedDusun,
};

export function getPreferenceStoryCharacter(questionId: StoryQuestionId) {
  return storyCharacterByQuestionId[questionId];
}

export function getPreferenceStepCharacter(stepId: PreferenceStepId) {
  return stepCharacterById[stepId];
}
