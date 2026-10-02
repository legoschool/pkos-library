# PKOS · 나의지식서재

흩어진 수업 자료와 그때의 생각을 모아 두고, 연결해 보고, 다시 꺼내 쓰는 개인 기록 서재입니다. 로그인이 없고 기록은 각자의 브라우저 안에 저장됩니다. 이 저장소에는 https://pkos-library.vercel.app 에서 돌고 있는 서재의 파일이 그대로 들어 있습니다.

- 바로 써 보기: [체험 서재](https://pkos-library.vercel.app/?demo=1) (가상 기록 48개) · [내 서재](https://pkos-library.vercel.app/)
- 사용 설명서와 80분 실습: [웹](https://pkos-library.vercel.app/manual/) · [PDF](https://pkos-library.vercel.app/manual/PKOS-manual.pdf)

서재를 쓰기만 할 때는 위 주소를 열면 됩니다. 이 저장소는 **같은 서재를 내 주소로 운영하고 싶을 때** 씁니다.

## 내 주소로 운영하기 (5분)

깃허브 계정만 있으면 됩니다. 설치할 것도, 비용도, 따로 설정할 열쇠도 없습니다.

1. 깃허브에 로그인합니다. 계정이 없으면 https://github.com 에서 가입합니다.
2. 이 저장소 위쪽의 초록색 **Use this template** → **Create a new repository**를 누릅니다.
3. Repository name에 이름을 적고(예: `my-pkos`) **Public**을 고른 뒤 **Create repository**를 누릅니다. 무료 계정은 공개 저장소에서만 사이트를 켤 수 있습니다. 공개 저장소에는 앱 파일만 있고, 내 기록은 올라가지 않습니다.
4. 새 저장소의 **Settings** → 왼쪽 **Pages**로 갑니다. Build and deployment에서 Source는 **Deploy from a branch**, Branch는 **main**과 **/ (root)**를 고르고 **Save**를 누릅니다.
5. 1~2분 뒤 새로 고침하면 같은 화면 위쪽에 주소가 나옵니다. `https://내아이디.github.io/my-pkos/` 모양입니다.
6. 그 주소 끝에 `?demo=1`을 붙여 체험 서재가, `manual/`을 붙여 설명서가 열리는지 확인합니다.

원본이 새 판으로 바뀐 뒤 따라가고 싶다면 1~3단계 대신 **Fork**로 가져갑니다. 나중에 내 저장소 화면의 **Sync fork**를 누르면 새 판을 받습니다.

## 알아 둘 것

- **기록은 주소마다 따로입니다.** 내 주소에서 쓴 기록은 `pkos-library.vercel.app`에서 보이지 않고, 그 반대도 마찬가지입니다. 원래 주소에서 쓰던 기록은 그쪽 「설정 · 백업 → 첨부를 포함한 백업 내보내기」로 받은 `.pkem` 파일을 내 주소의 「백업 파일 가져오기」로 넣어 옮깁니다.
- **백업을 따로 받아 두세요.** 기록은 브라우저 저장 공간에 있으므로 인터넷 사용 기록과 사이트 데이터를 지우면 함께 지워집니다.
- **설명서 속 주소는 원본 주소입니다.** `manual/`의 실습 안내에 나오는 `https://pkos-library.vercel.app`은 내 주소로 바꿔 읽으면 됩니다. 실습 카드의 「원본 열기」는 원본 설명서를 엽니다.
- 받아쓰기만 예외입니다. 브라우저의 음성 인식을 쓰므로 받아쓰는 동안의 말소리는 크롬·엣지를 만든 회사의 음성 서비스에서 처리될 수 있습니다.

## 들어 있는 것

| 파일 | 하는 일 |
|---|---|
| `index.html`, `app.js`, `style.css` 등 | 서재 앱. 빌드 없이 그대로 열립니다 |
| `sw.js`, `manifest.webmanifest`, `icon-*` | 오프라인 열기, 휴대폰·PC에 앱으로 설치 |
| `guide.html` | 서재 사용 안내 |
| `manual/` | 사용 설명서(웹·PDF), 화면 캡처 30장, 실습 카드 `practice-1.pkem`·`practice-2.pkem`, 탐색기 연결 도구 |
| `vendor/` | PDF 읽기(pdf.js), Markdown(marked), 안전한 HTML(DOMPurify), 압축(fflate) |

서버에 기록을 받아 두는 기능은 없습니다. 같은 이유로 원래 서재에 있던 의견 보내기·관리자 화면은 이 저장소에 없습니다.

## 함께 쓰면 좋은 것

- [PKOS 자료변환기](https://github.com/legoschool/pkos-fileconverter): 한글·PDF·블로그 백업 등에서 글을 꺼내 Markdown으로 만듭니다. [코랩에서 바로 실행](https://colab.research.google.com/github/legoschool/pkos-fileconverter/blob/main/PKOS_%EB%B3%80%ED%99%98%EA%B8%B0.ipynb)
- [자료변환기 실습 교재](https://legoschool.github.io/pkos-textbook/)
- [PKOS 이전판](https://github.com/legoschool/pkos): 구글 드라이브에 저장하는 기록장 (2026-09-11 기준)

## 이용 조건

**CC BY-NC 4.0** (저작자표시 · 비영리). 학교·연수처럼 비영리로 쓰는 자리에서는 사본을 만들고 고쳐 써도 됩니다. 만든이와 이 저장소 주소를 밝히고, 고친 것이 있으면 고쳤다고 적어 주세요. 원문은 [LICENSE](LICENSE), 쉬운 설명은 [LICENSE.ko.md](LICENSE.ko.md)에 있습니다.

`vendor/`의 라이브러리는 각자의 이용 조건을 따릅니다. pdf.js와 DOMPurify는 Apache-2.0, marked와 fflate는 MIT이며 원문이 같은 폴더에 있습니다.

만든이 · 레고학교 미스터리 (legoschool)
