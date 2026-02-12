import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

interface CityRecord {
  id: string
  name: string
  city: string
  province: string
}

let cityData: CityRecord[] | null = null

function getCsvPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'citydata', 'cities.csv')
    : path.join(__dirname, '../resources/citydata/cities.csv')
}

function loadCityData(): CityRecord[] {
  if (cityData) return cityData

  const csvPath = getCsvPath()
  if (!fs.existsSync(csvPath)) {
    console.error('[CityLookup] CSV file not found:', csvPath)
    return []
  }

  const raw = fs.readFileSync(csvPath, 'utf-8')
  const lines = raw.split('\n').slice(1) // skip header

  cityData = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Parse CSV (handle quoted fields)
    const fields = parseCsvLine(trimmed)
    if (fields.length < 6) continue

    cityData.push({
      id: fields[0],
      name: fields[1],
      city: fields[3],
      province: fields[5],
    })
  }

  console.log(`[CityLookup] Loaded ${cityData.length} cities`)
  return cityData
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

export function lookupCity(query: string, maxResults: number = 10): string {
  const data = loadCityData()
  if (data.length === 0) {
    return JSON.stringify({ error: '城市数据未加载' })
  }

  const q = query.trim().toLowerCase()
  if (!q) {
    return JSON.stringify({ error: '请输入城市名称' })
  }

  // Exact match first, then prefix match, then contains match
  const exact: CityRecord[] = []
  const prefix: CityRecord[] = []
  const contains: CityRecord[] = []

  for (const city of data) {
    const name = city.name.toLowerCase()
    if (name === q) {
      exact.push(city)
    } else if (name.startsWith(q)) {
      prefix.push(city)
    } else if (name.includes(q)) {
      contains.push(city)
    }
  }

  const results = [...exact, ...prefix, ...contains].slice(0, maxResults)

  if (results.length === 0) {
    return JSON.stringify({ message: `未找到匹配"${query}"的城市`, results: [] })
  }

  return JSON.stringify({
    count: results.length,
    results: results.map((r) => ({
      cityId: r.id,
      name: r.name,
      city: r.city,
      province: r.province,
    })),
  })
}
