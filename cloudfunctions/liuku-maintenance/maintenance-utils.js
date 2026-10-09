function toTimestamp(value) {
  if (value instanceof Date) return value.getTime()
  if (typeof value !== 'string' || !value) return 0
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T23:59:59+08:00`
    : value.replace(' ', 'T')
  const timestamp = Date.parse(normalized)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function buildMaintenancePatch(document, nowTimestamp) {
  const patch = {}
  if (
    document.status === 'published' &&
    document.validUntil &&
    toTimestamp(document.validUntil) > 0 &&
    toTimestamp(document.validUntil) < nowTimestamp
  ) {
    patch.status = 'expired'
  }
  if (document.isTop && toTimestamp(document.topUntil) > 0 && toTimestamp(document.topUntil) < nowTimestamp) {
    patch.isTop = false
  }
  if (
    document.isFeatured &&
    toTimestamp(document.featuredUntil) > 0 &&
    toTimestamp(document.featuredUntil) < nowTimestamp
  ) {
    patch.isFeatured = false
  }
  return patch
}

module.exports = {
  buildMaintenancePatch,
  toTimestamp,
}
