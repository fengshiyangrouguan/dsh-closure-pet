// DSH 设置页：可露希尔桌宠低频配置。
// React 由 client-entry 注入，避免依赖额外运行时。

const STATE_GROUPS = [
  ['idle', 'Idle 闲时'],
  ['sadIdle', 'Sad_Idle 闲时'],
  ['thinkIdle', 'Think_Idle 闲时'],
]

const EVENT_GROUPS = [
  ['credited', '到账'],
  ['peakTime', '峰时'],
  ['valleyTime', '谷时'],
  ['lowBalance', '余额不足'],
  ['turnInterrupted', '对话中断'],
  ['error', '出错'],
  ['toolFail', '工具失败'],
  ['toolSuccess', '工具成功'],
  ['turnEnd', '本轮结束'],
  ['interact', '点击交互'],
]

export function makeSettingsSection(React) {
  const h = React.createElement

  function Field(props) {
    return h('label', { style: { display: 'flex', alignItems: 'center', gap: 12, margin: '10px 0' } },
      h('span', { style: { width: 150, color: 'var(--dsh-text-2, #666)' } }, props.label),
      h('input', {
        type: 'number', value: props.value, min: props.min, step: props.step || 1,
        onChange: (e) => props.onChange(Number(e.target.value)),
        style: { width: 140, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--dsh-border, #ccc)', background: 'transparent', color: 'inherit' },
      }),
      props.hint ? h('span', { style: { fontSize: 12, opacity: 0.65 } }, props.hint) : null,
    )
  }

  function ListEditor(props) {
    const list = Array.isArray(props.value) ? props.value : []
    const update = (next) => props.onChange(next)
    return h('div', { style: { margin: '14px 0 18px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
        h('strong', null, props.title),
        h('button', {
          type: 'button',
          onClick: () => update(list.concat('')),
          style: { border: '1px solid var(--dsh-border, #bbb)', background: 'transparent', color: 'inherit', borderRadius: 6, cursor: 'pointer', padding: '2px 8px' },
        }, '+'),
      ),
      list.length === 0 ? h('div', { style: { fontSize: 12, opacity: 0.6 } }, '空，使用默认文案') : null,
      list.map((text, i) => h('div', { key: i, style: { display: 'flex', gap: 6, marginBottom: 4 } },
        h('input', {
          value: text, placeholder: '输入一条对话',
          onChange: (e) => {
            const next = list.slice()
            next[i] = e.target.value
            update(next)
          },
          style: { flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--dsh-border, #ccc)', background: 'transparent', color: 'inherit' },
        }),
        h('button', {
          type: 'button', onClick: () => update(list.filter((_, j) => j !== i)),
          style: { border: '1px solid var(--dsh-border, #bbb)', background: 'transparent', color: 'inherit', borderRadius: 6, cursor: 'pointer', padding: '2px 8px' },
        }, '−'),
      )),
    )
  }

  return function SettingsSection({ close }) {
    const [settings, setSettings] = React.useState(function () {
      const api = window.__dshClosurePet
      return api && api.settings ? api.settings : {}
    })
    const api = window.__dshClosurePet

    function patch(next) {
      setSettings(Object.assign({}, settings, next))
      if (api && api.setSettings) api.setSettings(next)
    }

    function patchDialogue(key, value) {
      const dialogues = Object.assign({}, settings.dialogues || {})
      dialogues[key] = value
      patch({ dialogues: dialogues })
    }

    if (!api) {
      return h('div', { style: { padding: 24, opacity: 0.7 } }, '桌宠还在启动，请稍后再打开设置。')
    }

    return h('div', { style: { padding: '8px 4px 32px', maxWidth: 720 } },
      h('h2', { style: { margin: '0 0 4px', fontSize: 20 } }, '可露希尔桌宠'),
      h('p', { style: { margin: '0 0 18px', opacity: 0.65, fontSize: 13 } }, '低频配置。大小、透明度、气泡样式仍在右键面板里。'),

      h(Field, {
        label: '余额不足阈值', value: settings.lowThreshold === undefined ? 10 : settings.lowThreshold,
        min: 0, step: 1, onChange: (v) => patch({ lowThreshold: v }), hint: '元',
      }),
      h(Field, {
        label: '闲时对话间隔', value: settings.idleChatterMs === undefined ? 45000 : settings.idleChatterMs,
        min: 0, step: 5000, onChange: (v) => patch({ idleChatterMs: v }), hint: '毫秒；0 = 关闭',
      }),

      h('h3', { style: { margin: '26px 0 4px', fontSize: 16 } }, '闲时对话池（按状态分开）'),
      STATE_GROUPS.map(([key, title]) =>
        h(ListEditor, {
          key: key, title: title,
          value: (settings.dialogues && settings.dialogues[key]) || [],
          onChange: (v) => patchDialogue(key, v),
        })),

      h('h3', { style: { margin: '26px 0 4px', fontSize: 16 } }, '事件对话池（按事件分开）'),
      EVENT_GROUPS.map(([key, title]) =>
        h(ListEditor, {
          key: key, title: title,
          value: (settings.dialogues && settings.dialogues[key]) || [],
          onChange: (v) => patchDialogue(key, v),
        })),

      h('div', { style: { marginTop: 24 } },
        h('button', {
          type: 'button', onClick: close,
          style: { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--dsh-border, #bbb)', background: 'transparent', color: 'inherit', cursor: 'pointer' },
        }, '关闭'),
      ),
    )
  }
}
