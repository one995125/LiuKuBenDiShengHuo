Component({
  properties: {
    value: { type: String, value: '' },
    placeholder: { type: String, value: '搜索商家、电话、招聘、租房' },
  },

  methods: {
    onInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
      this.triggerEvent('input', { value: event.detail.value })
    },
    onConfirm() {
      this.triggerEvent('confirm')
    },
  },
})
