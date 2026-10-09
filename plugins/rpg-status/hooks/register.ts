import type { Register, SessionMeasureInput } from 'claude-code'

type Job = '시티프' | '나이트' | '흑마도사' | '현자' | '모험가'
type Limit = { kind: string; percentUsed: number; resetsAt?: string }
type Member = { id: string; name: string; model?: string; tokens?: number; atb: number }
type Adventure = { exp: number; since: string }
type Line = { text: string; color?: string; bold?: boolean }

const ADVENTURE = 'adventure'
const MAX_LEVEL = 99
const EXP_STEP = 400
const PARTY_SIZE = 4
const TICK_MS = 250
const LEVEL_UP_MS = 6_000
const HP_PER_TOKEN = 1 / 100
const DEFAULT_WINDOW = 200_000

const WINDOW = '#1a2a9a'
const WINDOW_RGB = 0x1a2a9a
const BORDER = '#e8ecff'
const WHITE = '#ffffff'
const LABEL = '#a8b4f0'
const YELLOW = '#f8d830'
const RED = '#ff6060'
const GAUGE_FILL = '#e8ecff'
const GAUGE_EMPTY = '#3a4ab8'

const PANEL_WIDTH = 80
const PANEL_ROWS = 8
const SPRITE_WIDTH = 12
const GAUGE = 8
const EXP_BAR = 8

// 12×12 도트. 한 칸에 위아래 두 픽셀을 ▀로 겹쳐 그려서 12칸 × 6줄이 된다.
// . 투명 · K 윤곽 · S 피부 · W 흰색 · 1 머리 · 2 몸 · 3 무기 (1·2·3은 직업 색)
const BLADE = {
  idle: [
    '....1111...3',
    '...111111..3',
    '...1SSSS1..3',
    '...SKSSKS..3',
    '....SSSS...3',
    '..22222222S3',
    '.S22222222.K',
    '.S.222222...',
    '...222222...',
    '...11..11...',
    '...11..11...',
    '..KK...KK...',
  ],
  act: [
    '....1111....',
    '...111111...',
    '...1SSSS1...',
    '...KSSKSS...',
    '....SSSS....',
    '...2222222..',
    '3333S222222.',
    '...K222222S.',
    '...222222...',
    '..11....11..',
    '.11......11.',
    '.KK......KK.',
  ],
} as const

const STAFF = {
  idle: [
    '.....1.....W',
    '....111....3',
    '...11111...3',
    '..1111111..3',
    '...SSSS....3',
    '...SKSK...S3',
    '..2222222..3',
    '.222222222.3',
    '.S2222222S.3',
    '.222222222.3',
    '.222222222..',
    '..KK...KK...',
  ],
  act: [
    'W.....1.....',
    '.3...111....',
    '..3.11111...',
    '...S111111..',
    '....SSSS....',
    '....SKSK....',
    '...2222222..',
    '..222222222.',
    '..2222222S..',
    '..222222222.',
    '..222222222.',
    '...KK...KK..',
  ],
} as const

const LOOKS: Record<Job, { sprite: typeof BLADE | typeof STAFF; colors: readonly [number, number, number]; color: string }> = {
  시티프: { sprite: BLADE, colors: [0x48c050, 0x2e7d32, 0xd0d8e8], color: '#7ee07e' },
  나이트: { sprite: BLADE, colors: [0xb8c4d8, 0x3858c8, 0xe8f0ff], color: '#a8c8ff' },
  흑마도사: { sprite: STAFF, colors: [0x30307a, 0x3848b0, 0xb07840], color: '#c8a8ff' },
  현자: { sprite: STAFF, colors: [0xf0f0f8, 0xc83838, 0xf0c838], color: '#ffd8a0' },
  모험가: { sprite: BLADE, colors: [0x8a6a48, 0x707888, 0xc0c8d8], color: WHITE },
}

const comma = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const pad = (n: number) => String(n).padStart(2, '0')
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n))

const clockOf = (iso?: string) => {
  const ms = iso ? Date.parse(iso) : Number.NaN
  if (Number.isNaN(ms)) return undefined
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const jobOf = (model?: string): Job => {
  if (!model) return '모험가'
  if (/haiku/i.test(model)) return '시티프'
  if (/sonnet/i.test(model)) return '나이트'
  if (/opus/i.test(model)) return '흑마도사'
  if (/fable/i.test(model)) return '현자'
  return '모험가'
}

export const expFor = (level: number) => EXP_STEP * (level - 1) ** 2
export const levelOf = (exp: number) => clamp(Math.floor(Math.sqrt(Math.max(0, exp) / EXP_STEP)) + 1, 1, MAX_LEVEL)

// 받침이 있으면 '이', 없으면 '가'. 한글이 아니면 옛 한글판처럼 '이(가)'.
export const subject = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  if (code < 0 || code > 11171) return `${word}이(가)`
  return `${word}${code % 28 === 0 ? '가' : '이'}`
}

const isAdventure = (value: unknown): value is Adventure =>
  typeof value === 'object' && value !== null && typeof (value as Adventure).exp === 'number' && typeof (value as Adventure).since === 'string'

const base64 = (bytes: Uint8Array) => {
  const native = bytes as Uint8Array & { toBase64?: () => string }
  if (native.toBase64) return native.toBase64()
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const spriteCells = (rows: readonly string[], job: Job) => {
  const [one, two, three] = LOOKS[job].colors
  const palette: Record<string, number> = { K: 0x101018, S: 0xf8c890, W: 0xffffff, 1: one, 2: two, 3: three }
  const numbers: number[] = []
  for (let y = 0; y < rows.length; y += 2) {
    for (let x = 0; x < SPRITE_WIDTH; x++) {
      const top = palette[rows[y]?.[x] ?? '.']
      const bottom = palette[rows[y + 1]?.[x] ?? '.']
      if (top === undefined && bottom === undefined) numbers.push(32, WINDOW_RGB, WINDOW_RGB)
      else if (top === undefined) numbers.push(0x2584, bottom ?? WINDOW_RGB, WINDOW_RGB)
      else numbers.push(0x2580, top, bottom ?? WINDOW_RGB)
    }
  }
  return { columns: SPRITE_WIDTH, rows: Math.ceil(rows.length / 2), cells: base64(new Uint8Array(Uint32Array.from(numbers).buffer)) }
}

const gauge = (fill: number, width: number) => {
  const filled = clamp(Math.floor(fill * width), 0, width)
  return { on: '█'.repeat(filled), off: '█'.repeat(width - filled) }
}

export const register: Register = (on, options) => {
  const heroName = typeof options.hero_name === 'string' && options.hero_name.trim() ? options.hero_name.trim() : 'Claude'
  const rate = typeof options.gold_per_usd === 'number' && options.gold_per_usd > 0 ? options.gold_per_usd : 1400
  const style = options.style === 'compact' ? 'compact' : 'window'

  let model: string | undefined
  let usd = 0
  let limits: Limit[] = []
  let contextTokens: number | undefined
  let contextWindow = DEFAULT_WINDOW
  let adventure: Adventure = { exp: 0, since: '' }
  let isWorking = false
  let heroAtb = 1
  let speed = 0
  let frame = 0
  let party: Member[] = []
  let levelUpUntil = 0
  let now = 0
  let timer: { cancel: () => void } | undefined

  const level = () => levelOf(adventure.exp)
  const gold = () => Math.round(usd * rate)
  const limitOf = (kind: string) => limits.find((limit) => limit.kind === kind)

  const hpOf = (tokens: number | undefined) => {
    const max = Math.round(contextWindow * HP_PER_TOKEN)
    const hp = clamp(Math.round((contextWindow - (tokens ?? 0)) * HP_PER_TOKEN), 0, max)
    return { hp, max }
  }

  const mp = () => {
    const five = limitOf('five_hour')
    return five ? clamp(100 - Math.round(five.percentUsed), 0, 100) : undefined
  }

  const advance = () => {
    frame += 1
    const boost = clamp(speed, 0, 150) / 150
    if (isWorking) heroAtb = Math.min(1, heroAtb + 0.08 + 0.17 * boost)
    for (const member of party) member.atb = Math.min(1, member.atb + 0.12)
  }

  const stopTimerIfIdle = () => {
    if (isWorking || party.length > 0) return
    timer?.cancel()
    timer = undefined
  }

  const absorb = (m: Pick<SessionMeasureInput, 'context' | 'rateLimits' | 'cost'>) => {
    limits = [...m.rateLimits]
    contextWindow = m.context.window || contextWindow
    contextTokens = m.context.tokens ?? contextTokens
    if (m.cost) usd = m.cost.usd
  }

  const report = () => {
    const { hp, max } = hpOf(contextTokens)
    const magic = mp()
    const next = level() >= MAX_LEVEL ? '최고 레벨' : `다음 레벨까지 ${comma(expFor(level() + 1) - adventure.exp)}`
    const week = limitOf('seven_day')
    return [
      `⚔ ${heroName} · ${jobOf(model)} · Lv ${level()}`,
      `HP ${comma(hp)}/${comma(max)} (컨텍스트 ${comma(contextTokens ?? 0)}/${comma(contextWindow)} 토큰)`,
      `MP ${magic === undefined ? '-' : `${magic}/100`} (5시간 한도 남은 양)${week ? ` · 주간 ${week.percentUsed}% 사용` : ''}`,
      `G ${comma(gold())} (이번 세션 API 정가 $${usd.toFixed(2)} × ${comma(rate)})`,
      `EXP ${comma(adventure.exp)} · ${next}`,
      party.length > 0 ? `동료 ${party.map((member) => `${member.name}(${jobOf(member.model)})`).join(', ')}` : '동료 없음',
    ].join('\n')
  }

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'party',
      description: '파티 상태: 주인공 레벨·HP·MP·골드와 지금 함께하는 동료(서브에이전트)',
      immediate: true,
    })
    now = await $.clock.now()
    const saved = await $.store.get(ADVENTURE)
    adventure = isAdventure(saved) ? saved : { exp: 0, since: new Date(now).toISOString() }
    absorb(await $.session.usage())
    return result
  })

  on('session.end', async ($, e, next) => {
    timer?.cancel()
    timer = undefined
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    if (e.model) model = e.model
    if (e.source === 'clear') {
      usd = 0
      contextTokens = undefined
      party = []
    }
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    const from = jobOf(model ?? e.from_model)
    model = e.to_model
    const to = jobOf(model)
    if (from !== to) $.ui.toast(`${heroName}은(는) ${to}(으)로 전직했다!`, { timeoutMs: 6000 })
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('classic.PostCompact', async ($, e, next) => {
    $.ui.toast('여관에서 하룻밤 묵었다. HP가 회복되었다!', { timeoutMs: 6000 })
    absorb(await $.session.usage())
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('classic.SubagentStart', async ($, e, next) => {
    if (!party.some((member) => member.id === e.agent_id)) {
      party = [...party, { id: e.agent_id, name: e.agent_type || '동료', atb: 0 }]
      $.ui.toast(`${subject(e.agent_type || '동료')} 파티에 합류했다!`, { timeoutMs: 4000 })
      timer ??= $.clock.every(TICK_MS, () => {
        advance()
        $.ui.invalidate('ui.render')
      })
    }
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    party = party.filter((member) => member.id !== e.agent_id)
    stopTimerIfIdle()
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    isWorking = true
    heroAtb = 0
    timer ??= $.clock.every(TICK_MS, () => {
      advance()
      $.ui.invalidate('ui.render')
    })
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) {
      isWorking = false
      heroAtb = 1
      speed = 0
      stopTimerIfIdle()
      $.ui.invalidate('ui.render')
    }
    return result
  })

  on('turn.step', async function* ($, e, next) {
    const startedAt = await $.clock.now()
    const result = yield* next(e)
    const usage = result.usage
    const at = await $.clock.now()
    now = at
    if (e.agentId) {
      const member = party.find((m) => m.id === e.agentId)
      if (member) {
        member.model = usage?.model ?? e.model
        member.atb = 0
        if (usage) member.tokens = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
      }
    } else {
      model = usage?.model ?? e.model
      heroAtb = 0
      const seconds = (at - startedAt) / 1000
      if (usage?.output_tokens && seconds > 0) speed = usage.output_tokens / seconds
      absorb(await $.session.usage())
    }
    const gained = usage?.output_tokens ?? 0
    if (gained > 0) {
      const saved = await $.store.get(ADVENTURE)
      const base = isAdventure(saved) ? saved : adventure
      adventure = { exp: base.exp + gained, since: base.since || new Date(at).toISOString() }
      await $.store.set(ADVENTURE, adventure)
      const reached = levelOf(adventure.exp)
      if (reached > levelOf(base.exp)) {
        levelUpUntil = at + LEVEL_UP_MS
        $.ui.toast(`레벨이 올랐다! ${heroName} Lv ${reached}`, { timeoutMs: LEVEL_UP_MS })
        $.clock.after(LEVEL_UP_MS, () => $.ui.invalidate('ui.render'))
      }
    }
    $.ui.invalidate('ui.render')
    return result
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    absorb(e)
    $.ui.invalidate('ui.render')
    return result
  })

  on('command.run', { command: 'party' }, async () => ({ text: report() }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    now = await $.clock.now()
    const job = jobOf(model)
    const { hp, max } = hpOf(contextTokens)
    const magic = mp()
    const isCritical = hp <= max / 4
    const isLevelUp = now < levelUpUntil
    const five = limitOf('five_hour')
    const week = limitOf('seven_day')

    const text = (line: Line) =>
      Text({ ...(line.color ? { color: line.color } : {}), ...(line.bold ? { bold: true } : {}), wrap: 'truncate-end', children: [line.text] })
    const cell = (width: number, child: ReturnType<typeof Text>) => Box({ width, flexShrink: 0, children: [child] })

    const atbGauge = (fill: number) => {
      const { on: lit, off } = gauge(fill, GAUGE)
      return Box({
        flexDirection: 'row',
        flexShrink: 0,
        children: [Text({ color: fill >= 1 ? YELLOW : GAUGE_FILL, children: [lit] }), Text({ color: GAUGE_EMPTY, children: [off] })],
      })
    }

    const hpText = (value: number, total: number) =>
      text({ text: `HP ${comma(value).padStart(6)}/${comma(total)}`, color: value <= total / 4 ? YELLOW : WHITE, bold: value <= total / 4 })

    const heroRow = Box({
      flexDirection: 'row',
      columnGap: 1,
      children: [
        cell(10, text({ text: heroName, color: isCritical ? YELLOW : WHITE, bold: true })),
        cell(8, text({ text: job, color: LOOKS[job].color })),
        cell(6, text({ text: `Lv${String(level()).padStart(3)}`, color: WHITE })),
        cell(17, hpText(hp, max)),
        cell(7, text({ text: `MP ${magic === undefined ? '  -' : String(magic).padStart(3)}`, color: magic === 0 ? RED : WHITE, bold: magic === 0 })),
        atbGauge(heroAtb),
      ],
    })

    const shown = party.slice(0, PARTY_SIZE - 1)
    const memberRows = shown.map((member) => {
      const memberJob = jobOf(member.model ?? model)
      const stats = hpOf(member.tokens)
      return Box({
        key: member.id,
        flexDirection: 'row',
        columnGap: 1,
        children: [
          cell(10, text({ text: member.name, color: WHITE })),
          cell(8, text({ text: memberJob, color: LOOKS[memberJob].color })),
          cell(6, text({ text: '동료', color: LABEL })),
          cell(17, hpText(stats.hp, stats.max)),
          cell(7, text({ text: '', color: WHITE })),
          atbGauge(member.atb),
        ],
      })
    })
    const extra = party.length - shown.length

    const footer = (): Line => {
      if (isLevelUp) return { text: `★ 레벨이 올랐다! ${heroName} Lv ${level()} ★`, color: YELLOW, bold: true }
      const reset = clockOf(five?.resetsAt)
      if (magic === 0) return { text: `MP가 바닥났다…${reset ? ` ${reset}에 회복` : ''}`, color: RED, bold: true }
      if (week && week.percentUsed >= 100) return { text: '이번 주 MP가 바닥났다…', color: RED, bold: true }
      if (isCritical) return { text: 'HP가 얼마 남지 않았다! /compact로 여관에서 쉬어 가자', color: YELLOW, bold: true }
      return { text: '' }
    }

    const expRow = () => {
      const lv = level()
      const into = adventure.exp - expFor(lv)
      const span = expFor(lv + 1) - expFor(lv)
      const { on: lit, off } = gauge(lv >= MAX_LEVEL ? 1 : into / span, EXP_BAR)
      return Box({
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Text({ color: YELLOW, bold: true, children: [`${comma(gold())} G`] }),
          Text({ color: LABEL, children: ['EXP'] }),
          Box({ flexDirection: 'row', children: [Text({ color: '#7ee07e', children: [lit] }), Text({ color: GAUGE_EMPTY, children: [off] })] }),
          Text({ color: LABEL, children: [lv >= MAX_LEVEL ? 'MAX' : `다음 ${comma(expFor(lv + 1) - adventure.exp)}`] }),
          ...(week ? [Text({ color: LABEL, children: [`주간 ${week.percentUsed}%`] })] : []),
          ...(five && five.resetsAt && magic !== 0 ? [Text({ color: LABEL, children: [`MP 회복 ${clockOf(five.resetsAt) ?? '-'}`] })] : []),
        ],
      })
    }

    const panel = () => {
      if (!('Raster' in elements)) return undefined
      const { Raster } = elements
      const look = LOOKS[job].sprite
      const pose = isWorking && frame % 2 === 1 ? look.act : look.idle
      const message = footer()
      return Box({
        width: PANEL_WIDTH,
        flexDirection: 'row',
        columnGap: 1,
        borderStyle: 'double',
        borderColor: BORDER,
        backgroundColor: WINDOW,
        paddingX: 1,
        children: [
          Box({ flexShrink: 0, children: [Raster({ key: 'hero', ...spriteCells(pose, job) })] }),
          Box({
            flexDirection: 'column',
            flexGrow: 1,
            justifyContent: 'space-between',
            children: [
              Box({
                flexDirection: 'column',
                children: [
                  heroRow,
                  ...memberRows,
                  ...(extra > 0 ? [text({ text: `… 외 동료 ${extra}명`, color: LABEL })] : []),
                ],
              }),
              ...(message.text ? [text(message)] : []),
              expRow(),
            ],
          }),
        ],
      })
    }

    const line = () =>
      Box({
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Text({ color: WHITE, backgroundColor: WINDOW, bold: true, children: [` ⚔ ${heroName} `] }),
          Text({ color: LOOKS[job].color, children: [job] }),
          Text({ children: [`Lv${level()}`] }),
          Text({ ...(isCritical ? { color: YELLOW, bold: true } : {}), children: [`HP ${comma(hp)}/${comma(max)}`] }),
          Text({ ...(magic === 0 ? { color: RED } : {}), children: [`MP ${magic ?? '-'}`] }),
          Text({ color: YELLOW, children: [`${comma(gold())} G`] }),
          ...(party.length > 0 ? [Text({ dimColor: true, children: [`동료 ${party.length}`] })] : []),
          ...(isLevelUp ? [Text({ color: YELLOW, bold: true, children: ['LEVEL UP!'] })] : []),
        ],
      })

    const fits = e.surface === 'terminal' && e.props.bodyColumns >= PANEL_WIDTH && e.props.maxRows >= PANEL_ROWS
    const status = (style === 'window' && fits ? panel() : undefined) ?? line()
    const below = await next(e)
    return below ? Box({ flexDirection: 'column', children: [status, below] }) : status
  })
}
