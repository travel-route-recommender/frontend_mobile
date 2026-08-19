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

export interface DuriAnalysisInput {
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
  evidenceCollection?: DuriEvidenceCollection;
  groupPreferenceDiagnosis?: GroupPreferenceDiagnosis;
  groupPlanningProfile?: GroupPlanningProfile;
}
