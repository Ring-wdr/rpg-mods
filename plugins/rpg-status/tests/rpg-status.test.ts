import { expect, mock, test, type TestBody } from 'claude-code/testing'

type Engine = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]

const RUN = { args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } }
type Limit = { kind: 'five_hour' | 'seven_day'; percentUsed: number; resetsAt?: string }

const START = new Date(2026, 9, 9, 14, 0).getTime()
const RESET = new Date(2026, 9, 9, 19, 0).toISOString()
const WINDOW = { options: { hero_name: 'Claude', gold_per_usd: 1400, style: 'window' } }
const COMPACT = { options: { ...WINDOW.options, style: 'compact' } }

const band = (surface: 'terminal' | 'desktop' = 'terminal') => ({
  plugin: 'rpg-status',
  surface,
  component: 'AbovePrompt' as const,
  viewport: { columns: 160, rows: 40 },
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 150, scroll: { offset: 0, bodyRows: 20 }, view: {} },
})

const adventure = async ($: Engine, on: On, { exp = 0, limits = [] as Limit[], tokens = 20_000 } = {}) => {
  const commands: string[] = []
  const toasts: string[] = []
  const saved = new Map<string, unknown>([['adventure', { exp, since: '2026-10-01T00:00:00.000Z' }]])
  const clock = mock.clock(on, { now: START })
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', ($, e) => {
    commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('session.usage', () => ({
    value: { startedAt: START, context: { tokens, window: 200_000, percent: Math.round((tokens / 200_000) * 100) }, rateLimits: limits, cost: { usd: 1.5 } },
  }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  on('session.start', () => ({ cwd: '/work' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('classic.SessionStart', () => ({}))
  on('classic.PostModelSwitch', () => ({}))
  on('classic.PostCompact', () => ({}))
  on('classic.SubagentStart', () => ({}))
  on('classic.SubagentStop', () => ({}))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('turn.step', async function* ($, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: 'ok',
      toolUses: [],
      stopReason: 'end_turn',
      usage: { input_tokens: 30_000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: e.model },
    }
  })

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const step = async (model: string, agentId?: string) => {
    const stream = $.turn.step({ turnId: 't1', index: 0, model, messageCount: 1, ...(agentId ? { agentId } : {}) })
    let piece = await stream.next()
    while (piece.done !== true) piece = await stream.next()
  }

  return { commands, toasts, saved, clock, step }
}

test('session.start에서 /party를 등록한다', WINDOW, async ($, on) => {
  const { commands } = await adventure($, on)
  expect(commands).toEqual(['party'])
})

test('상태창에 HP=컨텍스트, MP=5시간 한도, G=세션 비용을 그리고 아래 그림을 지우지 않는다', WINDOW, async ($, on) => {
  await adventure($, on, { limits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: RESET }, { kind: 'seven_day', percentUsed: 31 }] })
  await $.classic.SessionStart({ source: 'startup', model: 'claude-sonnet-5-5' })
  const ui = await $.ui.mount(band())
  expect(await ui.find({ type: 'Raster', key: 'hero' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Claude' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '나이트' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'HP  1,800/2,000' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'MP  58' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '2,100 G' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '주간 31%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'MP 회복 19:00' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
})

test('모델에 따라 직업이 바뀌고 전직하면 알린다', WINDOW, async ($, on) => {
  const { toasts } = await adventure($, on)
  await $.classic.SessionStart({ source: 'startup', model: 'claude-haiku-5-5' })
  let ui = await $.ui.mount(band())
  expect(await ui.find({ type: 'Text', text: '시티프' })).toBeDefined()
  await ui.unmount()
  await $.classic.PostModelSwitch({ from_model: 'claude-haiku-5-5', to_model: 'claude-opus-5-5', requested_model: 'opus' } as never)
  ui = await $.ui.mount(band())
  expect(await ui.find({ type: 'Text', text: '흑마도사' })).toBeDefined()
  expect(toasts).toContain('Claude은(는) 흑마도사(으)로 전직했다!')
})

test('응답이 끝날 때마다 출력 토큰만큼 EXP를 얻고 레벨이 오르면 알린다', WINDOW, async ($, on) => {
  const { saved, toasts, step } = await adventure($, on, { exp: 300 })
  await step('claude-fable-5-1')
  expect(saved.get('adventure')).toEqual({ exp: 800, since: '2026-10-01T00:00:00.000Z' })
  expect(toasts).toEqual(['레벨이 올랐다! Claude Lv 2'])
  const ui = await $.ui.mount(band())
  expect(await ui.find({ type: 'Text', text: '현자' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '★ 레벨이 올랐다! Claude Lv 2 ★' })).toBeDefined()
})

test('서브에이전트가 동료로 합류하고 끝나면 빠진다', WINDOW, async ($, on) => {
  const { toasts, step } = await adventure($, on)
  await $.classic.SubagentStart({ agent_id: 'a1', agent_type: 'Explore' })
  await step('claude-haiku-5-5', 'a1')
  let ui = await $.ui.mount(band())
  expect(toasts).toContain('Explore이(가) 파티에 합류했다!')
  expect(await ui.find({ type: 'Text', text: 'Explore' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '시티프' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'HP  1,700/2,000' })).toBeDefined()
  await ui.unmount()
  await $.classic.SubagentStop({ agent_id: 'a1', agent_type: 'Explore', stop_hook_active: false, agent_transcript_path: '/tmp/a1.jsonl' })
  ui = await $.ui.mount(band())
  expect(await ui.find({ type: 'Text', text: 'Explore' })).toBeUndefined()
})

test('컨텍스트가 75% 넘게 차면 HP가 노랗게 바뀌고 여관을 권한다', WINDOW, async ($, on) => {
  await adventure($, on, { tokens: 160_000 })
  const ui = await $.ui.mount(band())
  expect(await ui.find({ type: 'Text', text: 'HP    400/2,000' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'HP가 얼마 남지 않았다! /compact로 여관에서 쉬어 가자' })).toBeDefined()
})

test('5시간 한도를 다 쓰면 MP가 바닥났다고 알린다', WINDOW, async ($, on) => {
  await adventure($, on, { limits: [{ kind: 'five_hour', percentUsed: 100, resetsAt: RESET }] })
  const ui = await $.ui.mount(band())
  expect(await ui.find({ type: 'Text', text: 'MP   0' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'MP가 바닥났다… 19:00에 회복' })).toBeDefined()
})

test('compact 설정이나 Desktop에서는 한 줄로 그린다', COMPACT, async ($, on) => {
  await adventure($, on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(band(surface))
    expect(await ui.find({ type: 'Raster', key: 'hero' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: ' ⚔ Claude ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'HP 1,800/2,000' })).toBeDefined()
    await ui.unmount()
  }
})

test('/party는 파티 상태를 글로 알려준다', WINDOW, async ($, on) => {
  await adventure($, on, { exp: 1000 })
  const result = await $.command.run({ command: 'party', ...RUN })
  expect(result).toMatchObject({
    text: [
      '⚔ Claude · 모험가 · Lv 2',
      'HP 1,800/2,000 (컨텍스트 20,000/200,000 토큰)',
      'MP - (5시간 한도 남은 양)',
      'G 2,100 (이번 세션 API 정가 $1.50 × 1,400)',
      'EXP 1,000 · 다음 레벨까지 600',
      '동료 없음',
    ].join('\n'),
  })
})
