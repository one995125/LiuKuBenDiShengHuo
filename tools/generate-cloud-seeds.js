const fs = require('fs')
const path = require('path')
const seedData = require('../cloudfunctions/seeds/public-data')

const outputRoot = path.resolve(__dirname, '..', 'cloudfunctions', 'seeds', 'generated')

fs.mkdirSync(outputRoot, { recursive: true })

for (const [collectionName, items] of Object.entries(seedData)) {
  const outputPath = path.join(outputRoot, `${collectionName}.json`)
  fs.writeFileSync(outputPath, `${JSON.stringify(items, null, 2)}\n`, 'utf8')
  console.log(`已生成 ${collectionName}: ${items.length} 条`)
}

