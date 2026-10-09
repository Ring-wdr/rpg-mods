import type { Register } from 'claude-code'

type Outcome = 'ok' | 'miss' | 'sealed'
type Action = { at: number; actor: string; tool: string; command: string; what: string; outcome: Outcome; reason?: string; agentId?: string }
type Ending = { text: string; color: string }

const PANE = 'rpg-battlelog'
const CAPACITY = 500

const WINDOW = '#1a2a9a'
const BORDER = '#e8ecff'
const WHITE = '#ffffff'
const LABEL = '#a8b4f0'
const YELLOW = '#f8d830'
const RED = '#ff6060'
const INK = '#101018'

const TRACK_RGB = 0x101040
const RAIL_RGB = 0x3a4ab8
const OK_RGB = 0xa8b4f0
const WINDOW_RGB = 0xffffff
const INCIDENT_RGB = 0xff6060
const PICK_RGB = 0xf8d830

// 도구 → 전투 커맨드. 없는 도구는 '아이템'.
const COMMANDS: Record<string, string> = {
  Read: '살펴보기',
  NotebookRead: '살펴보기',
  Grep: '훔치기',
  Glob: '훔치기',
  LSP: '훔치기',
  ToolSearch: '훔치기',
  Edit: '공격',
  Write: '공격',
  NotebookEdit: '공격',
  Bash: '마법',
  WebFetch: '소환',
  WebSearch: '소환',
  Agent: '동료 호출',
  Task: '동료 호출',
  Skill: '특기',
  AskUserQuestion: '대화',
}
const ITEM = '아이템'

const COMMAND_COLOR: Record<string, string> = {
  살펴보기: '#c8d0e0',
  훔치기: '#7ee07e',
  공격: '#ff8a65',
  마법: '#c8a8ff',
  소환: '#6fd8e8',
  '동료 호출': '#f8d830',
  특기: '#ff9ed0',
  대화: '#ffffff',
  아이템: '#8fb0ff',
}

const SECRETS: readonly [RegExp, string][] = [
  [/\b((?:api[_-]?key|access[_-]?token|token|secret|password|passwd|pwd)\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s"']+)/gi, '$1•••'],
  [/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1•••'],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-•••'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, 'gh•••'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, 'xox•••'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA•••'],
]

export const mask = (text: string) => SECRETS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text)

export const commandOf = (tool: string) => COMMANDS[tool] ?? ITEM

const oneLine = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

const pad = (n: number) => String(n).padStart(2, '0')
const clockOf = (ms: number) => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const describe = (e: Record<string, unknown>) => {
  for (const field of ['command', 'file_path', 'notebook_path', 'pattern', 'url', 'query', 'description', 'subject', 'skill', 'prompt']) {
    const value = e[field]
    if (typeof value === 'string' && value) return value
  }
  const question = Array.isArray(e.questions) ? (e.questions[0] as { question?: unknown } | undefined)?.question : undefined
  return typeof question === 'string' ? question.split('\n')[0] ?? '' : ''
}

// 작업 폴더 안의 경로는 상대 경로로 줄인다.
export const relative = (text: string, cwd: string) => (cwd && cwd !== '/' ? text.split(`${cwd.replace(/\/+$/, '')}/`).join('') : text)

const reasonOf = (out: { deny?: string; isError?: boolean; result?: unknown }) => {
  if (out.deny) return out.deny
  if (!out.isError) return undefined
  return typeof out.result === 'string' ? out.result : JSON.stringify(out.result ?? '')
}

const base64 = (bytes: Uint8Array) => {
  const native = bytes as Uint8Array & { toBase64?: () => string }
  if (native.toBase64) return native.toBase64()
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const columnOf = (index: number, count: number, width: number) => (count <= width ? index : Math.floor((index * width) / count))

const timeline = (actions: Action[], width: number, window: [number, number] | undefined, pick: number | undefined) => {
  const cells = Array.from({ length: width }, () => ({ glyph: '▁', rgb: RAIL_RGB, rank: 0 }))
  actions.forEach((action, i) => {
    const column = columnOf(i, actions.length, width)
    const [glyph, rgb, rank] =
      i === pick
        ? ['█', PICK_RGB, 4]
        : action.outcome !== 'ok'
          ? ['█', INCIDENT_RGB, 3]
          : window && i >= window[0] && i < window[1]
            ? ['▆', WINDOW_RGB, 2]
            : ['▄', OK_RGB, 1]
    const cell = cells[column]
    if (cell && rank > cell.rank) cells[column] = { glyph, rgb, rank }
  })
  const numbers = cells.flatMap((cell) => [cell.glyph.codePointAt(0) ?? 32, cell.rgb, TRACK_RGB])
  return { columns: width, rows: 1, cells: base64(new Uint8Array(Uint32Array.from(numbers).buffer)) }
}

const resultWord = (outcome: Outcome) => (outcome === 'miss' ? '미스!' : outcome === 'sealed' ? '봉인되었다!' : '')

export const register: Register = (on, options) => {
  const heroName = typeof options.hero_name === 'string' && options.hero_name.trim() ? options.hero_name.trim() : 'Claude'
  const before = typeof options.before === 'number' && options.before >= 1 ? Math.floor(options.before) : 5

  const actions: Action[] = []
  const agents = new Map<string, string>()
  let dropped = 0
  let selected: number | undefined
  let turnActions = 0
  let turnMisses = 0
  let ending: Ending | undefined
  let cwd = ''

  const incidents = () => actions.flatMap((action, i) => (action.outcome === 'ok' ? [] : [i]))
  const misses = () => actions.filter((action) => action.outcome !== 'ok').length

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    cwd = result.cwd
    await $.command.register({ name: 'battlelog', description: '전투 기록: 미스·봉인(오류·거부) 직전 행동 되감기', immediate: true })
    return result
  })

  on('classic.SubagentStart', async ($, e, next) => {
    agents.set(e.agent_id, e.agent_type || '동료')
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    turnActions = 0
    turnMisses = 0
    ending = undefined
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) {
      if (e.reason === 'aborted' || e.isAborted) ending = { text: '도망쳤다…', color: LABEL }
      else if (e.reason === 'error') ending = { text: '전멸했다… 오류로 전투가 끝났다', color: RED }
      else if (e.reason === 'refusal') ending = { text: '행동이 봉인되었다…', color: RED }
      else if (turnActions > 0) {
        ending = { text: `승리! 행동 ${turnActions}회${turnMisses > 0 ? ` · 미스 ${turnMisses}` : ''}`, color: YELLOW }
      }
      $.ui.invalidate('ui.render')
    }
    return result
  })

  on('tool.call', async ($, e, next) => {
    const action: Action = {
      at: await $.clock.now(),
      actor: e.agentId ? (agents.get(e.agentId) ?? '동료') : heroName,
      tool: e.tool,
      command: commandOf(e.tool),
      what: oneLine(relative(mask(describe(e as unknown as Record<string, unknown>)), cwd), 90),
      outcome: 'ok',
      ...(e.agentId ? { agentId: e.agentId } : {}),
    }
    const keep = () => {
      actions.push(action)
      if (actions.length > CAPACITY) {
        actions.shift()
        dropped += 1
      }
      turnActions += 1
      if (action.outcome !== 'ok') turnMisses += 1
      $.ui.invalidate('ui.render')
    }
    try {
      const out = await next(e)
      const reason = reasonOf(out)
      if (out.deny) action.outcome = 'sealed'
      else if (out.isError) action.outcome = 'miss'
      if (reason) action.reason = oneLine(mask(reason), 160)
      keep()
      return out
    } catch (error) {
      action.outcome = 'miss'
      action.reason = oneLine(mask(String(error)), 160)
      keep()
      throw error
    }
  })

  on('command.run', { command: 'battlelog' }, async ($) => {
    selected = undefined
    await $.ui.open({ id: PANE, title: '전투 기록', focus: true, closeOnEscape: true })
    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    const message = (action: Action, isLatest: boolean) =>
      Box({
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Box({
            flexShrink: 0,
            children: [
              Text({
                color: isLatest ? WHITE : LABEL,
                bold: isLatest,
                children: [`${action.actor}의 ${action.command}!`],
              }),
            ],
          }),
          Box({
            flexGrow: 1,
            flexShrink: 1,
            minWidth: 0,
            children: [Text({ color: isLatest ? BORDER : LABEL, wrap: 'truncate-end', children: [`› ${action.what || action.tool}`] })],
          }),
          ...(action.outcome === 'ok'
            ? []
            : [Box({ flexShrink: 0, children: [Text({ color: RED, bold: true, children: [resultWord(action.outcome)] })] })]),
        ],
      })

    const counter = Text({
      color: LABEL,
      children: [`행동 ${actions.length + dropped}${misses() > 0 ? ` · 미스 ${misses()}` : ''} · /battlelog`],
    })

    const latest = actions[actions.length - 1]
    const previous = actions[actions.length - 2]
    const top = ending
      ? latest
        ? message(latest, false)
        : undefined
      : previous
        ? message(previous, false)
        : undefined
    const bottom = ending
      ? Text({ color: ending.color, bold: true, children: [ending.text] })
      : latest
        ? message(latest, true)
        : Text({ color: LABEL, children: ['▶ 명령을 기다리는 중…'] })

    const log = Box({
      flexDirection: 'column',
      backgroundColor: WINDOW,
      paddingX: 1,
      children: [
        Box({
          flexDirection: 'row',
          justifyContent: 'space-between',
          columnGap: 2,
          children: [Box({ flexGrow: 1, flexShrink: 1, minWidth: 0, children: [top ?? Text({ children: [' '] })] }), Box({ flexShrink: 0, children: [counter] })],
        }),
        bottom,
      ],
    })
    const above = await next(e)
    return above ? Box({ flexDirection: 'column', children: [above, log] }) : log
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const redraw = () => $.ui.invalidate('ui.render')
    const list = incidents()
    const pick = list.length === 0 ? undefined : Math.min(selected ?? list.length - 1, list.length - 1)
    const width = Math.max(20, e.props.bodyColumns - 4)

    const fixed = (child: ReturnType<typeof Text>) => Box({ flexShrink: 0, children: [child] })
    const fill = (child: ReturnType<typeof Text>) => Box({ flexGrow: 1, flexShrink: 1, minWidth: 0, children: [child] })

    const badge = (action: Action, isIncident: boolean) =>
      Text({
        bold: true,
        color: INK,
        backgroundColor: isIncident ? RED : (COMMAND_COLOR[action.command] ?? WHITE),
        children: [` ${action.command} `],
      })

    const row = (action: Action, isIncident: boolean) =>
      Box({
        flexDirection: 'row',
        columnGap: 1,
        children: [
          fixed(Text({ dimColor: true, children: [clockOf(action.at)] })),
          fixed(badge(action, isIncident)),
          fixed(Text({ ...(isIncident ? { bold: true } : {}), children: [`${action.agentId ? '↳ ' : ''}${action.actor}`] })),
          fill(Text({ wrap: 'truncate-end', ...(isIncident ? { bold: true } : { dimColor: true }), children: [action.what || action.tool] })),
        ],
      })

    const scrubber = (window: [number, number] | undefined, at: number | undefined) => {
      if (!('Raster' in elements) || actions.length === 0) return []
      const caret = at === undefined ? [] : [Text({ color: YELLOW, bold: true, children: [`${' '.repeat(columnOf(at, actions.length, width))}▲`] })]
      return [elements.Raster({ key: 'timeline', ...timeline(actions, width, window, at) }), ...caret]
    }

    const header = (tag: string, title: string) =>
      Box({
        flexDirection: 'row',
        columnGap: 1,
        children: [
          fixed(Text({ bold: true, color: WHITE, backgroundColor: WINDOW, children: [tag] })),
          fill(Text({ bold: true, wrap: 'truncate-end', children: [title] })),
        ],
      })

    if (pick === undefined) {
      return Box({
        flexDirection: 'column',
        paddingX: 1,
        children: [
          header(' ⚔ 전투 기록 ', `행동 ${actions.length + dropped} · 전멸 없음`),
          Text({ dimColor: true, children: ['미스나 봉인(오류·거부)이 생기면 그 직전 행동을 여기서 되감아 볼 수 있어요. 최근 행동:'] }),
          ...scrubber([Math.max(0, actions.length - before), actions.length], undefined),
          ...actions.slice(-before).map((action) => row(action, false)),
        ],
      })
    }

    const at = list[pick] ?? 0
    const incident = actions[at]
    if (!incident) return next(e)
    const word = incident.outcome === 'sealed' ? '봉인' : '미스'
    return Box({
      flexDirection: 'column',
      paddingX: 1,
      children: [
        header(' ↺ 되감기 ', `전멸 ${pick + 1}/${list.length} · ${incident.actor}의 ${incident.command} ${word}`),
        ...scrubber([Math.max(0, at - before), at], at),
        Text({ dimColor: true, children: [`직전 ${before}개 행동`] }),
        ...actions.slice(Math.max(0, at - before), at).map((action) => row(action, false)),
        Box({
          flexDirection: 'column',
          borderStyle: 'double',
          borderColor: RED,
          paddingX: 1,
          children: [
            fixed(Text({ bold: true, color: WHITE, backgroundColor: RED, children: [' 전멸 장면 '] })),
            row(incident, true),
            Text({ color: RED, wrap: 'wrap', children: [`└ ${incident.reason ?? resultWord(incident.outcome)}`] }),
          ],
        }),
        Box({
          flexDirection: 'row',
          columnGap: 2,
          children: [
            Button({
              key: 'prev',
              label: '◀ 이전 전멸',
              hotkey: 'p',
              dimColor: pick === 0,
              onPress: () => {
                selected = Math.max(0, pick - 1)
                redraw()
              },
            }),
            Button({
              key: 'next',
              label: '다음 전멸 ▶',
              hotkey: 'n',
              dimColor: pick === list.length - 1,
              onPress: () => {
                selected = Math.min(list.length - 1, pick + 1)
                redraw()
              },
            }),
          ],
        }),
      ],
    })
  })
}
