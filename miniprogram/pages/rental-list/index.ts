import { loadRentalPage } from '../../services/public-data'
import { isLocalFavorite } from '../../services/local-collections'
import type { RentalPost } from '../../types/local-life'

interface RentalListItem extends RentalPost {
  isFavorite: boolean
}

const RENTAL_FILTERS = ['推荐', '最新', '整租', '单间'] as const

interface RentalListData {
  filters: typeof RENTAL_FILTERS
  selectedFilter: string
  searchKeyword: string
  rentals: RentalListItem[]
  loading: boolean
  loadError: string
}

function decodeQuery(value: string | undefined): string {
  return value ? decodeURIComponent(value) : ''
}

Page<RentalListData, WechatMiniprogram.IAnyObject>({
  data: {
    filters: RENTAL_FILTERS,
    selectedFilter: '推荐',
    searchKeyword: '',
    rentals: [],
    loading: false,
    loadError: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ searchKeyword: decodeQuery(query.keyword) }, () => this.refreshList())
  },

  onShow() {
    this.refreshList()
  },

  async refreshList() {
    this.setData({ loading: true, loadError: '' })
    const result = await loadRentalPage({
      keyword: this.data.searchKeyword,
      pageSize: 20,
    })
    const all = result.data.items.map((item) => ({
      ...item,
      isFavorite: isLocalFavorite('rental', item.id),
    }))
    const filter = this.data.selectedFilter
    let rentals = all

    if (filter === '最新') {
      rentals = [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    } else if (filter === '单间') {
      rentals = all.filter((item) => item.layout.includes('单间'))
    } else if (filter === '整租') {
      rentals = all.filter((item) => !item.layout.includes('单间'))
    }

    this.setData({
      rentals,
      loading: false,
      loadError: result.error,
    })
  },

  onSearchInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ searchKeyword: event.detail.value })
  },

  onSearchConfirm() {
    this.refreshList()
  },

  onFilterTap(event: WechatMiniprogram.BaseEvent) {
    this.setData({
      selectedFilter: String(event.currentTarget.dataset.filter || '推荐'),
    }, () => this.refreshList())
  },

  openDetail(event: WechatMiniprogram.BaseEvent) {
    wx.navigateTo({
      url: `/pages/rental-detail/index?id=${event.currentTarget.dataset.id}`,
    })
  },

  openSubmission() {
    wx.navigateTo({ url: '/pages/submit-entry/index?type=rental' })
  },
})
