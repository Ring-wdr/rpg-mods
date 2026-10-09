import { expect, mock, test, type TestBody } from 'claude-code/testing'

type Engine = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]

const RUN = { args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } }

const OPTIONS = { options: { hero_name: 'Claude', before: 2 } }

const band = {
  plugin: 'rpg-battlelog',
  surface: 'terminal' as const,
  component: 'AbovePrompt' as const,
  viewport: { columns: 160, rows: 40 },
  props: { hasSurvey: false, isWorking: true, maxRows: 8, bodyColumns: 150, scroll: { offset: 0, bodyRows: 8 }, view: {} },
}

const pane = {
  plugin: 'rpg-battlelog',
  surface: 'terminal' as const,
  component: 'Pane' as const,
  requestId: 'rpg-battlelog',
  viewport: { columns: 140, rows: 40 },
  props: { title: '전투 기록', isFocused: true, bodyColumns: 120, placement: 'inline' as const, scroll: { offset: 0, bodyRows: 30 }, view: {} },
}

const battle = async ($: Engine, on: On) => {
  const commands: string[] = []
  const clock = mock.clock(on, { now: new Date(2026, 9, 9, 15, 0, 0).getTime() })
  on('command.register', ($, e) => {
    commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  on('session.start', () => ({ cwd: '/work' }))
  on('classic.SubagentStart', () => ({}))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', ($, e) => {
    const command = e.tool === 'Bash' ? e.command : ''
    if (command.includes('fail')) return { result: 'exit 1: test failed', isError: true }
    if (command.includes('push -f')) return { deny: '권한 설정이 막았어요' }
    return { result: 'ok' }
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const bash = async (command: string, agentId?: string) => {
    await clock.advance(1_000)
    return $.tool.call({ tool: 'Bash', command, ...(agentId ? { agentId } : {}) })
  }
  const read = async (file_path: string) => {
    await clock.advance(1_000)
    return $.tool.call({ tool: 'Read', file_path })
  }
  return { commands, clock, bash, read }
}

test('session.start에서 /battlelog를 등록하고 기다리는 메시지를 그린다', OPTIONS, async ($, on) => {
  const { commands } = await battle($, on)
  expect(commands).toEqual(['battlelog'])
  const ui = await $.ui.mount(band)
  expect(await ui.find({ type: 'Text', text: '▶ 명령을 기다리는 중…' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '행동 0 · /battlelog' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
})

test('도구 호출을 전투 커맨드 메시지로 보여준다', OPTIONS, async ($, on) => {
  const { bash, read } = await battle($, on)
  await read('/work/src/app.ts')
  await bash('npm test -- fail')
  const ui = await $.ui.mount(band)
  expect(await ui.find({ type: 'Text', text: 'Claude의 살펴보기!' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '› src/app.ts' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Claude의 마법!' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '› npm test -- fail' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '미스!' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '행동 2 · 미스 1 · /battlelog' })).toBeDefined()
})

test('서브에이전트의 행동은 그 종류 이름으로 기록한다', OPTIONS, async ($, on) => {
  const { bash } = await battle($, on)
  await $.classic.SubagentStart({ agent_id: 'a1', agent_type: 'Explore' })
  await bash('ls', 'a1')
  const ui = await $.ui.mount(band)
  expect(await ui.find({ type: 'Text', text: 'Explore의 마법!' })).toBeDefined()
})

test('턴이 끝나면 승리 메시지를, 중단되면 도망 메시지를 보여준다', OPTIONS, async ($, on) => {
  const { bash } = await battle($, on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await bash('ls')
  await bash('npm test -- fail')
  await $.turn.complete({ turnId: 't1', answer: 'done', durationMs: 10, isAborted: false, reason: 'answer' })
  let ui = await $.ui.mount(band)
  expect(await ui.find({ type: 'Text', text: '승리! 행동 2회 · 미스 1' })).toBeDefined()
  await ui.unmount()

  await $.turn.start({ text: 'again', turnId: 't2' })
  await bash('ls')
  await $.turn.complete({ turnId: 't2', answer: '', durationMs: 10, isAborted: true, reason: 'aborted' })
  ui = await $.ui.mount(band)
  expect(await ui.find({ type: 'Text', text: '도망쳤다…' })).toBeDefined()
})

test('결과를 바꾸지 않고 그대로 돌려준다', OPTIONS, async ($, on) => {
  const { bash } = await battle($, on)
  expect(await bash('ls')).toEqual({ result: 'ok' })
  expect(await bash('npm test -- fail')).toEqual({ result: 'exit 1: test failed', isError: true })
  expect(await bash('git push -f')).toEqual({ deny: '권한 설정이 막았어요' })
})

test('전멸이 없으면 최근 행동을 보여준다', OPTIONS, async ($, on) => {
  const { bash } = await battle($, on)
  await bash('ls')
  await bash('pwd')
  await bash('git status')
  await $.command.run({ command: 'battlelog', ...RUN })
  const ui = await $.ui.mount(pane)
  expect(await ui.find({ type: 'Text', text: '행동 3 · 전멸 없음' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'ls' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'git status' })).toBeDefined()
  expect(await ui.find({ type: 'Raster', key: 'timeline' })).toBeDefined()
})

test('전멸 장면은 최신 것부터 보여주고 이전 장면으로 되감을 수 있다', OPTIONS, async ($, on) => {
  const { bash } = await battle($, on)
  await bash('npm install')
  await bash('npm test -- fail')
  await bash('git add .')
  await bash('git commit -m wip')
  await bash('git push -f origin main')

  await $.command.run({ command: 'battlelog', ...RUN })
  const ui = await $.ui.mount(pane)
  expect(await ui.find({ type: 'Text', text: '전멸 2/2 · Claude의 마법 봉인' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'git commit -m wip' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '└ 권한 설정이 막았어요' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' 전멸 장면 ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '    ▲' })).toBeDefined()

  await ui.press({ key: 'prev' })
  expect(await ui.find({ type: 'Text', text: '전멸 1/2 · Claude의 마법 미스' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '15:00:01' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '└ exit 1: test failed' })).toBeDefined()
})

test('토큰과 비밀번호는 가려서 기록한다', OPTIONS, async ($, on) => {
  const { bash } = await battle($, on)
  await bash('curl -H "Authorization: Bearer abc.def-123" https://api.example.com')
  await bash('API_KEY=sk-ant-1234567890abcdef npm run deploy')
  await $.command.run({ command: 'battlelog', ...RUN })
  const ui = await $.ui.mount(pane)
  expect(await ui.find({ type: 'Text', text: 'curl -H "Authorization: Bearer •••" https://api.example.com' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'API_KEY=••• npm run deploy' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /sk-ant-1234/ })).toBeUndefined()
})
