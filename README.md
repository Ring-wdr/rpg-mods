<div align="center">

# ⚔️ rpg-mods

**Claude Code를 고전 턴제 JRPG로 개조하는 Claude Code mods**

16비트 시절 파란 메뉴 창, ATB 게이지, 도트 캐릭터를 프롬프트 위에 달아 드려요.

[![Claude Code](https://img.shields.io/badge/Claude_Code-2.1.295%2B-d97757)](https://code.claude.com/docs/en/plugins/mods/overview)
[![mods](https://img.shields.io/badge/mods-2-34c759)](#rpg-팩)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

</div>

```text
╔══════════════════════════════════════════════════════════════════════════════╗
║     ▄▀▄    ▀ Claude     흑마도사 Lv  1  HP  9,554/10,000  MP  69  ████████   ║
║   ▄▀▀▀▀▀▄  ▀                                                                 ║
║    ▀▀▀▀   ▄▀                                                                 ║
║  ▄▀▀▀▀▀▀▀▄ ▀                                                                 ║
║  ▀▀▀▀▀▀▀▀▀ ▀                                                                 ║
║  ▀▀▀▀▀▀▀▀▀   218 G EXP ████████ 다음 297 주간 45% MP 회복 01:30              ║
╚══════════════════════════════════════════════════════════════════════════════╝
 Claude의 살펴보기! › LICENSE                                     행동 1 · /battlelog
 승리! 행동 1회
```

<sub>실제 세션 화면을 글자로 옮긴 거예요. 실제로는 파란 창 안에 색이 들어간 도트 캐릭터가 서 있고, Claude가 응답하는 동안 무기를 휘둘러요.</sub>

## RPG 팩

| | mod | 한 줄 요약 | 명령 |
| :---: | --- | --- | --- |
| 🛡️ | [**rpg-status**](#️-rpg-status-파티-상태창) | HP=컨텍스트, MP=5시간 한도, G=세션 비용, 세션을 넘어 쌓이는 레벨, 서브에이전트 동료 | `/party` |
| 📜 | [**rpg-battlelog**](#-rpg-battlelog-전투-기록) | 도구 호출을 전투 커맨드로 기록하고, 미스·봉인 직전 행동을 되감기 | `/battlelog` |

## 설치

Claude Code 프롬프트에서:

```text
/plugin install rpg-status --marketplace Ring-wdr/rpg-mods
/plugin install rpg-battlelog --marketplace Ring-wdr/rpg-mods
```

마켓플레이스를 추가할지 물으면 `y`, 그다음 설치 범위(사용자 범위가 기본)를 고르면 바로 켜져요. 터미널에서 직접 설치하려면:

```bash
claude plugin marketplace add Ring-wdr/rpg-mods
claude plugin install rpg-status@rpg-mods
claude plugin install rpg-battlelog@rpg-mods
```

`/plugin`에서 `2 mods active · rpg-status, rpg-battlelog`가 보이면 성공이에요.

<details>
<summary>업데이트·삭제</summary>

```bash
claude plugin marketplace update rpg-mods     # 새 버전 목록 받기
claude plugin update rpg-status@rpg-mods      # mod별로 업데이트
claude plugin uninstall rpg-status@rpg-mods   # 삭제
```

업데이트한 뒤에는 `/reload-plugins`를 치거나 세션을 다시 열어야 새 버전이 적용돼요.

</details>

<details>
<summary>설치하지 않고 한 세션만 써보기</summary>

```bash
git clone https://github.com/Ring-wdr/rpg-mods
cd rpg-mods
claude --plugin-dir plugins/rpg-status --plugin-dir plugins/rpg-battlelog
```

</details>

---

## 🛡️ rpg-status: 파티 상태창

프롬프트 위에 파란 상태창이 열리고, 현재 모델의 직업 도트 캐릭터가 서 있어요.

| 표시 | 뜻 |
| --- | --- |
| **HP** | 남은 컨텍스트. 토큰 100개가 HP 1이에요(200K 창이면 최대 2,000, 1M 창이면 10,000). 대화가 길어질수록 깎여요 |
| **MP** | 5시간 한도의 남은 양(0~100). 한도 정보가 없는 API 키 사용자는 `-` |
| **G** | 이번 세션 비용을 API 정가로 환산한 골드. 기본 1달러 = 1,400G(원화와 같아요) |
| **Lv / EXP** | Claude가 쓴 출력 토큰 1개가 EXP 1. 세션을 넘어 쌓이고 최고 Lv 99 |
| **ATB** | 응답하는 동안 게이지가 차오르고, 요청 하나가 끝날 때마다 비었다가 다시 차요. 출력 속도(tok/s)가 빠를수록 빨리 차요. 쉬는 동안은 노랗게 가득 차서 명령을 기다려요 |

**직업은 모델이 정해요.** `/model`로 바꾸면 "전직했다!" 알림이 떠요.

| 모델 | 직업 | 도트 |
| --- | --- | --- |
| Haiku | 시티프 | 초록 두건과 단검 |
| Sonnet | 나이트 | 은빛 투구와 검 |
| Opus | 흑마도사 | 뾰족 모자와 지팡이 |
| Fable | 현자 | 흰 두건과 금빛 지팡이 |
| 그 밖 | 모험가 | 갈색 머리와 검 |

**서브에이전트는 동료가 돼요.** 서브에이전트가 시작되면 `Explore이(가) 파티에 합류했다!` 알림과 함께 상태창에 한 줄이 늘고(최대 4인 파티), 끝나면 빠져요. 동료의 HP는 그 서브에이전트의 컨텍스트, 직업은 그 서브에이전트의 모델이에요.

**이런 순간에 알려줘요.**

- 레벨업: `레벨이 올랐다! Claude Lv 12` 알림과 함께 상태창 아래에 6초 동안 `★ 레벨이 올랐다! ★`
- HP 25% 이하(컨텍스트 75% 이상): HP가 노랗게 바뀌고 `/compact로 여관에서 쉬어 가자`
- `/compact` 후: `여관에서 하룻밤 묵었다. HP가 회복되었다!`
- MP 0(5시간 한도 소진): `MP가 바닥났다… 19:00에 회복`

`/party`를 치면 레벨·HP·MP·골드·EXP·동료를 글로 정리해 보여줘요.

<details>
<summary>설정</summary>

| 설정 | 기본값 | 설명 |
| --- | --- | --- |
| `hero_name` | `Claude` | 주인공 이름 |
| `gold_per_usd` | `1400` | 1달러당 골드 |
| `style` | `window` | `window`는 터미널에서 파란 상태창, `compact`는 한 줄 |

상태창은 창 폭 80칸·높이 8줄 이상에서 나오고, 더 좁으면 한 줄로 바뀌어요. 누적 EXP와 모험 시작일만 Claude Code의 플러그인 저장소(`$.store`)에 남아요.

</details>

---

## 📜 rpg-battlelog: 전투 기록

프롬프트 위 두 줄짜리 메시지 창에 Claude의 행동이 전투 메시지로 흘러가요.

```text
 Claude의 마법! › npm test                                  행동 12 · 미스 1 · /battlelog
 Explore의 훔치기! › TODO
```

| 도구 | 커맨드 |
| --- | --- |
| Read | 살펴보기 |
| Grep · Glob · LSP · ToolSearch | 훔치기 |
| Edit · Write · NotebookEdit | 공격 |
| Bash | 마법 |
| WebFetch · WebSearch | 소환 |
| Agent | 동료 호출 |
| Skill | 특기 |
| AskUserQuestion | 대화 |
| 그 밖(MCP 도구 등) | 아이템 |

- 도구가 오류를 내면 `미스!`, 권한 설정이나 다른 mod에 거부되면 `봉인되었다!`가 붙어요.
- 응답이 끝나면 `승리! 행동 12회 · 미스 1`, 중단하면 `도망쳤다…`, 오류로 끝나면 `전멸했다…`.
- 서브에이전트의 행동은 그 종류 이름(`Explore의 훔치기!`)으로 나와요.
- 작업 폴더 안의 경로는 상대 경로로 줄여서 보여줘요.

`/battlelog`를 치면 **전투 기록 창**이 열려요. 미스나 봉인이 있으면 가장 최근 것부터 **전멸 장면**을 보여주고, 타임라인(미스는 빨강, 고른 장면은 노랑 ▲)과 직전 행동 목록이 함께 나와요. `p`·`n`으로 이전·다음 전멸 장면을 넘겨요.

이번 세션의 도구 호출을 최대 500개 메모리에만 기억하고 파일로 남기지 않아요. `token=`, `password=`, `Bearer`, `sk-`, `ghp_`, `xoxb-`, `AKIA` 형태의 값은 `•••`로 가려요.

<details>
<summary>설정</summary>

| 설정 | 기본값 | 설명 |
| --- | --- | --- |
| `hero_name` | `Claude` | 메인 Claude가 행동할 때 메시지에 나오는 이름 |
| `before` | `5` | 전멸 장면 하나와 함께 보여줄 직전 행동 수 |

</details>

---

## 어디서 보이나요

| 실행 환경 | 화면 |
| --- | --- |
| 터미널 `claude` (VS Code·JetBrains 내장 터미널 포함) | 파란 상태창과 도트 캐릭터, 메시지 창 |
| Claude Desktop 앱 Code 탭 (로컬 세션) | 상태창이 한 줄로 바뀌어요(도트를 그리는 `Raster`가 터미널 전용이에요) |
| VS Code 확장 채팅, `claude -p`, Agent SDK | 화면 없음 |

## 알아두면 좋은 점

> [!CAUTION]
> mod는 샌드박스 없이 내 권한으로 Claude Code 안에서 실행돼요. 어떤 mod든 설치 전에 코드를 읽어보세요. 이 팩은 `$.fs`, `$.process`, `$.http`를 쓰지 않아요. `claude plugin validate plugins/<이름>`의 `calls:` 줄로 직접 확인할 수 있어요.

- 설정은 `/config`에서 바꿔요.
- 둘 다 켜면 프롬프트 위에 10줄 정도가 필요해요.
- 도트 캐릭터와 문구는 이 저장소에서 새로 만든 것이고, 특정 게임의 그림·음악·대사를 가져오지 않았어요.
- Claude Code 2.1.295에서 만들고 테스트했어요. mods API는 릴리스 사이에 바뀔 수 있어요.

## 개발

```bash
claude plugin validate plugins/rpg-status   # 잡는 이벤트·호출 목록, 정적 검사
claude plugin test plugins/rpg-status       # 세션·로그인 없이 테스트
claude --plugin-dir plugins/rpg-status      # 이 폴더에서 바로 띄워보기 (저장하면 다시 불러와요)
```

구조는 [devbrothers-mods](https://github.com/devbrother2024/devbrothers-mods)를 참고했어요.

## 라이선스

[MIT](LICENSE) · 만든 사람 [ringwring](https://github.com/Ring-wdr)
