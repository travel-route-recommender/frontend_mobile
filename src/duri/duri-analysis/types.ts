import type {
  EntityId,
  ISODateString,
  ItineraryItem,
  Place,
  TimeString,
  TripCandidate,
  TripRoom,
  TripTransport,
  User,
  UserPreferenceResult,
} from "../../domain";
import type { GroupPlanningProfile, GroupPreferenceDiagnosis } from "../group-preferences";

export type AnalysisStatus = "good" | "attention" | "warning" | "insufficient-data";
export type AnalysisCategory = "route" | "density" | "meal" | "preference";
export type AnalysisSeverity = "info" | "low" | "medium" | "high";

export interface AnalysisEvidence {
  label: string;
  value: string;
  source?: string;
  observedAt?: string;
  itemIds?: EntityId[];
  placeIds?: EntityId[];
  memberIds?: EntityId[];
}

export interface AnalysisTechnicalVariable {
  /** LaTeX 수식에서 사용하는 짧은 기호다. */
  symbol: string;
  /** 일반 사용자가 이해할 수 있는 변수 이름이다. */
  label: string;
  /** 스냅샷에 사용한 원시 값. 문자열은 구간·목록처럼 단일 숫자가 아닌 경우다. */
  value: number | string;
  formattedValue: string;
  unit?: string;
  source: string;
}

export interface AnalysisTechnicalDetails {
  model: string;
  /** 표시 계층에서 렌더링하는 LaTeX 식. 사용자 입력을 HTML로 삽입하지 않는다. */
  formulaLatex: string;
  /** 현재 분석 스냅샷의 숫자를 대입한 LaTeX 식. */
  substitutedLatex?: string;
  variables: AnalysisTechnicalVariable[];
  steps: string[];
  result: string;
  complexity?: string;
  caveats: string[];
}

export interface AnalysisIssue {
  id: string;
  category: AnalysisCategory;
  status: AnalysisStatus;
  severity: AnalysisSeverity;
  title: string;
  summary: string;
  date?: string;
  affectedItemIds: EntityId[];
  affectedPlaceIds: EntityId[];
  affectedMemberIds: EntityId[];
  evidence: AnalysisEvidence[];
  suggestionSupported?: boolean;
  constraintType?: "hard" | "soft" | "informational";
  confidence?: "high" | "medium" | "low" | "unknown";
  technicalDetails?: AnalysisTechnicalDetails;
}

export interface CategoryAnalysisResult {
  category: AnalysisCategory;
  status: AnalysisStatus;
  score?: number;
  summary: string;
  issues: AnalysisIssue[];
}

export interface DuriAnalysisResult {
  tripId: EntityId;
  overallStatus: AnalysisStatus;
  overallMessage: string;
  analyzedItemCount: number;
  groupPlanningProfile: GroupPlanningProfile;
  route: CategoryAnalysisResult;
  density: CategoryAnalysisResult;
  meal: CategoryAnalysisResult;
  preference: CategoryAnalysisResult;
}

/**
 * 사용자가 직접 확인했거나 문서 추출 결과를 사용자가 확인한 사실만 넣는다.
 * 파일 종류나 OCR 추정값만으로는 이 타입을 만들지 않는다.
 */
export interface ConfirmedScheduleConstraint {
  id: EntityId;
  kind: "reservation" | "train" | "bus" | "rental-car-return" | "mandatory-place";
  label: string;
  source: "user-confirmed" | "document-confirmed";
  date: ISODateString;
  startTime?: TimeString;
  /** 사용자가 확인한 예약 종료 시각. 시작 시각과 함께 있을 때만 사용한다. */
  endTime?: TimeString;
  itineraryItemId?: EntityId;
  placeId?: EntityId;
  sourceDocumentId?: EntityId;
  confirmedAt: string;
}

export type RouteTimingBasis =
  | "current-traffic"
  | "future-departure"
  | "time-independent-transit";

/** 특정 일정 쌍에 대해 외부 경로 공급자가 반환한 원시 초 단위 결과다. */
export interface RouteLegEstimate {
  fromItemId: EntityId;
  toItemId: EntityId;
  date: ISODateString;
  departureTime: TimeString;
  mode: TripTransport;
  durationSeconds: number;
  distanceMeters: number;
  /** 자동차 경로 응답의 통행료 추정치. 값이 없으면 비용을 0원으로 간주하지 않는다. */
  tollFareWon?: number;
  /** 같은 자동차 경로를 택시로 이용할 때의 추정 요금. 여행방의 실제 결제액은 아니다. */
  taxiFareWon?: number;
  walkingSeconds?: number;
  transferCount?: number;
  provider: "kakao-mobility" | "kakao-public-transit";
  timingBasis: RouteTimingBasis;
  fetchedAt: string;
}

/** 현재 순서와 인접 한 쌍을 바꾼 순서를 같은 경로 근거로 비교한 결과다. */
export interface RouteOrderEvaluation {
  date: ISODateString;
  itemIds: EntityId[];
  swappedItemIds: [EntityId, EntityId];
  currentDurationSeconds: number;
  alternativeDurationSeconds: number;
  /** 바뀐 순서에서 실제로 달라지는 간선별 ETA와 연속 사용 가능 시간. */
  alternativeLegs: {
    fromItemId: EntityId;
    toItemId: EntityId;
    durationSeconds: number;
    availableSeconds: number;
  }[];
  provider: RouteLegEstimate["provider"];
  timingBasis: RouteTimingBasis;
  fetchedAt: string;
}

/** 분석 실행 중 TourAPI 상세에서 직접 수집한 장소 사실이다. 로컬 Place 표시값과 분리한다. */
export interface PlaceConstraintEvidence {
  placeId: EntityId;
  provider: "tour-api";
  fetchedAt: string;
  restDateText?: string;
  operatingHoursText?: string;
  recommendedDurationText?: string;
  eventStartDate?: ISODateString;
  eventEndDate?: ISODateString;
  parkingText?: string;
  parkingFeeText?: string;
  usageFeeText?: string;
  checkInTimeText?: string;
  checkOutTimeText?: string;
}

/**
 * 한국관광공사 관광지 집중률 예측에서 일정 날짜와 정확히 일치한 값이다.
 * rate는 절대 방문자 수나 대기시간이 아니라, 해당 관광지의 과거 가장 붐빈
 * 시기를 100으로 둔 상대 예측값이다.
 */
export interface PlaceCongestionEvidence {
  placeId: EntityId;
  tourContentId: string;
  date: ISODateString;
  rate: number;
  /** 같은 API 응답의 유효한 예측일 중 높은 순위. 동률은 같은 순위다. */
  forecastRank: number;
  comparedDayCount: number;
  isForecastPeak: boolean;
  provider: "tourism-data-lab";
  fetchedAt: string;
}

export interface DuriDocumentReference {
  id: EntityId;
  kind: "accommodation" | "admission" | "train" | "bus" | "rental-car" | "other";
  itineraryItemIds: EntityId[];
  /**
   * 문서 종류를 해석하지 못하더라도 연결된 일정의 자동 이동·재배치를 막아야 하는지 여부.
   * 서버 일정 티켓처럼 "첨부 존재"만 확실한 경우에 사용하며 예약 시각 자체를 추정하지 않는다.
   */
  orderProtected?: boolean;
  extractionStatus?: "processing" | "unsupported" | "failed" | "needs-review" | "confirmed" | "not-requested";
  confirmedFactIds?: EntityId[];
  pendingReviewFactIds?: EntityId[];
}

export interface DuriEvidenceCollection {
  route: {
    requiredLegCount: number;
    analyzedLegCount: number;
    mode: TripTransport;
    provider?: RouteLegEstimate["provider"];
    timingBasis?: RouteTimingBasis;
    unavailableReason?: string;
  };
  placeDetails: {
    scheduledPlaceCount: number;
    requestedPlaceCount: number;
    fetchedPlaceCount: number;
    usablePlaceCount: number;
    operatingFactPlaceCount: number;
    durationFactPlaceCount: number;
    provider?: "tour-api";
    unavailableReason?: string;
  };
  congestion?: {
    scheduledPlaceDateCount: number;
    requestedPlaceCount: number;
    fetchedPlaceCount: number;
    usablePlaceCount: number;
    matchedPlaceDateCount: number;
    provider?: "tourism-data-lab";
    unavailableReason?: string;
  };
}

export type SharedPreferenceEvidenceStatus = "loaded" | "unavailable" | "stale";

export type SharedPreferenceAxisId =
  | "scheduleDensity"
  | "landmarkNecessity"
  | "localInterest"
  | "challenging";

/**
 * 서버가 원본 설문 대신 공유하는 파생 축입니다. value만 떼어 쓰지 않고 측정
 * 범위·해상도·산출법을 함께 보존하여 0점과 미응답(null)을 구분합니다.
 */
export interface SharedPreferenceAxisEvidence {
  value: number;
  unit: "score";
  range: readonly [number, number];
  resolution: number;
  source: "quiz";
  method: "rule-based-4axis";
}

export interface SharedPreferenceMemberEvidence {
  userId: EntityId;
  nickname: string | null;
  travelType: {
    name: string;
    tags: string[];
    emoji: string;
  } | null;
  personalityAxes: Record<SharedPreferenceAxisId, SharedPreferenceAxisEvidence> | null;
  mobilityConstraints: {
    values: string[];
    status: "present" | "missing" | "stale";
    source: string;
    version: number;
    updatedAt: string | null;
  };
  preferenceUpdatedAt: string | null;
  interestTags: string[];
}

export interface SharedCandidateMemberSignal {
  userId: EntityId;
  mustVisit: boolean | null;
  avoid: boolean | null;
  preferenceStrength: 1 | 2 | 3 | 4 | 5 | null;
  version: number;
  updatedAt: string | null;
}

export interface SharedCandidatePreferenceEvidence {
  placeId: EntityId;
  signals: SharedCandidateMemberSignal[];
}

/** 서버 room facts와 같은 revision에 묶인 공유 성향 증거 묶음입니다. */
export interface SharedDuriPreferenceEvidence {
  roomId: EntityId;
  factsVersion: number;
  scheduleVersion: number;
  members: SharedPreferenceMemberEvidence[];
  candidateSignals: SharedCandidatePreferenceEvidence[];
}

export interface DuriAnalysisInput {
  /**
   * 입력을 제공한 원본의 불투명한 revision입니다. API 일정처럼 내용이 같아도
   * 서버 revision이 달라질 수 있는 경우 stale 결과를 구분하는 데만 사용합니다.
   */
  sourceRevision?: string;
  /** API 분석 입력을 만든 room facts revision. 0도 유효한 revision이다. */
  sourceFactsVersion?: number;
  /**
   * API 여행방의 공유 Backend planning을 읽은 상태입니다. 필드명은 기존 분석
   * snapshot 호환을 위해 유지합니다. 값이 없으면 mock/local Store처럼 `trip`
   * 자체가 신뢰 가능한 원본임을 뜻합니다. `missing`과
   * `unavailable`에서는 기본값으로 채운 이동수단을 분석 근거로 사용하지 않습니다.
   */
  localPlanningFactsStatus?: "loaded" | "missing" | "unavailable";
  /**
   * API 일정의 기기 전용 잠금 overlay를 읽은 상태입니다. 읽기에 실패하면 잠금이
   * 없다고 단정할 수 없으므로 순서 최적화 판단을 생략합니다.
   */
  scheduleOverlayStatus?: "loaded" | "missing" | "unavailable";
  /** 공유 성향을 읽은 상태. stale/unavailable 값은 분석 근거로 사용하지 않는다. */
  sharedPreferenceEvidenceStatus?: SharedPreferenceEvidenceStatus;
  /** 로컬 UserPreferenceResult와 섞거나 변환하지 않는 서버 파생 증거. */
  sharedPreferenceEvidence?: SharedDuriPreferenceEvidence;
  trip: TripRoom;
  members: User[];
  placesById: Record<EntityId, Place>;
  candidates: TripCandidate[];
  itinerary: ItineraryItem[];
  preferenceResults: Record<EntityId, UserPreferenceResult>;
  confirmedScheduleConstraints?: ConfirmedScheduleConstraint[];
  routeLegEstimates?: RouteLegEstimate[];
  routeOrderEvaluations?: RouteOrderEvaluation[];
  placeConstraintEvidence?: PlaceConstraintEvidence[];
  placeCongestionEvidence?: PlaceCongestionEvidence[];
  documentReferences?: DuriDocumentReference[];
  /** 문서함 조회 성공(빈 목록 포함)과 조회 실패를 구분한다. */
  documentCollectionStatus?: "loaded" | "unavailable";
  evidenceCollection?: DuriEvidenceCollection;
  groupPreferenceDiagnosis?: GroupPreferenceDiagnosis;
  groupPlanningProfile?: GroupPlanningProfile;
}
