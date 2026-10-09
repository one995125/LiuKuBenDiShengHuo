import {
  MERCHANT_BOARD_CONFIGS,
  type MerchantBoardConfig,
  type MerchantBoardShortcut,
} from '../../constants/merchant-taxonomy'
import { isLocalFavorite } from '../../services/local-collections'
import { loadMerchantPage, type PublicDataSource } from '../../services/public-data'
import type { Merchant, MerchantBoard } from '../../types/local-life'

interface MerchantBoardItem extends Merchant {
  isFavorite: boolean
}

function isMerchantBoard(value: string): value is MerchantBoard {
  return value === 'store' || value === 'service' || value === 'shopping'
}

const DEFAULT_CONFIG = MERCHANT_BOARD_CONFIGS.store

Component({
  properties: {
    /** 页面所属板块，只接受 store、service、shopping。 */
    board: { type: String, value: 'store' },
    /** 只有“店”板块对应底部商家导航的激活状态。 */
    activeNav: { type: String, value: '' },
  },

  data: {
    config: DEFAULT_CONFIG as MerchantBoardConfig,
    shortcuts: DEFAULT_CONFIG.shortcuts as readonly MerchantBoardShortcut[],
    selectedLabel: '全部',
    selectedCategory: '',
    selectedSubCategory: '',
    searchKeyword: '',
    hasSearched: false,
    merchants: [] as MerchantBoardItem[],
    dataSource: 'local' as PublicDataSource,
    loading: false,
    loadError: '',
  },

  lifetimes: {
    attached() {
      this.applyBoardConfig()
    },
  },

  pageLifetimes: {
    show() {
      this.refreshList()
    },
  },

  methods: {
    /**
     * 根据页面属性读取固定板块配置。非法值安全回退到“店”，不允许任意分类扩大查询范围。
     */
    applyBoardConfig() {
      const board = isMerchantBoard(this.properties.board) ? this.properties.board : 'store'
      const config = MERCHANT_BOARD_CONFIGS[board]
      const firstShortcut = config.shortcuts[0]
      this.setData({
        config,
        shortcuts: config.shortcuts,
        selectedLabel: firstShortcut.label,
        selectedCategory: firstShortcut.category,
        selectedSubCategory: firstShortcut.subCategory,
      })
    },

    async refreshList() {
      const board = isMerchantBoard(this.properties.board) ? this.properties.board : 'store'
      this.setData({ loading: true, loadError: '' })
      const result = await loadMerchantPage({
        board,
        category: this.data.selectedCategory,
        subCategory: this.data.selectedSubCategory,
        keyword: this.data.searchKeyword,
        pageSize: 20,
      })
      this.setData({
        merchants: result.data.items.map((item) => ({
          ...item,
          isFavorite: isLocalFavorite('merchant', item.id),
        })),
        dataSource: result.source,
        loading: false,
        loadError: result.error,
      })
    },

    onSearchInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
      this.setData({ searchKeyword: event.detail.value })
    },

    onSearchConfirm() {
      const searchKeyword = this.data.searchKeyword.trim()
      if (!searchKeyword) {
        this.clearSearch()
        return
      }
      const firstShortcut = this.data.shortcuts[0]
      this.setData({
        searchKeyword,
        hasSearched: true,
        selectedLabel: firstShortcut.label,
        selectedCategory: firstShortcut.category,
        selectedSubCategory: firstShortcut.subCategory,
      }, () => this.refreshList())
    },

    clearSearch() {
      const firstShortcut = this.data.shortcuts[0]
      this.setData({
        searchKeyword: '',
        hasSearched: false,
        selectedLabel: firstShortcut.label,
        selectedCategory: firstShortcut.category,
        selectedSubCategory: firstShortcut.subCategory,
      }, () => this.refreshList())
    },

    onShortcutTap(event: WechatMiniprogram.BaseEvent) {
      const dataset = event.currentTarget.dataset as MerchantBoardShortcut
      this.setData({
        selectedLabel: dataset.label,
        selectedCategory: dataset.category,
        selectedSubCategory: dataset.subCategory,
        searchKeyword: '',
        hasSearched: false,
      }, () => this.refreshList())
    },

    openDetail(event: WechatMiniprogram.BaseEvent) {
      const id = String(event.currentTarget.dataset.id || '')
      if (id) wx.navigateTo({ url: `/pages/merchant-detail/index?id=${id}` })
    },

    /** 三个商家板块共用持照商家投稿入口，公开归属由审核后的一级分类自动确定。 */
    openSubmission() {
      wx.navigateTo({ url: '/pages/submit-entry/index?type=merchant' })
    },
  },
})
