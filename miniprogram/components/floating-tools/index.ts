import { openCustomerService } from '../../utils/customer-service'

Component({
  properties: {
    entryType: { type: String, value: '' },
    entryId: { type: String, value: '' },
    entryTitle: { type: String, value: '' },
  },

  methods: {
    openCustomer() {
      openCustomerService()
    },

    openFeedback() {
      const params = [
        `entryType=${encodeURIComponent(this.data.entryType)}`,
        `entryId=${encodeURIComponent(this.data.entryId)}`,
        `entryTitle=${encodeURIComponent(this.data.entryTitle)}`,
      ].join('&')
      wx.navigateTo({ url: `/pages/feedback/index?${params}` })
    },
  },
})
