# PKOS · 나의지식서재

흩어진 수업 자료와 그때의 생각을 모아 두고 다시 꺼내 쓰는 개인 기록 서재입니다. 기본 기록은 각자의 브라우저에 저장되고, 선택한 경우 구글 계정으로 기기 간 동기화를 연결할 수 있습니다.

> 기록장·변환기·사이트 만들기의 사용법과 화면 사진, QR은 **PKOS 도구 모음**(https://legoschool.github.io/pkos-workshop/)에 모아 두었습니다.

## 바로 써 보기

| | |
|---|---|
| 체험 서재 (가상 기록 48개) | https://legoschool.github.io/pkos-library/?demo=1 |
| 내 서재 | https://legoschool.github.io/pkos-library/ |
| 사용 설명서와 80분 실습 | https://legoschool.github.io/pkos-library/manual/ |
| 설명서 PDF (A4) | https://legoschool.github.io/pkos-library/manual/PKOS-manual.pdf |

구글 동기화를 설정하기 전에는 기록이 처음 쓴 브라우저에만 남습니다. PC를 바꾸거나 인터넷 사용 기록을 지우기 전에는 「설정 · 백업 → 첨부를 포함한 백업 내보내기」로 백업 파일(`.pkem`)을 받아 두세요.

## 준비 조건

기록 쓰기와 정리, 지식맵, 백업 파일은 브라우저만 있으면 됩니다. 구글 드라이브에 있는 원본과 이어지는 기능은 PC에 [구글 드라이브 데스크톱](https://www.google.com/drive/download/)이 있어야 하고, 쓰는 폴더를 「오프라인으로 사용」으로 두어야 바로 열립니다. 「온라인에서만 사용 가능」으로 두면 파일을 열 때마다 내려받아 느리고, 인터넷이 끊기면 열리지 않습니다.

| 기능 | 필요한 것 |
|---|---|
| 기록 쓰기·정리·지식맵·백업 파일 | 브라우저만 |
| 카드의 「원본 열기」 | 그 파일을 볼 수 있는 구글 계정으로 브라우저 로그인 |
| 카드의 「탐색기」·「경로 복사」 | 구글 드라이브 데스크톱(파일 탐색기의 「Google Drive (G:)」). 「탐색기」는 탐색기 연결 도구도 설치 |
| 카드 파일 연결, PC 폴더 자동 백업 | PC의 크롬·엣지. 파일과 폴더가 드라이브에 있으면 구글 드라이브 데스크톱과 「오프라인으로 사용」 |

드라이브 폴더는 파일 탐색기에서 마우스 오른쪽 단추를 눌러 「오프라인 액세스 › 오프라인으로 사용」을 고르고, 폴더 아이콘에 초록색 체크 표시가 붙을 때까지 기다립니다. 오프라인으로 둔 폴더 크기만큼 PC 저장 공간을 씁니다. 순서와 화면은 사용 설명서의 「준비 조건」 장과 앱의 「서재 현황 › 준비 조건」에 있습니다.

## 내 주소로 운영하기 (5분)

같은 서재를 내 주소로 운영하고 싶을 때 이 저장소를 씁니다. 깃허브 계정만 있으면 되고 설치나 비용, 따로 설정할 열쇠는 필요 없습니다.

1. 깃허브에 로그인합니다. 계정이 없다면 https://github.com 에서 가입합니다.
2. 이 저장소 위쪽의 초록색 **Use this template**에서 **Create a new repository**를 누릅니다.
3. Repository name에 이름(예: `my-pkos`)을 적고 **Public**을 고른 뒤 **Create repository**를 누릅니다. 무료 계정은 공개 저장소에서만 사이트를 켤 수 있습니다. 공개 저장소에는 앱 파일만 들어가고 내 기록은 올라가지 않습니다.
4. 새 저장소의 **Settings**에서 왼쪽 **Pages**로 갑니다. Build and deployment의 Source는 **Deploy from a branch**로 두고 Branch에서 **main**과 **/ (root)**를 고른 뒤 **Save**를 누릅니다.
5. 1~2분 뒤 새로 고침하면 같은 화면 위쪽에 `https://내아이디.github.io/my-pkos/` 같은 주소가 나옵니다.
6. 그 주소 끝에 `?demo=1`을 붙여 체험 서재가, `manual/`을 붙여 설명서가 열리는지 확인합니다.

원본이 새 판으로 바뀔 때 따라가고 싶다면 2~3단계 대신 **Fork**로 가져가세요. 나중에 내 저장소 화면에서 **Sync fork**를 누르면 새 판을 받습니다. 파일만 필요하다면 **Code → Download ZIP**을 누르면 됩니다.

### 사본을 운영할 때 알아 둘 것

- **기록은 주소마다 따로 저장됩니다.** 내 주소에서 쓴 기록은 다른 주소의 서재에서 보이지 않습니다. 쓰던 기록은 백업 파일로 내보낸 뒤 내 주소의 「백업 파일 가져오기」로 옮기세요.
- **설명서 속 주소는 이 저장소의 주소입니다.** `manual/`의 실습 안내에 나오는 `https://legoschool.github.io/pkos-library/`는 내 주소로 바꿔 읽으면 됩니다. 실습 카드의 「원본 열기」는 이 저장소의 설명서를 엽니다.
- 받아쓰기만은 예외입니다. 브라우저의 음성 인식을 쓰기 때문에, 받아쓰는 동안의 말소리는 크롬이나 엣지를 만든 회사의 음성 서비스에서 처리될 수 있습니다.

## PDF·PPTX 페이지 미리보기

기록 작성 중 「첨부」로 PDF·PPTX를 넣고 파일 옆 미리보기 단추를 누르면 쪽별 작은 그림과 선택한 한 장을 봅니다. 이전·다음, 쪽 번호 이동, 쪽 목록 접기를 지원하며 읽기 화면에서도 엽니다. 파일은 외부 변환 서버로 보내지 않습니다.

옛 `.ppt`는 `.pptx` 또는 PDF로 저장한 사본이 필요합니다. PPTX의 글꼴·일부 도형은 원본과 다를 수 있으며 애니메이션은 재생하지 않습니다. 정확한 원본 모양이 필요하면 PDF 사본을 함께 첨부하세요.

PPTX 미리보기 코드를 고친 경우 Node.js 20 이상에서 `npm ci` 후 `npm run build:preview`로 미리보기 HTML과 CSP 해시를 함께 갱신합니다. 앱 자체는 여전히 빌드 없이 정적 파일로 배포합니다.

## 들어 있는 것

| 파일 | 하는 일 |
|---|---|
| `index.html`, `app.js`, `style.css` 등 | 서재 앱입니다. 빌드 없이 그대로 열립니다. |
| `sw.js`, `manifest.webmanifest`, `icon-*` | 오프라인에서 열기, 휴대폰과 PC에 앱으로 설치하기 |
| `guide.html` | 서재 사용 안내 |
| `manual/` | 사용 설명서(웹·PDF), 화면 캡처 34장, 실습 카드 `practice-1.pkem`·`practice-2.pkem`, 탐색기 연결 도구 |
| `vendor/` | PDF 읽기(pdf.js), Markdown(marked), 안전한 HTML(DOMPurify), 압축(fflate) |

서버에 기록을 받아 두는 기능은 없습니다.

## 함께 쓰면 좋은 것

- [PKOS 자료변환기](https://github.com/legoschool/pkos-fileconverter): 한글, PDF, 블로그 백업 같은 자료에서 글을 꺼내 Markdown으로 만듭니다. [코랩에서 바로 실행](https://colab.research.google.com/github/legoschool/pkos-fileconverter/blob/main/PKOS_%EB%B3%80%ED%99%98%EA%B8%B0.ipynb)할 수 있고 「파일 → 드라이브에 사본 저장」으로 내 사본을 만들 수 있습니다. Windows용은 [릴리스](https://github.com/legoschool/pkos-fileconverter/releases/tag/v0.1.0)에 있습니다.
- [자료변환기 실습 교재](https://legoschool.github.io/pkos-textbook/): 설치부터 변환까지 따라 하는 교재입니다.
- [PKOS 이전판](https://github.com/legoschool/pkos): 구글 드라이브에 저장하는 기록장입니다(2026-09-11 기준). [만든 과정](https://github.com/legoschool/pkos/blob/main/docs/%EB%A7%8C%EB%93%A0%EA%B3%BC%EC%A0%95.md)도 이 저장소에 있습니다.

## 이용 조건

**CC BY-NC 4.0**(저작자표시 · 비영리)을 따릅니다. 학교나 연수처럼 비영리로 쓰는 자리라면 사본을 만들어 고쳐 써도 됩니다. 이때 만든이와 이 저장소 주소를 밝히고 고친 것이 있으면 고쳤다고 적어 주세요. 원문은 [LICENSE](LICENSE), 쉬운 설명은 [LICENSE.ko.md](LICENSE.ko.md)에 있습니다.

`vendor/`의 라이브러리는 각자의 이용 조건을 따릅니다. pdf.js와 DOMPurify는 Apache-2.0, marked와 fflate는 MIT이며 원문은 같은 폴더에 있습니다. PPTX 렌더러(@aiden0z/pptx-renderer 1.3.0, Apache-2.0)와 포함된 라이브러리의 조건·출처는 `vendor/pptx-THIRD_PARTY_NOTICES.md`, `vendor/*-LICENSE`, `vendor/licenses/`에 있습니다.

만든이 · 레고학교 미스터리 (legoschool)


## 2026-10-07 확장 기능 (v32)

- Markdown을 보존하는 블록 편집: 이동·복제·삭제, 제목·목록·할 일·표·코드·접기 등.
- 데이터베이스: 텍스트·숫자·선택·다중 선택·날짜·체크·URL·기록 연결·사칙연산·연결 개수, 표·보드·달력·목록·갤러리·날짜 순 보기, 필터·정렬·CSV. 구조는 .pkem 백업과 Markdown ZIP의 .database.json에 포함됩니다.
- Tesseract.js로 한국어·영어 이미지/PDF OCR. PDF는 한 번에 최대 50쪽.
- Whisper tiny로 음성 파일 전사(한 번에 최대 30분), 설정에서 음성 첨부 후 자동 시작. 결과 검토 후 새 기록으로 저장합니다.
- 다국어 MiniLM 문장 임베딩으로 AI 의미 검색. 모델은 최초 다운로드 후 기기에서 실행하며 기록 원문을 모델 서버로 전송하지 않습니다.
- Google Drive 앱 데이터 공간에 기기별 스냅샷을 저장하고 벡터 시계로 병합합니다. 동시 수정은 결정적인 충돌 사본으로 보존하고 삭제와 오프라인 수정을 구분합니다.
- 구형 PPT는 사용자 버튼으로 Google Slides에 전송·PDF 변환 후 앱 안에서 페이지별로 표시합니다. 임시 Slides는 휴지통으로 이동합니다.

### 별도 설정과 남은 범위

구글 연결에는 OAuth 웹 클라이언트 ID와 승인된 원본 주소가 필요합니다. [설정 안내](cloud-setup.html)를 따르세요. 실제 계정 로그인·PPT 변환 검증은 아직 계정 설정 전입니다. 동기화는 앱이 열리고 로그인 토큰이 유효하며 편집을 마친 동안 동작합니다. 종료 후 동기화·영구 로그인 서버는 없습니다. 단일 기기 75MB / 병합 80MB 제한이 있습니다.

v33에서 중첩 블록·다단·관계 값 집계·확장 수식·로컬 자동화를 추가했습니다. 현재 기능과 남은 범위는 아래 v33 안내 및 앱에서 확인할 수 있습니다.

### 검증

`npm run test:tools`로 병합·삭제·충돌·데이터베이스 이력·Markdown 보존을 검사합니다. tests의 브라우저 시험은 격리된 프로필과 합성 자료만 사용합니다. 실제 모델로 한국어/영어 OCR·음성 전사·한국어 의미 검색을 확인했습니다. 구글 API는 모의 서버로 두 기기 흐름을 검증했으며 실제 OAuth 검증과 구분합니다.

새 도구 빌드: `npm ci --ignore-scripts && npm run build:tools`. 기존 PPTX 빌드: `npm run build:preview`. 모델·런타임 라이선스는 vendor/LOCAL-TOOLS-LICENSES.txt 및 원 배포처를 참조하세요.

## 2026-10-07 PC 블록·데이터베이스 확장 (v33)

- 화면에서 문단·목록 편집, 다중 블록 이동·복제·되돌리기, 중첩 접기·강조 상자·다단·표·수학식·목차·첨부·공유 원본·연결 데이터베이스. 기존 Markdown 보존.
- 표·보드·달력·목록·갤러리·타임라인·차트·로컬 입력 폼, 이름을 붙인 보기, AND/OR 필터·다중 정렬·열 표시/순서/너비·집계.
- 행 페이지·하위 항목·템플릿·파일 속성·일괄 편집·실행 취소/다시 실행, 다른 DB와 양방향 관계 및 값 집계.
- 안전한 수식 파서: 조건·문자·날짜·목록·계산 속성 참조. 행 버튼과 생성/변경 시 실행되는 로컬 규칙.
- 연결된 기록이 포함된 백업의 사본 ID를 함께 재연결하며 1,000행 표의 페이지 이동을 검증했습니다.

전체 Notion 서비스와 동등하지 않습니다. 실시간 공동 편집·팀 권한·외부 연동·서버 예약 자동화·공개 폼·전체 Notion 수식 호환은 미지원입니다. 모바일 확장은 이번 범위에서 제외했습니다. .pkem은 구조를 보존하고 Markdown은 읽을 수 있는 본문으로 펼칩니다.

검증: 단위 검사 63개, 기존 브라우저 회귀 36개, DB 통합 12개 그룹, 블록 통합 11개 그룹, 백업 연결·연결 DB 편집·대용량 페이지 이동. 격리된 브라우저의 가상 데이터로 검사했습니다.

수학식 도구 재생성: `npm ci --ignore-scripts && npm run build:desktop`. KaTeX 0.19.0의 라이선스는 vendor/katex/LICENSE입니다. 최신 안내: [PC 확장 사용 설명서](manual/#new-tools).
