# 도전·안정 접근 방식 분류 모델

이 폴더는 IPIP-NEO-120 응답 데이터에서 `O4 모험성`, `E5 자극추구`,
`C6 신중성`을 사용해 다음 세 유형을 구성하고, 앱의 6문항으로 이를
재현하는 축약형 결정트리를 학습한다.

- 도전 실행형
- 신중 탐색형
- 안정 계획형

## 입력 문항

앱은 `i18`, `i48`, `i22`, `i52`, `i90`, `i120`의 5점 원응답을
수집한다. 원 CSV에서는 부정 문항이 이미 특성 방향으로 변환되어 있다.
따라서 앱 추론 어댑터에서만 `i48`, `i90`, `i120`을 `6 - 응답`으로
변환한다.

## 학습 과정

1. O4·E5·C6 전체 12문항이 모두 1~5인 행만 사용한다.
2. 세 하위척도의 평균을 표준화하고 K-means로 세 잠재 집단을 만든다.
3. 군집 중심의 상대적인 O4·E5·C6 패턴을 세 서비스 유형에 연결한다.
4. 80% 학습·20% 평가 분할에서 6문항 결정트리가 교사 군집을 예측한다.
5. 여러 최대 깊이를 비교하고 최고 정확도에서 0.2% 이내인 가장 작은
   트리를 JSON으로 내보낸다.

평가 정확도는 실제 여행 행동 정확도가 아니라 **12문항 군집 판정을
6문항으로 재현한 일치율**이다. 이 모델을 진단, 채용, 보험 등 중요한
개인 의사결정에 사용해서는 안 된다.

## 실행

```bash
python modeling/challenge_style/train_model.py \
  --dataset /path/to/IPIP_NEO_120.csv
```

모델은 아래 두 위치에 같은 내용으로 생성된다.

- `modeling/challenge_style/artifacts/challenge_style_decision_tree.json`
- `src/features/preferences/model/challenge-style-decision-tree.json`

## Random Forest 비교 실험

기존 결정트리는 그대로 유지한다. 별도 실험 스크립트는 같은 K-means 교사
라벨, 같은 6개 입력 특성, 같은 80/20 분할을 사용하고 행 부트스트랩과
노드별 무작위 특성 선택을 적용한다.

```bash
python modeling/challenge_style/train_random_forest.py \
  --dataset /path/to/IPIP_NEO_120.csv
```

현재 후보는 16개 트리, 최대 깊이 10, 노드당 후보 특성 3개를 사용한다.
116,753개 평가 행에서 단일 결정트리 대비 결과는 다음과 같다.

| 모델 | 정확도 | Macro F1 | 런타임 모델 크기 |
| --- | ---: | ---: | ---: |
| 단일 결정트리 | 0.819474 | 0.817754 | 81,685 bytes (minified) |
| Random Forest | 0.822377 | 0.820827 | 1,057,179 bytes |

Random Forest는 정확도 `+0.002903`, Macro F1 `+0.003073`이지만 모델이
약 12.9배 크다. 앱의 기본 분류기는 아직 단일 결정트리를 사용하며,
Random Forest 추론기는 비교·후속 전환을 위한 별도 함수로만 제공한다.

Random Forest 모델은 아래 두 위치에 같은 내용으로 생성된다.

- `modeling/challenge_style/artifacts/challenge_style_random_forest.json`
- `src/features/preferences/model/challenge-style-random-forest.json`

## 교사 군집화 방식 비교

`compare_teacher_clusterers.py`는 K-means, Hierarchical, DBSCAN, GMM에
동일한 O4·E5·C6 표준화 점수를 제공한다. 각 군집 결과는 같은 6문항,
같은 80/20 분할, 같은 단일 결정트리로 재현한다.

```bash
python modeling/challenge_style/compare_teacher_clusterers.py \
  --dataset /path/to/IPIP_NEO_120.csv
```

비지도 군집에는 실제 여행 행동 정답이 없으므로 아래 두 종류의 수치를
구분해야 한다.

- 군집 품질: Silhouette는 높을수록, Davies-Bouldin은 낮을수록 좋다.
- 학생 성능: 6문항 결정트리가 해당 군집 라벨을 재현하는 정도다.

| 교사 군집 | Silhouette | Davies-Bouldin | 학생 정확도 | 학생 Macro F1 |
| --- | ---: | ---: | ---: | ---: |
| K-means | 0.281539 | 1.182976 | 0.819474 | 0.817754 |
| Hierarchical | 0.218053 | 1.222002 | 0.826009 | 0.802649 |
| DBSCAN + 후처리 | 0.239455 | 1.339653 | 0.805574 | 0.803510 |
| GMM | 0.176897 | 1.538962 | 0.817548 | 0.806943 |

Hierarchical은 128개 가중 마이크로 군집을 Ward 방식으로 합친 근사
구현이다. 정확도는 가장 높지만 도전 실행형이 51.3%를 차지해 Macro F1이
낮고, 군집 품질도 K-means보다 낮다.

DBSCAN은 60개 설정에서 자연스러운 3군집을 만들지 못했다. 선택된 원본
설정도 4개 군집과 91.2% 노이즈였기 때문에 Ward 병합과 최근접 군집
노이즈 배정을 거쳐야만 3유형 비교가 가능했다. 따라서 현재 데이터에는
3유형 교사로 적합하지 않다.

GMM은 full covariance, 5개 초기값으로 256회에 수렴했다. 한 유형이
51.8%로 쏠렸고 모든 군집 품질 지표와 학생 Macro F1이 K-means보다
낮았다. 현재 비교에서는 K-means를 유지하는 것이 가장 타당하다.

전체 중심점, 유형 분포, 혼동행렬, ARI/NMI 및 알고리즘 세부값은
`artifacts/teacher_clusterer_comparison.json`에 저장된다.

## 근거 자료

- https://ipip.ori.org/30FacetNEO-PI-RItems.htm
- https://doi.org/10.1016/j.jrp.2014.05.003
