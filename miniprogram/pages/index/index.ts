import {
  loadPublicHomeData,
  loadPublicSearch,
  type PublicDataSource,
} from '../../services/public-data'
import { isLocalFavorite } from '../../services/local-collections'
import type { HomeCarouselItem, SearchResult } from '../../types/local-life'

interface HomeCarouselView extends HomeCarouselItem {
  symbol: string
  isFavorite: boolean
}

interface SearchResultView extends SearchResult {
  isFavorite: boolean
}

interface IndexPageData {
  searchKeyword: string
  hasSearched: boolean
  searchResults: SearchResultView[]
  carouselItems: HomeCarouselView[]
  dataSource: PublicDataSource
  loading: boolean
  loadError: string
}

Page<IndexPageData, WechatMiniprogram.IAnyObject>({
  data: {
    searchKeyword: '',
    hasSearched: false,
    searchResults: [],
    carouselItems: [],
    dataSource: 'local',
    loading: false,
    loadError: '',
  },

  /** 每次回到首页刷新推荐数据，保证审核状态变化后能即时反映。 */
  onShow() {
    this.refreshRecommendations()
  },

  async refreshRecommendations() {
    this.setData({ loading: true, loadError: '' })
    const result = await loadPublicHomeData()
    this.setData({
      carouselItems: result.data.carouselItems.map((item) => ({
        ...item,
        symbol: {
          merchant: '店',
          job: '聘',
          rental: '房',
          offer: '惠',
        }[item.type],
        isFavorite: isLocalFavorite(item.type, item.id),
      })),
      dataSource: result.source,
      loading: false,
      loadError: result.error,
    })
  },

  onSearchInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ searchKeyword: event.detail.value })
  },

  async onSearchConfirm() {
    const keyword = this.data.searchKeyword.trim()
    if (!keyword) {
      this.clearSearch()
      return
    }
    this.setData({ loading: true, loadError: '' })
    const result = await loadPublicSearch(keyword)
    this.setData({
      hasSearched: true,
      searchResults: result.data.map((item) => ({
        ...item,
        isFavorite: isLocalFavorite(item.type, item.id),
      })),
      dataSource: result.source,
      loading: false,
      loadError: result.error,
    })
  },

  clearSearch() {
    this.setData({ searchKeyword: '', hasSearched: false, searchResults: [] })
  },

  goMerchantList() {
    wx.navigateTo({ url: '/pages/merchant-list/index' })
  },

  goRentalList() {
    wx.navigateTo({ url: '/pages/rental-list/index' })
  },

  goRepairList() {
    wx.navigateTo({ url: '/pages/repair-list/index' })
  },

  /** “购”是独立购物零售板块，不再复用到店商家页面状态。 */
  goConvenienceStoreList() {
    wx.navigateTo({ url: '/pages/shopping-list/index' })
  },

  openRecommendation(event: WechatMiniprogram.BaseEvent) {
    this.openEntry(event)
  },

  openSearchResult(event: WechatMiniprogram.BaseEvent) {
    this.openEntry(event)
  },

  openEntry(event: WechatMiniprogram.BaseEvent) {
    const dataset = event.currentTarget.dataset as { id: string; type: string }
    const routeMap: Record<string, string> = {
      merchant: '/pages/merchant-detail/index',
      rental: '/pages/rental-detail/index',
      offer: '/pages/offer-detail/index',
    }
    const route = routeMap[dataset.type]
    if (route) {
      wx.navigateTo({ url: `${route}?id=${dataset.id}` })
    }
  },
})
