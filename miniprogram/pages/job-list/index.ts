import { loadJobPage } from '../../services/public-data'
import { isLocalFavorite } from '../../services/local-collections'
import type { JobPost } from '../../types/local-life'

interface JobListItem extends JobPost {
  isFavorite: boolean
}

const JOB_FILTERS = ['推荐', '最新', '餐饮', '零售'] as const

interface JobListData {
  filters: typeof JOB_FILTERS
  selectedFilter: string
  searchKeyword: string
  jobs: JobListItem[]
  loading: boolean
  loadError: string
}

function decodeQuery(value: string | undefined): string {
  return value ? decodeURIComponent(value) : ''
}

Page<JobListData, WechatMiniprogram.IAnyObject>({
  data: {
    filters: JOB_FILTERS,
    selectedFilter: '推荐',
    searchKeyword: '',
    jobs: [],
    loading: false,
    loadError: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ searchKeyword: decodeQuery(query.keyword) }, () => this.refreshList())
  },

  onShow() {
    this.refreshList()
  },

  /** 搜索结果先由服务层生成，再在页面内完成轻量分类和时间排序。 */
  async refreshList() {
    this.setData({ loading: true, loadError: '' })
    const result = await loadJobPage({
      keyword: this.data.searchKeyword,
      pageSize: 20,
    })
    const all = result.data.items.map((item) => ({
      ...item,
      isFavorite: isLocalFavorite('job', item.id),
    }))
    const filter = this.data.selectedFilter
    let jobs = all

    if (filter === '最新') {
      jobs = [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    } else if (filter === '餐饮' || filter === '零售') {
      jobs = all.filter((item) => item.category === filter)
    }

    this.setData({
      jobs,
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

  openDetail() {
    // 历史源码仅为未来持证后恢复预留，当前页面未注册且不允许继续深链访问。
    wx.showToast({ title: '招聘频道暂未开放', icon: 'none' })
  },
})
