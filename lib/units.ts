// 단원 목록 데이터 (개발 단위 1)
// PRD 6번 범위: 고1 수학(공통수학1·공통수학2)과 기하만 다룬다.
// 단원 이름은 2022 개정 교육과정 기준이며, 학생은 이 목록에서만 단원을 고른다.

/** 과목 이름 */
export type Subject = "공통수학1" | "공통수학2" | "기하";

/** 단원 하나의 정보 */
export type Unit = {
  /** 단원을 구분하는 고유 값 (서버로 보낼 때 이 값을 쓴다) */
  id: string;
  /** 과목 */
  subject: Subject;
  /** 대단원 이름 */
  chapter: string;
  /** 중단원 이름 (화면에 보여주는 단원 이름) */
  name: string;
  /** 이 단원에서 다루는 핵심 개념 (AI가 단원 밖 문제를 내지 않도록 알려줄 때 쓴다) */
  topics: string[];
};

/** 전체 단원 목록 (배우는 순서대로) */
export const UNITS: Unit[] = [
  // ── 공통수학1 ──
  {
    id: "c1-polynomial-operations",
    subject: "공통수학1",
    chapter: "다항식",
    name: "다항식의 연산",
    topics: ["다항식의 덧셈과 뺄셈", "다항식의 곱셈과 곱셈 공식", "다항식의 나눗셈"],
  },
  {
    id: "c1-remainder-theorem",
    subject: "공통수학1",
    chapter: "다항식",
    name: "나머지정리",
    topics: ["항등식", "나머지정리", "인수정리", "조립제법"],
  },
  {
    id: "c1-factorization",
    subject: "공통수학1",
    chapter: "다항식",
    name: "인수분해",
    topics: ["인수분해 공식", "복잡한 식의 인수분해"],
  },
  {
    id: "c1-complex-quadratic",
    subject: "공통수학1",
    chapter: "방정식과 부등식",
    name: "복소수와 이차방정식",
    topics: ["복소수와 그 연산", "이차방정식의 판별식", "근과 계수의 관계"],
  },
  {
    id: "c1-quadratic-function",
    subject: "공통수학1",
    chapter: "방정식과 부등식",
    name: "이차방정식과 이차함수",
    topics: ["이차함수의 그래프와 x축의 위치 관계", "이차함수의 그래프와 직선의 위치 관계", "이차함수의 최대·최소"],
  },
  {
    id: "c1-equations-inequalities",
    subject: "공통수학1",
    chapter: "방정식과 부등식",
    name: "여러 가지 방정식과 부등식",
    topics: ["삼차방정식과 사차방정식", "연립이차방정식", "연립일차부등식", "이차부등식"],
  },
  {
    id: "c1-counting",
    subject: "공통수학1",
    chapter: "경우의 수",
    name: "경우의 수",
    topics: ["합의 법칙", "곱의 법칙"],
  },
  {
    id: "c1-permutation-combination",
    subject: "공통수학1",
    chapter: "경우의 수",
    name: "순열과 조합",
    topics: ["순열", "조합"],
  },
  {
    id: "c1-matrix",
    subject: "공통수학1",
    chapter: "행렬",
    name: "행렬과 그 연산",
    topics: ["행렬의 뜻", "행렬의 덧셈·뺄셈·실수배", "행렬의 곱셈"],
  },

  // ── 공통수학2 ──
  {
    id: "c2-plane-coordinates",
    subject: "공통수학2",
    chapter: "도형의 방정식",
    name: "평면좌표",
    topics: ["두 점 사이의 거리", "선분의 내분점", "삼각형의 무게중심"],
  },
  {
    id: "c2-line-equation",
    subject: "공통수학2",
    chapter: "도형의 방정식",
    name: "직선의 방정식",
    topics: ["직선의 방정식", "두 직선의 평행과 수직", "점과 직선 사이의 거리"],
  },
  {
    id: "c2-circle-equation",
    subject: "공통수학2",
    chapter: "도형의 방정식",
    name: "원의 방정식",
    topics: ["원의 방정식", "원과 직선의 위치 관계", "원의 접선의 방정식"],
  },
  {
    id: "c2-transformation",
    subject: "공통수학2",
    chapter: "도형의 방정식",
    name: "도형의 이동",
    topics: ["평행이동", "대칭이동"],
  },
  {
    id: "c2-sets",
    subject: "공통수학2",
    chapter: "집합과 명제",
    name: "집합",
    topics: ["집합의 뜻과 포함 관계", "집합의 연산"],
  },
  {
    id: "c2-propositions",
    subject: "공통수학2",
    chapter: "집합과 명제",
    name: "명제",
    topics: ["명제와 조건", "필요조건과 충분조건", "명제의 증명", "절대부등식"],
  },
  {
    id: "c2-functions",
    subject: "공통수학2",
    chapter: "함수와 그래프",
    name: "함수",
    topics: ["함수의 뜻과 그래프", "합성함수", "역함수"],
  },
  {
    id: "c2-rational-irrational",
    subject: "공통수학2",
    chapter: "함수와 그래프",
    name: "유리함수와 무리함수",
    topics: ["유리식과 유리함수", "무리식과 무리함수"],
  },

  // ── 기하 ──
  {
    id: "g-conic-sections",
    subject: "기하",
    chapter: "이차곡선",
    name: "이차곡선",
    topics: ["포물선", "타원", "쌍곡선"],
  },
  {
    id: "g-conic-tangent",
    subject: "기하",
    chapter: "이차곡선",
    name: "이차곡선과 직선",
    topics: ["이차곡선과 직선의 위치 관계", "이차곡선의 접선의 방정식"],
  },
  {
    id: "g-space-figures",
    subject: "기하",
    chapter: "공간도형과 공간좌표",
    name: "공간도형",
    topics: ["직선과 평면의 위치 관계", "삼수선의 정리", "정사영"],
  },
  {
    id: "g-space-coordinates",
    subject: "기하",
    chapter: "공간도형과 공간좌표",
    name: "공간좌표",
    topics: ["공간에서 두 점 사이의 거리", "공간에서 선분의 내분점", "구의 방정식"],
  },
  {
    id: "g-vector-operations",
    subject: "기하",
    chapter: "벡터",
    name: "벡터의 연산",
    topics: ["벡터의 뜻", "벡터의 덧셈·뺄셈·실수배", "위치벡터", "벡터의 성분"],
  },
  {
    id: "g-vector-dot-product",
    subject: "기하",
    chapter: "벡터",
    name: "벡터의 내적",
    topics: ["벡터의 내적", "두 벡터가 이루는 각", "두 벡터의 수직 조건"],
  },
  {
    id: "g-vector-figures",
    subject: "기하",
    chapter: "벡터",
    name: "도형의 방정식과 벡터",
    topics: ["벡터를 이용한 직선의 방정식", "벡터를 이용한 원의 방정식"],
  },
];

/** id로 단원을 찾는다. 목록에 없으면 undefined를 돌려준다. */
export function findUnit(id: string): Unit | undefined {
  return UNITS.find((unit) => unit.id === id);
}

/** 목록에 있는 단원인지 확인한다. (서버에서 범위 밖 입력을 막을 때 쓴다) */
export function isValidUnitId(id: string): boolean {
  return UNITS.some((unit) => unit.id === id);
}

/** 화면의 선택 목록을 과목별로 묶어서 보여줄 때 쓴다. */
export function getUnitsBySubject(subject: Subject): Unit[] {
  return UNITS.filter((unit) => unit.subject === subject);
}
